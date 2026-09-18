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

test('本地 D1：寄文本后可用取件码取回', { timeout: 30000 }, async (t) => {
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

  const createResponse = await fetch(`${baseUrl}/api/parcels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'text',
      title: 'integration',
      content: 'hello from local d1',
      expiresIn: '1h',
      burnAfterRead: false,
      maxDownloads: 0,
      encrypted: false
    })
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.match(created.data.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

  const code = created.data.code;
  const normalizedVariant = `${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`;
  const pickupResponse = await fetch(`${baseUrl}/api/pickup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: normalizedVariant })
  });
  assert.equal(pickupResponse.status, 200);
  const pickedUp = await pickupResponse.json();
  assert.equal(pickedUp.data.type, 'text');
  assert.equal(pickedUp.data.title, 'integration');
  assert.equal(pickedUp.data.content, 'hello from local d1');
});
