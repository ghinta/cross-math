import { readdir, mkdir, cp } from 'node:fs/promises';
import { join, basename } from 'node:path';

const target = process.argv[2];
if (!/^[a-z0-9_-]+$/.test(target ?? '')) throw new Error('Pass the Rust target triple.');
const root = join('target', target, 'release', 'bundle');
const files = await readdir(root, { recursive: true });
const installers = files.filter(path => /\.(?:AppImage|deb|exe|msi|dmg)$/.test(path));
if (!installers.length) throw new Error(`No installers in ${root}.`);
await mkdir('desktop-artifacts', { recursive: true });
for (const path of installers) await cp(join(root, path), join('desktop-artifacts', `${target}-${basename(path)}`));
console.log(`Collected ${installers.length} installers for ${target}.`);
