import { Context, Next } from 'hono';
import { Env } from '../types/env';
import { logEvent } from '../utils/log';

export async function turnstileMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const isDev = c.env.ENVIRONMENT === 'development';

  // 未配置 Secret Key
  if (!c.env.TURNSTILE_SECRET_KEY || c.env.TURNSTILE_SECRET_KEY === 'your-turnstile-secret-key') {
    if (isDev) {
      // 开发环境允许跳过（本地调试用）
      return next();
    }
    logEvent('error', 'turnstile.misconfigured', {
      path: new URL(c.req.url).pathname
    });
    // 生产环境缺少配置 → Fail-Closed，不能静默放行
    return c.json({ error: 'Turnstile not configured', code: 'SERVER_MISCONFIGURED' }, 500);
  }

  const token = c.req.header('x-turnstile-token');
  if (!token) {
    logEvent('warn', 'turnstile.rejected', {
      path: new URL(c.req.url).pathname,
      reason: 'missing_token'
    });
    return c.json({ error: 'Missing turnstile token', code: 'MISSING_TOKEN' }, 400);
  }

  const formData = new FormData();
  formData.append('secret', c.env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  formData.append('remoteip', c.req.header('CF-Connecting-IP') || '');

  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  const outcome: any = await result.json();

  if (!outcome.success) {
    logEvent('warn', 'turnstile.rejected', {
      path: new URL(c.req.url).pathname,
      reason: 'invalid_token'
    });
    return c.json({ error: 'Invalid turnstile token', code: 'INVALID_TOKEN' }, 403);
  }

  await next();
}
