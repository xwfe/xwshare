import { Context, Next } from 'hono';
import { Env } from '../types/env';

export async function turnstileMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = c.req.header('x-turnstile-token');
  if (!token) {
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
    return c.json({ error: 'Invalid turnstile token', code: 'INVALID_TOKEN' }, 403);
  }
  
  await next();
}
