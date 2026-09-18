import { Hono } from 'hono';
import { Env } from '../types/env';
import { turnstileMiddleware } from '../middleware/turnstile';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { generatePickupCode, hashPickupCode } from '../utils/pickup-code';
import {
  generateOpaqueToken,
  getPickupSecret,
  hmacHex,
  signDownloadToken,
  verifyDownloadToken
} from '../utils/secret';
import { R2Storage } from '../storage/r2';

const app = new Hono<{ Bindings: Env }>();

function getExpiresAt(expiresIn: string): string {
  const now = new Date();
  if (expiresIn === '1h') now.setHours(now.getHours() + 1);
  else if (expiresIn === '7d') now.setDate(now.getDate() + 7);
  else now.setDate(now.getDate() + 1);
  return now.toISOString();
}

function requestOrigin(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function missingSecret() {
  return { error: 'Pickup secret not configured', code: 'SERVER_MISCONFIGURED' } as const;
}

app.post('/api/parcels', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const body = await c.req.json();
  const { type, content, title, expiresIn, burnAfterRead, maxDownloads, encrypted } = body;

  if (type !== 'text' && type !== 'markdown') {
    return c.json({ error: 'Invalid type', code: 'INVALID_TYPE' }, 400);
  }

  const code = generatePickupCode();
  const hash = await hashPickupCode(code, secret);
  const id = crypto.randomUUID();
  const expiresAt = getExpiresAt(expiresIn);
  const ip = c.req.header('CF-Connecting-IP') || '';
  const ipHash = ip ? await hmacHex(ip, secret) : '';

  await c.env.DB.prepare(
    `INSERT INTO parcels (id, pickup_code_hash, type, title, content, expires_at, max_downloads, burn_after_read, encrypted, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      hash,
      type,
      title || '',
      content || '',
      expiresAt,
      maxDownloads || 0,
      burnAfterRead ? 1 : 0,
      encrypted ? 1 : 0,
      ipHash
    )
    .run();

  return c.json({ data: { code, expiresAt } });
});

app.post('/api/parcels/upload', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const body = await c.req.json();
  const { fileName, fileSize, contentType, expiresIn, burnAfterRead, maxDownloads, encrypted } = body;

  const code = generatePickupCode();
  const hash = await hashPickupCode(code, secret);
  const id = crypto.randomUUID();
  const expiresAt = getExpiresAt(expiresIn);
  const ip = c.req.header('CF-Connecting-IP') || '';
  const ipHash = ip ? await hmacHex(ip, secret) : '';
  const fileKey = `files/${id}/${String(fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const uploadToken = generateOpaqueToken();
  const uploadTokenHash = await hmacHex(uploadToken, secret);

  await c.env.DB.prepare(
    `INSERT INTO parcels (id, pickup_code_hash, type, title, file_key, file_size, mime_type, expires_at, max_downloads, burn_after_read, encrypted, status, ip_hash, upload_token_hash)
     VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  )
    .bind(
      id,
      hash,
      fileName,
      fileKey,
      fileSize,
      contentType,
      expiresAt,
      maxDownloads || 0,
      burnAfterRead ? 1 : 0,
      encrypted ? 1 : 0,
      ipHash,
      uploadTokenHash
    )
    .run();

  const storage = new R2Storage(requestOrigin(c), c.env.BUCKET);
  const uploadInstructions = await storage.createUploadUrl(fileKey, contentType, fileSize);

  return c.json({
    data: {
      code,
      fileKey,
      uploadUrl: uploadInstructions.url,
      uploadToken,
      expiresAt
    }
  });
});

app.put('/api/upload/:fileKey{.*}', async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const fileKey = decodeURIComponent(c.req.param('fileKey'));
  const token = c.req.header('x-upload-token') || '';
  if (!token) {
    return c.json({ error: 'Missing upload token', code: 'MISSING_UPLOAD_TOKEN' }, 401);
  }

  const parcel: { status: string; upload_token_hash: string | null } | null = await c.env.DB.prepare(
    `SELECT status, upload_token_hash FROM parcels WHERE file_key = ?`
  )
    .bind(fileKey)
    .first();

  if (!parcel || parcel.status !== 'PENDING' || !parcel.upload_token_hash) {
    return c.json({ error: 'Upload not allowed', code: 'UPLOAD_FORBIDDEN' }, 403);
  }

  const tokenHash = await hmacHex(token, secret);
  if (tokenHash !== parcel.upload_token_hash) {
    return c.json({ error: 'Invalid upload token', code: 'INVALID_UPLOAD_TOKEN' }, 403);
  }

  if (c.req.raw.body) {
    await c.env.BUCKET.put(fileKey, c.req.raw.body, {
      httpMetadata: { contentType: c.req.header('Content-Type') || 'application/octet-stream' }
    });
  }

  return c.json({ data: { success: true } });
});

app.post('/api/parcels/confirm-upload', async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const { code } = await c.req.json();
  const hash = await hashPickupCode(code, secret);
  const parcel: { id: string; file_key: string | null; status: string } | null = await c.env.DB.prepare(
    `SELECT id, file_key, status FROM parcels WHERE pickup_code_hash = ?`
  )
    .bind(hash)
    .first();

  if (!parcel || parcel.status !== 'PENDING' || !parcel.file_key) {
    return c.json({ error: 'Nothing to confirm', code: 'CONFIRM_FAILED' }, 409);
  }

  const storage = new R2Storage(requestOrigin(c), c.env.BUCKET);
  if (!(await storage.exists(parcel.file_key))) {
    return c.json({ error: 'File not uploaded', code: 'UPLOAD_INCOMPLETE' }, 409);
  }

  const result = await c.env.DB.prepare(
    `UPDATE parcels SET status = 'AVAILABLE', upload_token_hash = NULL WHERE id = ? AND status = 'PENDING'`
  )
    .bind(parcel.id)
    .run();

  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Nothing to confirm', code: 'CONFIRM_FAILED' }, 409);
  }

  return c.json({ data: { success: true } });
});

app.post('/api/pickup', rateLimitMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const { code } = await c.req.json();
  const hash = await hashPickupCode(code, secret);

  const parcel: any = await c.env.DB.prepare(`SELECT * FROM parcels WHERE pickup_code_hash = ?`)
    .bind(hash)
    .first();
  if (!parcel) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  if (parcel.status === 'PENDING') {
    return c.json({ error: 'Upload not finished', code: 'NOT_READY' }, 403);
  }

  if (parcel.status !== 'AVAILABLE') {
    return c.json({ error: 'Parcel no longer available', code: 'UNAVAILABLE' }, 403);
  }

  if (new Date(parcel.expires_at) < new Date()) {
    return c.json({ error: 'Parcel expired', code: 'EXPIRED' }, 403);
  }

  if (parcel.max_downloads > 0 && parcel.download_count >= parcel.max_downloads) {
    return c.json({ error: 'Max downloads reached', code: 'MAX_DOWNLOADS' }, 403);
  }

  if (parcel.burn_after_read === 1) {
    const result = await c.env.DB.prepare(
      `UPDATE parcels SET status = 'CLAIMED' WHERE id = ? AND status = 'AVAILABLE'`
    )
      .bind(parcel.id)
      .run();
    if (!result.success || result.meta.changes === 0) {
      return c.json({ error: 'Already claimed', code: 'CLAIMED' }, 403);
    }
  }

  await c.env.DB.prepare(`UPDATE parcels SET download_count = download_count + 1 WHERE id = ?`)
    .bind(parcel.id)
    .run();

  if (parcel.type === 'file') {
    const storage = new R2Storage(requestOrigin(c), c.env.BUCKET);
    const downloadToken = await signDownloadToken(parcel.file_key, secret);
    const downloadUrl = await storage.getDownloadUrl(parcel.file_key, downloadToken);

    return c.json({
      data: {
        type: parcel.type,
        title: parcel.title,
        downloadUrl,
        fileName: parcel.title,
        fileSize: parcel.file_size,
        mimeType: parcel.mime_type,
        expiresAt: parcel.expires_at,
        burnAfterRead: parcel.burn_after_read === 1,
        encrypted: parcel.encrypted === 1
      }
    });
  }

  return c.json({
    data: {
      type: parcel.type,
      title: parcel.title,
      content: parcel.content,
      expiresAt: parcel.expires_at,
      burnAfterRead: parcel.burn_after_read === 1,
      encrypted: parcel.encrypted === 1
    }
  });
});

app.get('/api/download-file/:fileKey{.*}', async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const fileKey = decodeURIComponent(c.req.param('fileKey'));
  const token = c.req.query('token') || '';
  if (!(await verifyDownloadToken(fileKey, token, secret))) {
    return c.json({ error: 'Download token required', code: 'DOWNLOAD_FORBIDDEN' }, 403);
  }

  const object = await c.env.BUCKET.get(fileKey);
  if (!object) {
    return c.text('Not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  const filename = fileKey.split('/').pop() || 'file';
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(object.body as any, {
    headers
  });
});

export { app as parcelRouter };
