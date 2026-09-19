import type { Env } from '../types/env';

const PLACEHOLDER_SECRETS = new Set(['', 'secret', 'change_me', 'your-turnstile-secret-key']);

/** 生产缺密钥返回 null，调用方必须 500。本地 development 才允许兜底。 */
export function getPickupSecret(env: Env): string | null {
  const secret = (env.PICKUP_CODE_SECRET || '').trim();
  const isDev = env.ENVIRONMENT === 'development';
  if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
    return isDev ? secret || 'dev-local-only' : null;
  }
  if (!isDev && secret.length < 32) return null;
  return secret;
}

export async function hmacHex(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const DOWNLOAD_TTL_SECONDS = 15 * 60;

export async function signDownloadToken(fileKey: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS;
  const sig = await hmacHex(`${exp}:${fileKey}`, secret);
  return `${exp}.${sig}`;
}

const ADMIN_TTL_SECONDS = 24 * 60 * 60;

export function getAdminPassword(env: Env): string | null {
  const password = (env.ADMIN_PASSWORD || '').trim();
  const isDev = env.ENVIRONMENT === 'development';
  if (!password) return isDev ? 'xwshare-dev' : null;
  if (password.length < 6 || (!isDev && ['secret', 'change_me', 'xwshare-dev'].includes(password))) {
    return null;
  }
  return password;
}

export async function signAdminToken(secret: string): Promise<{ token: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS;
  const sig = await hmacHex(`${exp}:admin`, secret);
  return { token: `${exp}.${sig}`, expiresAt: exp };
}

export async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!expRaw || !sig || !Number.isFinite(exp)) return false;
  if (exp * 1000 < Date.now()) return false;
  const expected = await hmacHex(`${exp}:admin`, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(input: string, expected: string, secret: string): Promise<boolean> {
  const left = await hmacHex(input, secret);
  const right = await hmacHex(expected, secret);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyDownloadToken(
  fileKey: string,
  token: string,
  secret: string
): Promise<boolean> {
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!expRaw || !sig || !Number.isFinite(exp)) return false;
  if (exp * 1000 < Date.now()) return false;
  const expected = await hmacHex(`${exp}:${fileKey}`, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
