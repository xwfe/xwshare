import { Context, Next } from 'hono';
import { Env } from '../types/env';
import { logEvent } from '../utils/log';

type RateLimitBinding = 'RATE_LIMITER' | 'ADMIN_RATE_LIMITER';

async function enforceRateLimit(
  c: Context<{ Bindings: Env }>,
  next: Next,
  binding: RateLimitBinding,
  scope: string
) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const { success } = await c.env[binding].limit({ key: ip });

  if (!success) {
    logEvent('warn', 'request.rate_limited', {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      scope
    });
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, 429);
  }

  await next();
}

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  return enforceRateLimit(c, next, 'RATE_LIMITER', 'parcel');
}

export async function adminRateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  return enforceRateLimit(c, next, 'ADMIN_RATE_LIMITER', 'admin_login');
}
