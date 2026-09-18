import { Hono } from 'hono';
import { Env } from './types/env';
import { corsMiddleware } from './middleware/cors';
import { parcelRouter } from './routes/parcel';
import { adminRouter } from './routes/admin';
import { cleanupExpiredParcels } from './cron/cleanup';
import { errorMessage, logEvent } from './utils/log';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

app.route('/', parcelRouter);
app.route('/', adminRouter);

app.get('/', (c) => c.json({ status: 'ok', service: 'xwshare-worker' }));

app.onError((error, c) => {
  const url = new URL(c.req.url);
  logEvent('error', 'request.unhandled', {
    method: c.req.method,
    path: url.pathname,
    error: errorMessage(error)
  });
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpiredParcels(env));
  }
};
