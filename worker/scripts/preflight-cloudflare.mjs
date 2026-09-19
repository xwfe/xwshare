import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(
  workerRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
);

function run(args) {
  return spawnSync(wrangler, args, {
    cwd: workerRoot,
    encoding: 'utf8',
    env: process.env
  });
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('Cloudflare 远端 preflight 未运行：缺少 CLOUDFLARE_API_TOKEN。');
  console.error('本脚本只检查 Secret 名称，不读取 Secret 值。');
  process.exit(1);
}

const secrets = run(['secret', 'list', '--format', 'json']);
if (secrets.status !== 0) {
  console.error('Cloudflare 远端 preflight 无法读取 Secret 列表。');
  if (secrets.stderr.trim()) console.error(secrets.stderr.trim());
  process.exit(secrets.status || 1);
}

let parsed;
try {
  parsed = JSON.parse(secrets.stdout);
} catch {
  console.error('Wrangler secret list 返回了无法解析的 JSON。');
  process.exit(1);
}

const names = new Set(
  Array.isArray(parsed)
    ? parsed.map((item) => item?.name).filter((name) => typeof name === 'string')
    : []
);
const required = ['PICKUP_CODE_SECRET', 'TURNSTILE_SECRET_KEY', 'ADMIN_PASSWORD'];
const missing = required.filter((name) => !names.has(name));

if (missing.length > 0) {
  console.error('Cloudflare 远端 preflight 未通过，缺少 Secret：');
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

const dryRun = run(['deploy', '--dry-run']);
if (dryRun.status !== 0) {
  console.error('Wrangler production dry-run 未通过。');
  if (dryRun.stderr.trim()) console.error(dryRun.stderr.trim());
  process.exit(dryRun.status || 1);
}

console.log('Cloudflare 远端 preflight 通过：必需 Secret 均存在，production dry-run 可打包。');
