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
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const normalizedCode = code.toUpperCase().replace(/[\s-]+/g, '');
  const signature = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    encoder.encode(normalizedCode)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
