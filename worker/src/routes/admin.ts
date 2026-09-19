import { Hono } from 'hono';
import { Env } from '../types/env';
import { adminAuthMiddleware } from '../middleware/admin-auth';
import { adminRateLimitMiddleware } from '../middleware/rate-limit';
import {
  getAdminPassword,
  getPickupSecret,
  signAdminToken,
  verifyAdminToken,
  verifyPassword
} from '../utils/secret';
import { PARCEL_LIMITS } from '../config/limits';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/config', (c) => {
  return c.json({
    data: {
      name: 'xwshare',
      maxFileSize: PARCEL_LIMITS.MAX_FILE_SIZE,
      expireStyle: ['hour', 'day'],
      openUpload: 1,
      turnstileEnabled: c.env.ENVIRONMENT !== 'development'
    }
  });
});

app.post('/api/admin/login', adminRateLimitMiddleware, async (c) => {
  const secret = getPickupSecret(c.env);
  const adminPassword = getAdminPassword(c.env);
  if (!secret || !adminPassword) {
    return c.json({ error: 'Admin not configured', code: 'SERVER_MISCONFIGURED' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!(await verifyPassword(password, adminPassword, secret))) {
    return c.json({ error: 'Invalid password', code: 'UNAUTHORIZED' }, 401);
  }

  const session = await signAdminToken(secret);
  return c.json({
    data: {
      id: 'admin',
      username: 'admin',
      token: session.token,
      token_type: 'Bearer',
      expires_at: session.expiresAt
    }
  });
});

app.get('/api/admin/me', async (c) => {
  const secret = getPickupSecret(c.env);
  if (!secret) {
    return c.json({ error: 'Admin not configured', code: 'SERVER_MISCONFIGURED' }, 500);
  }
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!(await verifyAdminToken(token, secret))) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
  }
  const exp = Number(token.split('.')[0]);
  return c.json({
    data: {
      id: 'admin',
      username: 'admin',
      token,
      token_type: 'Bearer',
      expires_at: exp
    }
  });
});

app.use('/api/admin/stats', adminAuthMiddleware);
app.use('/api/admin/parcels', adminAuthMiddleware);
app.use('/api/admin/parcels/*', adminAuthMiddleware);

app.get('/api/admin/stats', async (c) => {
  const [total, available, pending, claimed, files, texts, storage, today, yesterday] =
    await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE status != 'DELETED'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE status = 'AVAILABLE'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE status = 'PENDING'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE status = 'CLAIMED'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE type = 'file' AND status != 'DELETED'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM parcels WHERE type IN ('text','markdown') AND status != 'DELETED'`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COALESCE(SUM(file_size), 0) as n FROM parcels WHERE status != 'DELETED'`).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM parcels WHERE status != 'DELETED' AND date(created_at) = date('now')`
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM parcels WHERE status != 'DELETED' AND date(created_at) = date('now', '-1 day')`
      ).first<{ n: number }>()
    ]);

  return c.json({
    data: {
      totalFiles: total?.n || 0,
      activeCount: available?.n || 0,
      pendingCount: pending?.n || 0,
      claimedCount: claimed?.n || 0,
      fileCount: files?.n || 0,
      textCount: texts?.n || 0,
      storageUsed: storage?.n || 0,
      todayCount: today?.n || 0,
      yesterdayCount: yesterday?.n || 0,
      storageBackend: 'r2'
    }
  });
});

app.get('/api/admin/parcels', async (c) => {
  const status = c.req.query('status') || '';
  const allowed = new Set(['PENDING', 'AVAILABLE', 'CLAIMED', 'DELETED']);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50)));
  const offset = Math.max(0, Number(c.req.query('offset') || 0));

  const where = allowed.has(status) ? `WHERE status = ?` : `WHERE status != 'DELETED'`;
  const listSql = `SELECT id, type, title, file_size, status, expires_at, created_at, download_count, max_downloads, burn_after_read, encrypted
    FROM parcels ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as n FROM parcels ${where}`;

  const list = allowed.has(status)
    ? await c.env.DB.prepare(listSql).bind(status, limit, offset).all()
    : await c.env.DB.prepare(listSql).bind(limit, offset).all();
  const count = allowed.has(status)
    ? await c.env.DB.prepare(countSql).bind(status).first<{ n: number }>()
    : await c.env.DB.prepare(countSql).first<{ n: number }>();

  return c.json({
    data: {
      items: list.results || [],
      total: count?.n || 0
    }
  });
});

app.delete('/api/admin/parcels/:id', async (c) => {
  const id = c.req.param('id');
  const parcel = await c.env.DB.prepare(`SELECT file_key, type FROM parcels WHERE id = ?`).bind(id).first<{
    file_key: string | null;
    type: string;
  }>();
  if (!parcel) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  if (parcel.type === 'file' && parcel.file_key) {
    await c.env.BUCKET.delete(parcel.file_key);
  }
  await c.env.DB.prepare(
    `UPDATE parcels SET status = 'DELETED', content = NULL, file_key = NULL, upload_token_hash = NULL WHERE id = ?`
  )
    .bind(id)
    .run();
  return c.json({ data: { success: true } });
});

export { app as adminRouter };
