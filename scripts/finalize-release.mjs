// Run after Vite and Workbox finish, including copied public files and the SW.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist';
const files = {};
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { visit(path); continue; }
    const name = relative(root, path).replaceAll('\\', '/');
    if (name !== 'version.json') files[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
visit(root);
const revision = process.env.GITHUB_SHA ?? process.env.BUILD_REVISION ?? 'local';
writeFileSync(join(root, 'version.json'), JSON.stringify({ revision, files }) + '\n');
console.log(`Release manifest: ${Object.keys(files).length} files, revision ${revision}.`);
