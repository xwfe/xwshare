const test = require('node:test');
const assert = require('node:assert/strict');
const { PARCEL_LIMITS } = require('../../src/config/limits.ts');
const {
  normalizeMaxDownloads,
  validateExpiresIn,
  validateFileMetadata,
  validateTextContent
} = require('../../src/utils/parcel-input.ts');

test('文本边界按 UTF-8 字节限制为 1 MiB', () => {
  assert.equal(validateTextContent('a'.repeat(PARCEL_LIMITS.MAX_TEXT_BYTES)), null);
  assert.equal(
    validateTextContent('a'.repeat(PARCEL_LIMITS.MAX_TEXT_BYTES + 1))?.code,
    'TEXT_TOO_LARGE'
  );
});

test('文件登记边界在 100 MiB 处由 Worker 强制', () => {
  assert.equal(
    validateFileMetadata('ok.bin', PARCEL_LIMITS.MAX_FILE_SIZE, 'application/octet-stream'),
    null
  );
  assert.equal(
    validateFileMetadata(
      'too-large.bin',
      PARCEL_LIMITS.MAX_FILE_SIZE + 1,
      'application/octet-stream'
    )?.code,
    'FILE_TOO_LARGE'
  );
});

test('有效期只允许固定三档', () => {
  assert.equal(validateExpiresIn('1h'), null);
  assert.equal(validateExpiresIn('1d'), null);
  assert.equal(validateExpiresIn('7d'), null);
  assert.equal(validateExpiresIn('forever')?.code, 'INVALID_EXPIRY');
});

test('最大下载次数只接受非负安全整数', () => {
  assert.equal(normalizeMaxDownloads(undefined), 0);
  assert.equal(normalizeMaxDownloads(0), 0);
  assert.equal(normalizeMaxDownloads(3), 3);
  assert.equal(normalizeMaxDownloads(-1).code, 'INVALID_MAX_DOWNLOADS');
  assert.equal(normalizeMaxDownloads(1.5).code, 'INVALID_MAX_DOWNLOADS');
  assert.equal(normalizeMaxDownloads('3').code, 'INVALID_MAX_DOWNLOADS');
});
