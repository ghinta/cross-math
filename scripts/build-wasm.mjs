import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync('src/wasm', { recursive: true });
run('cargo', ['build', '--locked', '-p', 'cross-math-core', '--release', '--target', 'wasm32-unknown-unknown']);
run('wasm-bindgen', ['target/wasm32-unknown-unknown/release/cross_math_core.wasm', '--target', 'web', '--out-dir', 'src/wasm', '--out-name', 'cross_math_core']);
