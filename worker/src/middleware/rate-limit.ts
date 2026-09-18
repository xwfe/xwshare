import { Context, Next } from 'hono';
import { Env } from '../types/env';
import { logEvent } from '../utils/log';

const ipCache = new Map<string, { count: number, resetAt: number }>();

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  
  const record = ipCache.get(ip) || { count: 0, resetAt: now + 60000 };
  
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + 60000;
  } else {
    record.count++;
  }
  
  ipCache.set(ip, record);
  
  if (record.count > 10) {
    logEvent('warn', 'request.rate_limited', {
      method: c.req.method,
      path: new URL(c.req.url).pathname
    });
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, 429);
  }
  
  await next();
}
