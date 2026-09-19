import { Context, Hono } from 'hono';
import { Env } from '../types/env';
import { turnstileMiddleware } from '../middleware/turnstile';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { generatePickupCode, hashPickupCode, isValidPickupCode } from '../utils/pickup-code';
import {
  generateOpaqueToken,
  getPickupSecret,
  hmacHex,
  signDownloadToken,
  verifyDownloadToken
} from '../utils/secret';
import { R2Storage } from '../storage/r2';
import { logEvent } from '../utils/log';
import {
  normalizeMaxDownloads,
  validateExpiresIn,
  validateFileMetadata,
  validateOptionalBoolean,
  validateTextContent,
  validateTitle,
  type ParcelValidationError
} from '../utils/parcel-input';

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

function validationResponse(
  c: Context<{ Bindings: Env }>,
  validation: ParcelValidationError
) {
  return c.json({ error: validation.error, code: validation.code }, validation.status);
}

function firstValidationError(
  validations: Array<ParcelValidationError | null>
): ParcelValidationError | null {
  return validations.find((validation): validation is ParcelValidationError => validation !== null) || null;
}

app.post('/api/parcels', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400);
  }
  const { type, content, title, expiresIn, burnAfterRead, maxDownloads, encrypted } = body;

  if (type !== 'text' && type !== 'markdown') {
    logEvent('warn', 'parcel.create.rejected', { reason: 'invalid_type' });
    return c.json({ error: 'Invalid type', code: 'INVALID_TYPE' }, 400);
  }
  const validation = firstValidationError([
    validateTextContent(content),
    validateTitle(title),
    validateExpiresIn(expiresIn),
    validateOptionalBoolean(burnAfterRead, 'burnAfterRead'),
    validateOptionalBoolean(encrypted, 'encrypted')
  ]);
  if (validation) return validationResponse(c, validation);
  const normalizedMaxDownloads = normalizeMaxDownloads(maxDownloads);
  if (typeof normalizedMaxDownloads !== 'number') {
    return validationResponse(c, normalizedMaxDownloads);
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
      normalizedMaxDownloads,
      burnAfterRead ? 1 : 0,
      encrypted ? 1 : 0,
      ipHash
    )
    .run();

  logEvent('info', 'parcel.create.success', {
    parcelId: id,
    type,
    encrypted: Boolean(encrypted)
  });

  return c.json({ data: { code, expiresAt } });
});

app.post('/api/parcels/upload', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400);
  }
  const { fileName, fileSize, contentType, expiresIn, burnAfterRead, maxDownloads, encrypted } = body;
  const validation = firstValidationError([
    validateFileMetadata(fileName, fileSize, contentType),
    validateExpiresIn(expiresIn),
    validateOptionalBoolean(burnAfterRead, 'burnAfterRead'),
    validateOptionalBoolean(encrypted, 'encrypted')
  ]);
  if (validation) return validationResponse(c, validation);
  const normalizedMaxDownloads = normalizeMaxDownloads(maxDownloads);
  if (typeof normalizedMaxDownloads !== 'number') {
    return validationResponse(c, normalizedMaxDownloads);
  }

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
      normalizedMaxDownloads,
      burnAfterRead ? 1 : 0,
      encrypted ? 1 : 0,
      ipHash,
      uploadTokenHash
    )
    .run();

  logEvent('info', 'parcel.upload.registered', {
    parcelId: id,
    encrypted: Boolean(encrypted),
    fileSize: Number(fileSize) || 0
  });

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

  const parcel: {
    status: string;
    upload_token_hash: string | null;
    file_size: number;
  } | null = await c.env.DB.prepare(
    `SELECT status, upload_token_hash, file_size FROM parcels WHERE file_key = ?`
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

  if (!c.req.raw.body) {
    return c.json({ error: 'Missing upload body', code: 'INVALID_UPLOAD_BODY' }, 400);
  }

  const contentLengthRaw = c.req.header('Content-Length');
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw);
    if (!Number.isSafeInteger(contentLength) || contentLength !== parcel.file_size) {
      return c.json({ error: 'Upload size mismatch', code: 'UPLOAD_SIZE_MISMATCH' }, 400);
    }
  }

  const claimHash = await hmacHex(`claim:${generateOpaqueToken()}`, secret);
  const claim = await c.env.DB.prepare(
    `UPDATE parcels SET upload_token_hash = ? WHERE file_key = ? AND status = 'PENDING' AND upload_token_hash = ?`
  )
    .bind(claimHash, fileKey, tokenHash)
    .run();
  if (!claim.success || claim.meta.changes === 0) {
    return c.json({ error: 'Upload token already used', code: 'UPLOAD_TOKEN_USED' }, 409);
  }

  try {
    const uploaded = await c.env.BUCKET.put(fileKey, c.req.raw.body, {
      httpMetadata: { contentType: c.req.header('Content-Type') || 'application/octet-stream' }
    });
    if (!uploaded || uploaded.size !== parcel.file_size) {
      await c.env.BUCKET.delete(fileKey);
      await c.env.DB.prepare(
        `UPDATE parcels SET upload_token_hash = ? WHERE file_key = ? AND status = 'PENDING' AND upload_token_hash = ?`
      )
        .bind(tokenHash, fileKey, claimHash)
        .run();
      return c.json({ error: 'Upload size mismatch', code: 'UPLOAD_SIZE_MISMATCH' }, 400);
    }
    await c.env.DB.prepare(
      `UPDATE parcels SET upload_token_hash = NULL WHERE file_key = ? AND status = 'PENDING' AND upload_token_hash = ?`
    )
      .bind(fileKey, claimHash)
      .run();
  } catch (error) {
    await c.env.DB.prepare(
      `UPDATE parcels SET upload_token_hash = ? WHERE file_key = ? AND status = 'PENDING' AND upload_token_hash = ?`
    )
      .bind(tokenHash, fileKey, claimHash)
      .run();
    throw error;
  }

  return c.json({ data: { success: true } });
});

app.post('/api/parcels/confirm-upload', async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) return c.json(missingSecret(), 500);

  const body = await c.req.json().catch(() => null);
  const code = body && typeof body === 'object' ? (body as any).code : undefined;
  if (!isValidPickupCode(code)) {
    return c.json({ error: 'Invalid pickup code', code: 'INVALID_CODE' }, 400);
  }
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

  const body = await c.req.json().catch(() => null);
  const code = body && typeof body === 'object' ? (body as any).code : undefined;
  if (!isValidPickupCode(code)) {
    return c.json({ error: 'Invalid pickup code', code: 'INVALID_CODE' }, 400);
  }
  const hash = await hashPickupCode(code, secret);

  const parcel: any = await c.env.DB.prepare(`SELECT * FROM parcels WHERE pickup_code_hash = ?`)
    .bind(hash)
    .first();
  if (!parcel) {
    logEvent('warn', 'parcel.pickup.rejected', { reason: 'not_found' });
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  if (parcel.status === 'PENDING') {
    logEvent('warn', 'parcel.pickup.rejected', { parcelId: parcel.id, reason: 'not_ready' });
    return c.json({ error: 'Upload not finished', code: 'NOT_READY' }, 403);
  }

  if (parcel.status !== 'AVAILABLE') {
    logEvent('warn', 'parcel.pickup.rejected', { parcelId: parcel.id, reason: 'unavailable' });
    return c.json({ error: 'Parcel no longer available', code: 'UNAVAILABLE' }, 403);
  }

  if (new Date(parcel.expires_at) < new Date()) {
    logEvent('warn', 'parcel.pickup.rejected', { parcelId: parcel.id, reason: 'expired' });
    return c.json({ error: 'Parcel expired', code: 'EXPIRED' }, 403);
  }

  if (parcel.burn_after_read === 1) {
    const result = await c.env.DB.prepare(
      `UPDATE parcels SET status = 'CLAIMED' WHERE id = ? AND status = 'AVAILABLE'`
    )
      .bind(parcel.id)
      .run();
    if (!result.success || result.meta.changes === 0) {
      logEvent('warn', 'parcel.pickup.rejected', { parcelId: parcel.id, reason: 'already_claimed' });
      return c.json({ error: 'Already claimed', code: 'CLAIMED' }, 403);
    }
    await c.env.DB.prepare(`UPDATE parcels SET download_count = download_count + 1 WHERE id = ?`)
      .bind(parcel.id)
      .run();
  } else if (parcel.max_downloads > 0) {
    const result = await c.env.DB.prepare(
      `UPDATE parcels
       SET download_count = download_count + 1
       WHERE id = ? AND status = 'AVAILABLE' AND download_count < max_downloads`
    )
      .bind(parcel.id)
      .run();
    if (!result.success || result.meta.changes === 0) {
      logEvent('warn', 'parcel.pickup.rejected', { parcelId: parcel.id, reason: 'max_downloads' });
      return c.json({ error: 'Max downloads reached', code: 'MAX_DOWNLOADS' }, 403);
    }
  } else {
    await c.env.DB.prepare(`UPDATE parcels SET download_count = download_count + 1 WHERE id = ?`)
      .bind(parcel.id)
      .run();
  }

  if (parcel.type === 'file') {
    const storage = new R2Storage(requestOrigin(c), c.env.BUCKET);
    const downloadToken = await signDownloadToken(parcel.file_key, secret);
    const downloadUrl = await storage.getDownloadUrl(parcel.file_key, downloadToken);

    logEvent('info', 'parcel.pickup.success', {
      parcelId: parcel.id,
      type: parcel.type,
      burnAfterRead: parcel.burn_after_read === 1
    });

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

  logEvent('info', 'parcel.pickup.success', {
    parcelId: parcel.id,
    type: parcel.type,
    burnAfterRead: parcel.burn_after_read === 1
  });

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
