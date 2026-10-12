// Audit the actual pinned metadata, including actions inside composites.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const references = text => [...text.matchAll(/^\s*(?:-\s*)?uses:\s*['"]?([^\s'"#]+)/gm)].map(m => m[1]);
const checked = new Set();
async function audit(reference) {
  if (checked.has(reference)) return;
  checked.add(reference);
  let metadata;
  if (reference.startsWith('./')) metadata = readFileSync(`${reference}/action.yml`, 'utf8');
  else {
    assert(!reference.startsWith('docker://'), `Review container action separately: ${reference}`);
    const [path, ref] = reference.split('@');
    assert(ref, `Action needs a pinned ref: ${reference}`);
    const [owner, repo, ...directory] = path.split('/');
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${directory.length ? directory.join('/') + '/' : ''}action.yml`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    assert(response.ok, `Cannot inspect action metadata: ${reference} (HTTP ${response.status})`);
    metadata = await response.text();
  }
  const runtime = metadata.match(/^\s+using:\s*['"]?([^\s'"#]+)/m)?.[1];
  assert(runtime, `Action runtime missing: ${reference}`);
  if (runtime.startsWith('node')) assert(Number(runtime.slice(4)) >= 24, `Deprecated action runtime: ${reference} uses ${runtime}`);
  else assert(runtime === 'composite', `Review action runtime separately: ${reference} (${runtime})`);
  console.log(`${reference}: ${runtime}`);
  await Promise.all(references(metadata).map(audit));
}
for (const name of readdirSync('.github/workflows').filter(n => /\.ya?ml$/.test(n))) {
  await Promise.all(references(readFileSync(`.github/workflows/${name}`, 'utf8')).map(audit));
}
console.log(`${checked.size} action definitions checked; no Node.js 20 runtimes.`);
