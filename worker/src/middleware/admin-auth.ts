import { Context, Next } from 'hono';
import { Env } from '../types/env';
import { getPickupSecret, verifyAdminToken } from '../utils/secret';

export async function adminAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const secret = getPickupSecret(c.env);
  if (!secret) {
    return c.json({ error: 'Pickup secret not configured', code: 'SERVER_MISCONFIGURED' }, 500);
  }

  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!(await verifyAdminToken(token, secret))) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
  }

  await next();
}
