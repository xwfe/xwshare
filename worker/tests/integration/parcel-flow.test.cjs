const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const workerRoot = path.resolve(__dirname, '../..');
const wrangler = path.join(workerRoot, 'node_modules', '.bin', 'wrangler');

async function waitForWorker(baseUrl, child) {
  let lastError;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('wrangler dev did not become ready');
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { response, body };
}

async function createTextParcel(baseUrl, overrides = {}, ip) {
  return jsonRequest(`${baseUrl}/api/parcels`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ip ? { 'CF-Connecting-IP': ip } : {})
    },
    body: JSON.stringify({
      type: 'text',
      title: 'integration',
      content: 'hello from local d1',
      expiresIn: '1h',
      burnAfterRead: false,
      maxDownloads: 0,
      encrypted: false,
      ...overrides
    })
  });
}

test('本地 Worker + D1 + R2 关键链路', { timeout: 45000 }, async (t) => {
  const stateDir = path.join(workerRoot, `.test-state-${process.pid}`);
  const port = 8900 + (process.pid % 500);
  const baseUrl = `http://127.0.0.1:${port}`;
  fs.rmSync(stateDir, { recursive: true, force: true });

  const init = spawnSync(
    wrangler,
    ['d1', 'execute', 'xwshare-db', '--local', '--persist-to', stateDir, '--file=src/db/schema.sql', '--yes'],
    { cwd: workerRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
  );
  assert.equal(init.status, 0, init.stderr || init.stdout);

  const child = spawn(
    wrangler,
    [
      'dev',
      '--persist-to',
      stateDir,
      '--var',
      'ENVIRONMENT:development',
      '--var',
      'PICKUP_CODE_SECRET:integration-secret',
      '--var',
      'ADMIN_PASSWORD:xwshare-dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--test-scheduled',
      '--log-level',
      'error'
    ],
    {
      cwd: workerRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  await waitForWorker(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });

  await t.test('跨域管理删除的 CORS 预检允许 DELETE 和 Authorization', async () => {
    const response = await fetch(`${baseUrl}/api/admin/parcels/example`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.test',
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'authorization'
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('access-control-allow-methods') || '', /DELETE/);
    assert.match(response.headers.get('access-control-allow-headers') || '', /Authorization/i);
  });

  await t.test('文本寄件后可用规范化取件码取回', async () => {
    const { response: createResponse, body: created } = await createTextParcel(baseUrl);
    assert.equal(createResponse.status, 200);
    assert.match(created.data.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    const code = created.data.code;
    const normalizedVariant = `${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`;
    const { response: pickupResponse, body: pickedUp } = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: normalizedVariant })
    });

    assert.equal(pickupResponse.status, 200);
    assert.equal(pickedUp.data.type, 'text');
    assert.equal(pickedUp.data.title, 'integration');
    assert.equal(pickedUp.data.content, 'hello from local d1');
  });

  await t.test('文件必须带上传凭证，确认后才能取件和下载', async () => {
    const fileBody = 'hello from local r2';
    const { response: registerResponse, body: registered } = await jsonRequest(
      `${baseUrl}/api/parcels/upload`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'demo.txt',
          fileSize: Buffer.byteLength(fileBody),
          contentType: 'text/plain',
          expiresIn: '1h',
          burnAfterRead: false,
          maxDownloads: 0,
          encrypted: false
        })
      }
    );
    assert.equal(registerResponse.status, 200);

    const earlyPickup = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(earlyPickup.response.status, 403);
    assert.equal(earlyPickup.body.code, 'NOT_READY');

    const missingToken = await fetch(registered.data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: fileBody
    });
    assert.equal(missingToken.status, 401);

    const uploadResponse = await fetch(registered.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
        'x-upload-token': registered.data.uploadToken
      },
      body: fileBody
    });
    assert.equal(uploadResponse.status, 200);

    const directDownload = await fetch(
      `${baseUrl}/api/download-file/${encodeURIComponent(registered.data.fileKey)}`
    );
    assert.equal(directDownload.status, 403);

    const confirm = await jsonRequest(`${baseUrl}/api/parcels/confirm-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(confirm.response.status, 200);
    assert.equal(confirm.body.data.success, true);

    const pickup = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(pickup.response.status, 200);
    assert.equal(pickup.body.data.type, 'file');
    assert.equal(pickup.body.data.fileName, 'demo.txt');
    assert.equal(pickup.body.data.mimeType, 'text/plain');

    const downloadResponse = await fetch(pickup.body.data.downloadUrl);
    assert.equal(downloadResponse.status, 200);
    assert.equal(await downloadResponse.text(), fileBody);
  });

  await t.test('阅后即焚首次成功，第二次取件被拒绝', async () => {
    const { response: createResponse, body: created } = await createTextParcel(baseUrl, {
      title: 'burn',
      content: 'read once',
      burnAfterRead: true
    });
    assert.equal(createResponse.status, 200);

    const first = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: created.data.code })
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.data.content, 'read once');
    assert.equal(first.body.data.burnAfterRead, true);

    const second = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: created.data.code })
    });
    assert.equal(second.response.status, 403);
    assert.equal(second.body.code, 'UNAVAILABLE');
  });

  await t.test('管理员登录后可看统计、列表并删除快递', async () => {
    const { response: createResponse } = await createTextParcel(baseUrl, {
      title: 'admin-delete',
      content: 'delete me'
    });
    assert.equal(createResponse.status, 200);

    const unauthorized = await jsonRequest(`${baseUrl}/api/admin/stats`);
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.body.code, 'UNAUTHORIZED');

    const badLogin = await jsonRequest(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    });
    assert.equal(badLogin.response.status, 401);

    const login = await jsonRequest(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'xwshare-dev' })
    });
    assert.equal(login.response.status, 200);
    const token = login.body.data.token;
    assert.ok(token);

    const authHeaders = { authorization: `Bearer ${token}` };
    const stats = await jsonRequest(`${baseUrl}/api/admin/stats`, { headers: authHeaders });
    assert.equal(stats.response.status, 200);
    assert.ok(stats.body.data.totalFiles >= 1);

    const list = await jsonRequest(`${baseUrl}/api/admin/parcels?limit=100`, {
      headers: authHeaders
    });
    assert.equal(list.response.status, 200);
    const target = list.body.data.items.find((item) => item.title === 'admin-delete');
    assert.ok(target);

    const deleted = await jsonRequest(`${baseUrl}/api/admin/parcels/${target.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.data.success, true);

    const afterDelete = await jsonRequest(`${baseUrl}/api/admin/parcels?limit=100`, {
      headers: authHeaders
    });
    assert.equal(afterDelete.response.status, 200);
    assert.equal(
      afterDelete.body.data.items.some((item) => item.id === target.id),
      false
    );

    const deletedList = await jsonRequest(`${baseUrl}/api/admin/parcels?status=DELETED&limit=100`, {
      headers: authHeaders
    });
    assert.equal(deletedList.response.status, 200);
    assert.equal(
      deletedList.body.data.items.some((item) => item.id === target.id),
      true
    );
  });

  await t.test('管理员删除文件快递时同步删除 R2 对象', async () => {
    const ip = '198.51.100.24';
    const fileBody = 'admin should remove this object';
    const { response: registerResponse, body: registered } = await jsonRequest(
      `${baseUrl}/api/parcels/upload`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': ip
        },
        body: JSON.stringify({
          fileName: 'admin-r2-delete.txt',
          fileSize: Buffer.byteLength(fileBody),
          contentType: 'text/plain',
          expiresIn: '1h',
          burnAfterRead: false,
          maxDownloads: 0,
          encrypted: false
        })
      }
    );
    assert.equal(registerResponse.status, 200);

    const uploadResponse = await fetch(registered.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
        'x-upload-token': registered.data.uploadToken
      },
      body: fileBody
    });
    assert.equal(uploadResponse.status, 200);

    const confirm = await jsonRequest(`${baseUrl}/api/parcels/confirm-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(confirm.response.status, 200);

    const pickup = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(pickup.response.status, 200);
    const downloadUrl = pickup.body.data.downloadUrl;
    assert.equal((await fetch(downloadUrl)).status, 200);

    const login = await jsonRequest(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'xwshare-dev' })
    });
    assert.equal(login.response.status, 200);
    const authHeaders = { authorization: `Bearer ${login.body.data.token}` };

    const list = await jsonRequest(`${baseUrl}/api/admin/parcels?limit=100`, {
      headers: authHeaders
    });
    const target = list.body.data.items.find((item) => item.title === 'admin-r2-delete.txt');
    assert.ok(target);

    const deleted = await jsonRequest(`${baseUrl}/api/admin/parcels/${target.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.data.success, true);
    assert.equal((await fetch(downloadUrl)).status, 404);
  });

  await t.test('阅后即焚并发取件只有一个请求能成功 claim', async () => {
    const ip = '198.51.100.21';
    const { response: createResponse, body: created } = await createTextParcel(
      baseUrl,
      {
        title: 'concurrent-burn',
        content: 'only one winner',
        burnAfterRead: true
      },
      ip
    );
    assert.equal(createResponse.status, 200);

    const pickup = () =>
      jsonRequest(`${baseUrl}/api/pickup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': ip
        },
        body: JSON.stringify({ code: created.data.code })
      });

    const results = await Promise.all([pickup(), pickup()]);
    const statuses = results.map(({ response }) => response.status).sort();
    assert.deepEqual(statuses, [200, 403]);
    assert.equal(
      results.filter(({ response }) => response.status === 200).length,
      1
    );
  });

  await t.test('最大下载次数达到上限后拒绝再次取件', async () => {
    const ip = '198.51.100.22';
    const { response: createResponse, body: created } = await createTextParcel(
      baseUrl,
      {
        title: 'max-downloads',
        content: 'once by count',
        maxDownloads: 1
      },
      ip
    );
    assert.equal(createResponse.status, 200);

    const first = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: created.data.code })
    });
    assert.equal(first.response.status, 200);

    const second = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: created.data.code })
    });
    assert.equal(second.response.status, 403);
    assert.equal(second.body.code, 'MAX_DOWNLOADS');
  });

  await t.test('Cron 清理过期文件时同时标 DELETED 并删除 R2 对象', async () => {
    const ip = '198.51.100.23';
    const fileBody = 'cron should remove this object';
    const { response: registerResponse, body: registered } = await jsonRequest(
      `${baseUrl}/api/parcels/upload`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': ip
        },
        body: JSON.stringify({
          fileName: 'cron-expired.txt',
          fileSize: Buffer.byteLength(fileBody),
          contentType: 'text/plain',
          expiresIn: '1h',
          burnAfterRead: false,
          maxDownloads: 0,
          encrypted: false
        })
      }
    );
    assert.equal(registerResponse.status, 200);

    const uploadResponse = await fetch(registered.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
        'x-upload-token': registered.data.uploadToken
      },
      body: fileBody
    });
    assert.equal(uploadResponse.status, 200);

    const confirm = await jsonRequest(`${baseUrl}/api/parcels/confirm-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(confirm.response.status, 200);

    const pickup = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(pickup.response.status, 200);
    const downloadUrl = pickup.body.data.downloadUrl;

    const beforeCleanup = await fetch(downloadUrl);
    assert.equal(beforeCleanup.status, 200);

    const expire = spawnSync(
      wrangler,
      [
        'd1',
        'execute',
        'xwshare-db',
        '--local',
        '--persist-to',
        stateDir,
        '--command',
        "UPDATE parcels SET expires_at = '2000-01-01T00:00:00.000Z' WHERE title = 'cron-expired.txt'",
        '--yes'
      ],
      { cwd: workerRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
    );
    assert.equal(expire.status, 0, expire.stderr || expire.stdout);

    const scheduled = await fetch(`${baseUrl}/__scheduled`);
    assert.equal(scheduled.status, 200);

    const afterCleanup = await fetch(downloadUrl);
    assert.equal(afterCleanup.status, 404);

    const pickupAfterCleanup = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: registered.data.code })
    });
    assert.equal(pickupAfterCleanup.response.status, 403);
    assert.equal(pickupAfterCleanup.body.code, 'UNAVAILABLE');
  });

  await t.test('Cloudflare Rate Limiting 本地模拟在第 11 次请求返回 429', async () => {
    const ip = '198.51.100.25';

    for (let i = 0; i < 10; i++) {
      const attempt = await jsonRequest(`${baseUrl}/api/pickup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': ip
        },
        body: JSON.stringify({ code: 'ZZZZZZ' })
      });
      assert.equal(attempt.response.status, 404);
      assert.equal(attempt.body.code, 'NOT_FOUND');
    }

    const limited = await jsonRequest(`${baseUrl}/api/pickup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ code: 'ZZZZZZ' })
    });
    assert.equal(limited.response.status, 429);
    assert.equal(limited.body.code, 'RATE_LIMIT_EXCEEDED');
  });
});
