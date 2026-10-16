import type { Settings } from './types';

export type Appearance = Pick<Settings, 'uiStyle' | 'theme' | 'glassLevel' | 'opaque' | 'reduceMotion' | 'fillScreen'>;
export interface Platform { os: string; browser: string; style: 'liquid' | 'material' | 'fluent'; native: boolean }
interface AppearanceAPI {
  labels: Record<Platform['style'], string>;
  styles: string[];
  normalize(value?: unknown): Appearance;
  readRuntime(env?: unknown): { isTauri: boolean; platform?: string };
  detectPlatform(nav?: unknown, runtime?: unknown): Platform;
  readPreferences(read: (key: string) => string | null): { preferences: Appearance; hasSaved: boolean };
  resolveUIStyle(preference: string, detected: Platform): Platform['style'];
  apply(settings: Appearance, detected: Platform): { ui: Platform['style']; theme: 'light' | 'dark'; color: string };
  persist(settings: Appearance): boolean;
  initial: { detected: Platform; preferences: Appearance; hasSaved: boolean };
}
declare global { var CrossMathAppearance: AppearanceAPI; }
export const appearance = globalThis.CrossMathAppearance;
