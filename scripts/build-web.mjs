import { spawnSync } from 'node:child_process';

// npm forwards build options to the last command. Keep those options attached
// to Vite, then finalize the exact directory Vite wrote (including Tauri builds).
const args = process.argv.slice(2);
let outDir = 'dist';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--outDir') outDir = args[++i];
  else if (args[i].startsWith('--outDir=')) outDir = args[i].slice('--outDir='.length);
}
function run(script, options) {
  const result = spawnSync(process.execPath, [script, ...options], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('node_modules/vite/bin/vite.js', ['build', ...args]);
run('scripts/finalize-release.mjs', [outDir]);
