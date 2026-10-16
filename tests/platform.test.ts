import { expect, it } from 'vitest';
import '../public/appearance.js';
import { appearance } from '../src/appearance';
import { emptySave, parseSave } from '../src/storage';
import { newSession } from '../src/game';
import puzzles from '../src/data/puzzles.json';
import type { Puzzle } from '../src/types';

const profiles = [
  ['Edge Windows', { userAgent: 'Windows Chrome/140 Safari/537 Edg/140', platform: 'Win32' }, 'Windows', 'fluent'],
  ['Chrome macOS', { userAgent: 'Macintosh Chrome/140 Safari/537', platform: 'MacIntel' }, 'macOS', 'material'],
  ['Chrome iOS', { userAgent: 'iPhone CriOS/140 Mobile Safari/604', platform: 'iPhone' }, 'iOS', 'material'],
  ['Safari iPad desktop', { userAgent: 'Macintosh Version/19 Safari/605', platform: 'MacIntel', maxTouchPoints: 5 }, 'iPadOS', 'liquid'],
  ['Firefox Android', { userAgent: 'Android Firefox/140' }, 'Android', 'material'],
  ['Opera Windows', { userAgent: 'Windows Chrome/140 Safari/537 OPR/125' }, 'Windows', 'fluent'],
  ['Client hints Edge', { userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }], platform: 'Windows' } }, 'Windows', 'fluent'],
  ['Unknown', {}, 'Unbekannt', 'liquid'],
] as const;
for (const [name, hints, os, style] of profiles) it(`browser appearance: ${name}`, () => {
  expect(appearance.detectPlatform(hints)).toMatchObject({ os, style, native: false });
});

for (const [platform, style] of [['windows', 'fluent'], ['linux', 'material'], ['macos', 'liquid'], ['ios', 'liquid'], ['android', 'material']]) it(`native ${platform} overrides conflicting browser hints`, () => {
  const runtime = appearance.readRuntime({ __TAURI_INTERNALS__: {}, __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
  const detected = appearance.detectPlatform({ userAgent: 'Windows Chrome/140 Edg/140', platform: 'Win32' }, runtime);
  expect(detected).toMatchObject({ native: true, browser: 'Tauri', style });
  expect(appearance.resolveUIStyle('auto', detected)).toBe(style);
  for (const manual of ['liquid', 'material', 'fluent']) expect(appearance.resolveUIStyle(manual, detected)).toBe(manual);
});

it('migrates old appearance preferences and handles damaged or blocked storage', () => {
  const legacy = JSON.stringify({ value: { settings: { theme: 'dark', opaque: true } } });
  expect(appearance.readPreferences(name => name === 'cross-math-backup-v1' ? legacy : '{bad').preferences).toMatchObject({ uiStyle: 'auto', theme: 'dark', opaque: true, fillScreen: true });
  expect(appearance.readPreferences(() => { throw new Error('blocked'); })).toMatchObject({ hasSaved: false, preferences: { uiStyle: 'auto', theme: 'system' } });
  expect(appearance.normalize({ uiStyle: 'unknown', glassLevel: 120.9, fillScreen: 'no' })).toMatchObject({ uiStyle: 'auto', glassLevel: 100, fillScreen: true });
});

it('retains a valid game and game preferences when new appearance fields are damaged', () => {
  const save = emptySave(); save.session = newSession(puzzles[0] as Puzzle); save.settings.guided = false;
  const saved = JSON.parse(JSON.stringify(save)); saved.settings.uiStyle = 'unknown'; saved.settings.glassLevel = 'broken';
  const restored = parseSave(JSON.stringify(saved));
  expect(restored.session).toEqual(save.session); expect(restored.settings.guided).toBe(false);
  expect(restored.settings).toMatchObject({ uiStyle: 'auto', glassLevel: 35 });
});
