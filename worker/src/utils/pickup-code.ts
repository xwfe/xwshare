import { hmacHex } from './secret';

/** 生成 6 位随机取件码（大写字母 + 数字，排除易混淆字符 0/O/1/I/L） */
export function generatePickupCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export async function hashPickupCode(code: string, secret: string): Promise<string> {
  const normalizedCode = code.toUpperCase().replace(/[\s-]+/g, '');
  return hmacHex(normalizedCode, secret);
}
