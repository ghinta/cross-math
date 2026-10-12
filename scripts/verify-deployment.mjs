// Check actual public bytes after Pages reports success, including cache bypass.
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyDeployment(base, expected) {
  const get = async path => {
    const url = new URL(path, base); url.searchParams.set('verify', `${expected}-${Date.now()}`);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const version = JSON.parse((await get('version.json')).toString());
  assert.equal(version.revision, expected, 'Pages is serving another revision');
  assert(version.files['index.html'], 'Release manifest must include index.html');
  assert(Object.keys(version.files).some(p => p.endsWith('.wasm')), 'WASM is missing from release');
  for (const [path, hash] of Object.entries(version.files)) {
    assert(!path.startsWith('/') && !path.includes('..') && !path.includes(':'), 'Unexpected artifact path');
    assert.equal(createHash('sha256').update(await get(path)).digest('hex'), hash, `Published bytes differ: ${path}`);
  }
  const manifest = JSON.parse((await get('manifest.webmanifest')).toString());
  assert.equal(new URL(manifest.start_url, base).pathname, new URL(base).pathname, 'Incorrect PWA start path');
  assert.equal(new URL(manifest.scope, base).pathname, new URL(base).pathname, 'Incorrect PWA scope');
  const sw = (await get('sw.js')).toString(); assert(sw.includes('precacheAndRoute'), 'Service worker has no offline cache');
  console.log(`Public deployment verified: ${expected}; ${Object.keys(version.files).length} artifact checksums match.`);
}
if (process.env.DEPLOYED_URL) {
  let passed = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await verifyDeployment(process.env.DEPLOYED_URL, process.env.EXPECTED_REVISION); passed = true; break; }
    catch (error) { console.log(`Deployment check ${attempt + 1}: ${error.message}`); if (attempt < 9) await new Promise(r => setTimeout(r, 3_000)); }
  }
  if (!passed) process.exitCode = 1;
}
