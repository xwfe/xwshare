const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePickupCode, hashPickupCode } = require('../../src/utils/pickup-code.ts');

test('generatePickupCode 只生成 6 位无歧义字符', () => {
  for (let i = 0; i < 200; i++) {
    const code = generatePickupCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
});

test('hashPickupCode 对大小写、空格和连字符做统一归一化', async () => {
  const secret = 'unit-test-secret';
  const canonical = await hashPickupCode('AB3K7M', secret);

  assert.equal(await hashPickupCode('ab3k7m', secret), canonical);
  assert.equal(await hashPickupCode('AB3-K7M', secret), canonical);
  assert.equal(await hashPickupCode(' AB3 K7M ', secret), canonical);
  assert.match(canonical, /^[a-f0-9]{64}$/);
});
