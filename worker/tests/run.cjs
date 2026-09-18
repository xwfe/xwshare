const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workerRoot = path.resolve(__dirname, '..');

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workerRoot,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run([
  '--require',
  './tests/register-ts.cjs',
  '--test',
  './tests/unit/pickup-code.test.cjs',
  './tests/unit/secret.test.cjs'
]);
run(['--test', './tests/integration/parcel-flow.test.cjs']);
