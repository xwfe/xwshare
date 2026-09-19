import { hmacHex } from './secret';

const PICKUP_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 生成 6 位随机取件码（大写字母 + 数字，排除易混淆字符 0/O/1/I/L） */
export function generatePickupCode(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += PICKUP_CHARS[array[i] % PICKUP_CHARS.length];
  }
  return code;
}

export function normalizePickupCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidPickupCode(code: unknown): code is string {
  if (typeof code !== 'string') return false;
  const normalized = normalizePickupCode(code);
  return normalized.length === 6 && [...normalized].every((char) => PICKUP_CHARS.includes(char));
}

export async function hashPickupCode(code: string, secret: string): Promise<string> {
  const normalizedCode = normalizePickupCode(code);
  return hmacHex(normalizedCode, secret);
}
