import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const problems = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readOptional(relativePath) {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
}

function parseEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return result;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  problems.push(`Node.js 需要 22+，当前是 ${process.versions.node}`);
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.repository?.url !== 'https://github.com/xwfe/xwshare.git') {
  problems.push('package.json repository 必须指向 https://github.com/xwfe/xwshare.git');
}
try {
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  if (origin !== 'git@github.com-xwfe:xwfe/xwshare.git') {
    problems.push('Git origin 必须指向 git@github.com-xwfe:xwfe/xwshare.git');
  }
} catch {
  problems.push('无法读取 Git origin');
}

const wrangler = read('worker/wrangler.toml');
const databaseId = wrangler.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1] || '';
if (!databaseId || databaseId === 'your-d1-database-id') {
  problems.push('worker/wrangler.toml 仍未填写真实 D1 database_id');
} else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
  problems.push('worker/wrangler.toml 的 D1 database_id 不是合法 UUID');
}

if (!/\[\[ratelimits\]\][\s\S]*?name\s*=\s*"RATE_LIMITER"/m.test(wrangler)) {
  problems.push('worker/wrangler.toml 缺少 RATE_LIMITER binding');
}
if (!/\[observability\][\s\S]*?enabled\s*=\s*true/m.test(wrangler)) {
  problems.push('worker/wrangler.toml 未启用 Workers Logs observability');
}

const productionEnvRaw = readOptional('.env.production');
let productionEnv = {};
if (productionEnvRaw === null) {
  problems.push('缺少 .env.production；先复制 .env.production.example 再填写真实生产值');
} else {
  productionEnv = parseEnv(productionEnvRaw);

  const turnstileSiteKey = productionEnv.VITE_TURNSTILE_SITE_KEY || '';
  if (!turnstileSiteKey) {
    problems.push('.env.production 缺少 VITE_TURNSTILE_SITE_KEY');
  }
  if (
    turnstileSiteKey === '1x00000000000000000000AA' ||
    turnstileSiteKey === 'your-turnstile-site-key'
  ) {
    problems.push('.env.production 不能使用本地 Turnstile 测试 Site Key');
  }

  const workerUrl = productionEnv.VITE_WORKER_API_URL || '';
  if (!workerUrl) {
    problems.push(
      '.env.production 缺少 VITE_WORKER_API_URL；当前 Pages + Worker 独立部署必须显式填写 Worker HTTPS 地址'
    );
  } else {
    try {
      const url = new URL(workerUrl);
      if (url.protocol !== 'https:') {
        problems.push('生产 VITE_WORKER_API_URL 必须使用 https://');
      }
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        problems.push('生产 VITE_WORKER_API_URL 不能指向本机地址');
      }
      if (url.hostname.includes('your-subdomain')) {
        problems.push('.env.production 的 VITE_WORKER_API_URL 仍是示例占位地址');
      }
    } catch {
      problems.push('生产 VITE_WORKER_API_URL 不是合法 URL');
    }
  }
}

if (problems.length > 0) {
  console.error('生产本地 preflight 未通过：');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('\n补齐本地配置后再运行：pnpm run preflight:production');
  console.error('随后运行远端检查：cd worker && pnpm run preflight:cloudflare');
  process.exit(1);
}

console.log('生产本地 preflight 通过。');
console.log('下一步：cd worker && pnpm run preflight:cloudflare');
