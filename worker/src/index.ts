import { Hono } from 'hono';
import { Env } from './types/env';
import { corsMiddleware } from './middleware/cors';
import { parcelRouter } from './routes/parcel';
import { adminRouter } from './routes/admin';
import { cleanupExpiredParcels } from './cron/cleanup';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

app.route('/', parcelRouter);
app.route('/', adminRouter);

app.get('/', (c) => c.json({ status: 'ok', service: 'xwshare-worker' }));

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpiredParcels(env));
  }
};
