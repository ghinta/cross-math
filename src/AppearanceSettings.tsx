import { Moon, Settings2, Sun } from 'lucide-react';
import { appearance } from './appearance';
import type { Settings } from './types';

export function Toggle({ title, detail, checked, onChange }: { title: string; detail?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="toggle" aria-hidden="true" /></label>;
}

export default function AppearanceSettings({ settings, onChange }: { settings: Settings; onChange: (value: Partial<Settings>) => void }) {
  const platform = appearance.initial.detected, ui = appearance.resolveUIStyle(settings.uiStyle, platform);
  return <section className="appearance-settings" aria-label="Darstellung">
    <h3>Darstellung</h3>
    <label className="platform-setting">UI-Stil<select value={settings.uiStyle} onChange={e => onChange({ uiStyle: e.target.value as Settings['uiStyle'] })}>
      <option value="auto">Automatisch</option><option value="liquid">Apple · Liquid Glass</option><option value="material">Google · Material 3</option><option value="fluent">Microsoft · Fluent</option>
    </select></label>
    <p className="platform-detection">{platform.browser} · {platform.os} · {settings.uiStyle === 'auto' ? 'Automatisch' : 'Manuell'}: {appearance.labels[ui]}</p>
    {ui === 'liquid' && <section className="glass-controls"><div className="glass-preview" aria-hidden="true"><div className="preview-toolbar glass"><span>+</span><span>×</span><span>÷</span><span>−</span></div></div>
      <label className="glass-slider">Liquid Glass <output>{settings.glassLevel} %</output><input type="range" min="0" max="100" value={settings.glassLevel} disabled={settings.opaque} onChange={e => onChange({ glassLevel: Number(e.target.value) })} /></label><p className="source-copy">Mehr Deckkraft erhöht den Kontrast.</p></section>}
    <div className="theme-switch glass" aria-label="Erscheinungsbild">{([{ value: 'system', label: 'System', icon: Settings2 }, { value: 'light', label: 'Hell', icon: Sun }, { value: 'dark', label: 'Dunkel', icon: Moon }] as const).map(({ value, label, icon: Icon }) => <button key={value} className={settings.theme === value ? 'active' : ''} aria-pressed={settings.theme === value} onClick={() => onChange({ theme: value })}><Icon size={16} />{label}</button>)}</div>
    <Toggle title="Bildschirm ausfüllen" checked={settings.fillScreen} onChange={fillScreen => onChange({ fillScreen })} />
    {ui !== 'material' && <Toggle title="Weniger Transparenz" detail="Glaseffekte reduzieren und den Kontrast erhöhen." checked={settings.opaque} onChange={opaque => onChange({ opaque })} />}
    <Toggle title="Weniger Bewegung" detail="Animationen und Übergänge deaktivieren." checked={settings.reduceMotion} onChange={reduceMotion => onChange({ reduceMotion })} />
    <button className="reset-appearance" onClick={() => onChange(appearance.normalize())}>Darstellung zurücksetzen</button>
  </section>;
}
