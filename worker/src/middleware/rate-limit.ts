import { Context, Next } from 'hono';
import { Env } from '../types/env';
import { logEvent } from '../utils/log';

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });

  if (!success) {
    logEvent('warn', 'request.rate_limited', {
      method: c.req.method,
      path: new URL(c.req.url).pathname
    });
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, 429);
  }

  await next();
}
