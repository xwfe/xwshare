const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAdminPassword,
  getPickupSecret,
  hmacHex,
  signAdminToken,
  signDownloadToken,
  verifyAdminToken,
  verifyDownloadToken,
  verifyPassword
} = require('../../src/utils/secret.ts');

test('生产环境拒绝缺失或占位 pickup secret', () => {
  assert.equal(getPickupSecret({ PICKUP_CODE_SECRET: '', TURNSTILE_SECRET_KEY: '' }), null);
  assert.equal(getPickupSecret({ PICKUP_CODE_SECRET: 'secret', TURNSTILE_SECRET_KEY: '' }), null);
});

test('development 环境允许本地密钥和管理员口令兜底', () => {
  const env = {
    PICKUP_CODE_SECRET: '',
    TURNSTILE_SECRET_KEY: '',
    ENVIRONMENT: 'development'
  };

  assert.equal(getPickupSecret(env), 'dev-local-only');
  assert.equal(getAdminPassword(env), 'xwshare-dev');
});

test('HMAC 稳定且密码比较不依赖明文比较', async () => {
  const first = await hmacHex('value', 'secret-a');
  const second = await hmacHex('value', 'secret-a');
  const other = await hmacHex('value', 'secret-b');

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(await verifyPassword('admin-pass', 'admin-pass', 'secret-a'), true);
  assert.equal(await verifyPassword('wrong', 'admin-pass', 'secret-a'), false);
});

test('下载 token 绑定 fileKey 且可验证', async () => {
  const token = await signDownloadToken('files/a/demo.txt', 'token-secret');

  assert.equal(await verifyDownloadToken('files/a/demo.txt', token, 'token-secret'), true);
  assert.equal(await verifyDownloadToken('files/b/demo.txt', token, 'token-secret'), false);
  assert.equal(await verifyDownloadToken('files/a/demo.txt', token, 'other-secret'), false);
});

test('管理员 token 可验证且篡改后失效', async () => {
  const { token } = await signAdminToken('admin-secret');

  assert.equal(await verifyAdminToken(token, 'admin-secret'), true);
  assert.equal(await verifyAdminToken(`${token}x`, 'admin-secret'), false);
  assert.equal(await verifyAdminToken(token, 'other-secret'), false);
});
