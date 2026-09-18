import { Hono } from 'hono';
import { Env } from '../types/env';
import { turnstileMiddleware } from '../middleware/turnstile';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { generatePickupCode, hashPickupCode } from '../utils/pickup-code';
import { R2Storage } from '../storage/r2';

const app = new Hono<{ Bindings: Env }>();

function getExpiresAt(expiresIn: string): string {
  const now = new Date();
  if (expiresIn === '1h') now.setHours(now.getHours() + 1);
  else if (expiresIn === '7d') now.setDate(now.getDate() + 7);
  else now.setDate(now.getDate() + 1); // 1d default
  return now.toISOString();
}

app.post('/api/parcels', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const body = await c.req.json();
  const { type, content, title, expiresIn, burnAfterRead, maxDownloads } = body;
  
  if (type !== 'text' && type !== 'markdown') {
    return c.json({ error: 'Invalid type', code: 'INVALID_TYPE' }, 400);
  }
  
  const code = generatePickupCode();
  const hash = await hashPickupCode(code, c.env.PICKUP_CODE_SECRET || 'secret');
  const id = crypto.randomUUID();
  const expiresAt = getExpiresAt(expiresIn);
  
  const ip = c.req.header('CF-Connecting-IP') || '';
  
  await c.env.DB.prepare(
    `INSERT INTO parcels (id, pickup_code_hash, type, title, content, expires_at, max_downloads, burn_after_read, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, hash, type, title || '', content || '', expiresAt, maxDownloads || 0, burnAfterRead ? 1 : 0, ip
  ).run();
  
  return c.json({ data: { code, expiresAt } });
});

app.post('/api/parcels/upload', rateLimitMiddleware, turnstileMiddleware, async (c) => {
  const body = await c.req.json();
  const { fileName, fileSize, contentType, expiresIn, burnAfterRead, maxDownloads } = body;
  
  const code = generatePickupCode();
  const hash = await hashPickupCode(code, c.env.PICKUP_CODE_SECRET || 'secret');
  const id = crypto.randomUUID();
  const expiresAt = getExpiresAt(expiresIn);
  const ip = c.req.header('CF-Connecting-IP') || '';
  
  const fileKey = `files/${id}/${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  await c.env.DB.prepare(
    `INSERT INTO parcels (id, pickup_code_hash, type, title, file_key, file_size, mime_type, expires_at, max_downloads, burn_after_read, status, ip_hash)
     VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)`
  ).bind(
    id, hash, fileName, fileKey, fileSize, contentType, expiresAt, maxDownloads || 0, burnAfterRead ? 1 : 0, ip
  ).run();
  
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const storage = new R2Storage(origin, c.env.BUCKET);
  const uploadInstructions = await storage.createUploadUrl(fileKey, contentType, fileSize);
  
  return c.json({ data: { code, fileKey, uploadUrl: uploadInstructions.url, expiresAt } });
});

app.put('/api/upload/:fileKey{.*}', async (c) => {
  const fileKey = decodeURIComponent(c.req.param('fileKey'));
  // Stream to R2
  if (c.req.raw.body) {
    await c.env.BUCKET.put(fileKey, c.req.raw.body, {
      httpMetadata: { contentType: c.req.header('Content-Type') || 'application/octet-stream' }
    });
  }
  return c.json({ data: { success: true } });
});

app.post('/api/parcels/confirm-upload', async (c) => {
  const { code } = await c.req.json();
  const hash = await hashPickupCode(code, c.env.PICKUP_CODE_SECRET || 'secret');
  
  await c.env.DB.prepare(`UPDATE parcels SET status = 'AVAILABLE' WHERE pickup_code_hash = ? AND status = 'AVAILABLE'`).bind(hash).run();
  
  return c.json({ data: { success: true } });
});

app.post('/api/pickup', rateLimitMiddleware, async (c) => {
  const { code } = await c.req.json();
  const hash = await hashPickupCode(code, c.env.PICKUP_CODE_SECRET || 'secret');
  
  const parcel: any = await c.env.DB.prepare(`SELECT * FROM parcels WHERE pickup_code_hash = ?`).bind(hash).first();
  if (!parcel) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
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
    const result = await c.env.DB.prepare(`UPDATE parcels SET status = 'CLAIMED' WHERE id = ? AND status = 'AVAILABLE'`).bind(parcel.id).run();
    if (!result.success || result.meta.changes === 0) {
      return c.json({ error: 'Already claimed', code: 'CLAIMED' }, 403);
    }
  }
  
  await c.env.DB.prepare(`UPDATE parcels SET download_count = download_count + 1 WHERE id = ?`).bind(parcel.id).run();
  
  if (parcel.type === 'file') {
    const url = new URL(c.req.url);
    const origin = `${url.protocol}//${url.host}`;
    const storage = new R2Storage(origin, c.env.BUCKET);
    const downloadUrl = await storage.getDownloadUrl(parcel.file_key);
    
    return c.json({
      data: {
        type: parcel.type,
        title: parcel.title,
        downloadUrl,
        fileSize: parcel.file_size,
        mimeType: parcel.mime_type,
        expiresAt: parcel.expires_at
      }
    });
  }
  
  return c.json({
    data: {
      type: parcel.type,
      title: parcel.title,
      content: parcel.content,
      expiresAt: parcel.expires_at
    }
  });
});

app.get('/api/download-file/:fileKey{.*}', async (c) => {
  const fileKey = decodeURIComponent(c.req.param('fileKey'));
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
