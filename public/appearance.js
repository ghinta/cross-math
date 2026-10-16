// Runs before React and CSS paint. The same validated preferences drive React.
(() => {
  const key = 'cross-math-appearance-v1';
  const labels = Object.freeze({ liquid: 'Liquid Glass', material: 'Material 3', fluent: 'Fluent' });
  const styles = ['auto', ...Object.keys(labels)];
  function readRuntime(env = globalThis) {
    return { isTauri: Boolean(env.__TAURI_INTERNALS__) || env.isTauri === true || typeof env.__TAURI_IPC__ === 'function', platform: env.__TAURI_OS_PLUGIN_INTERNALS__?.platform };
  }
  function detectPlatform(nav = {}, runtime = {}) {
    const ua = nav.userAgent || '', device = nav.userAgentData?.platform || nav.platform || '';
    const brands = Array.isArray(nav.userAgentData?.brands) ? nav.userAgentData.brands.map(x => x?.brand) : [];
    const native = { windows: 'Windows', linux: 'Linux', macos: 'macOS', ios: 'iOS', android: 'Android' };
    const os = runtime.isTauri && Object.hasOwn(native, runtime.platform) ? native[runtime.platform]
      : /Android/i.test(`${device} ${ua}`) ? 'Android'
      : /iPad/i.test(ua) || /Mac/i.test(device) && nav.maxTouchPoints > 1 ? 'iPadOS'
      : /iPhone|iPod/i.test(ua) ? 'iOS' : /Win/i.test(`${device} ${ua}`) ? 'Windows'
      : /Mac/i.test(`${device} ${ua}`) ? 'macOS' : /Linux/i.test(`${device} ${ua}`) ? 'Linux' : 'Unbekannt';
    const edge = brands.includes('Microsoft Edge') || /Edg(?:e|A|iOS)?\//.test(ua);
    const other = /Firefox\/|FxiOS\/|OPR\/|Opera|SamsungBrowser\//.test(ua);
    const chrome = !edge && !other && (brands.includes('Google Chrome') || /Chrome\/|CriOS\//.test(ua));
    const safari = !edge && !chrome && !other && /Version\/.+Safari\//.test(ua);
    const browser = runtime.isTauri ? 'Tauri' : edge ? 'Edge' : chrome ? 'Chrome' : safari ? 'Safari' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : 'Anderer Browser';
    const style = runtime.isTauri ? os === 'Windows' ? 'fluent' : ['Linux', 'Android'].includes(os) ? 'material' : 'liquid'
      : edge ? 'fluent' : chrome ? 'material' : safari ? 'liquid' : os === 'Android' ? 'material' : os === 'Windows' ? 'fluent' : 'liquid';
    return { os, browser, style, native: Boolean(runtime.isTauri) };
  }
  function normalize(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    return {
      uiStyle: styles.includes(value.uiStyle) ? value.uiStyle : 'auto',
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
      glassLevel: Number.isFinite(value.glassLevel) ? Math.round(Math.max(0, Math.min(100, value.glassLevel))) : 35,
      opaque: typeof value.opaque === 'boolean' ? value.opaque : typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-transparency: reduce)').matches,
      reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : false,
      fillScreen: typeof value.fillScreen === 'boolean' ? value.fillScreen : true,
    };
  }
  function readPreferences(read) {
    for (const name of [key, 'cross-math-backup-v1']) {
      try {
        const record = JSON.parse(read(name));
        const settings = name === key ? record?.version === 1 ? record.settings : null : (record?.value ?? record)?.settings;
        if (settings && typeof settings === 'object') return { preferences: normalize(settings), hasSaved: true };
      } catch { /* A malformed appearance record never invalidates the game. */ }
    }
    return { preferences: normalize(), hasSaved: false };
  }
  const resolveUIStyle = (preference, detected) => styles.includes(preference) && preference !== 'auto' ? preference : detected.style;
  function apply(value, detected) {
    const p = normalize(value), root = document.documentElement;
    const ui = resolveUIStyle(p.uiStyle, detected);
    const theme = p.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : p.theme;
    Object.assign(root.dataset, { ui, theme, glass: p.opaque ? 'opaque' : 'clear', motion: p.reduceMotion ? 'reduced' : 'normal', layout: p.fillScreen ? 'fill' : 'compact' });
    root.style.setProperty('--glass-level', String(p.glassLevel / 100));
    root.style.colorScheme = theme;
    const colors = { liquid: ['#e8edf5', '#17232e'], material: ['#fdf7ff', '#141218'], fluent: ['#f3f3f3', '#202020'] };
    const color = colors[ui][theme === 'dark' ? 1 : 0];
    root.style.backgroundColor = color;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    return { ui, theme, color };
  }
  function persist(value) {
    try { localStorage.setItem(key, JSON.stringify({ version: 1, settings: normalize(value) })); return true; } catch { return false; }
  }
  let initial = null;
  if (typeof document !== 'undefined') {
    const detected = detectPlatform(navigator, readRuntime());
    initial = { detected, ...readPreferences(name => localStorage.getItem(name)) };
    apply(initial.preferences, detected);
  }
  globalThis.CrossMathAppearance = Object.freeze({ labels, styles, readRuntime, detectPlatform, normalize, readPreferences, resolveUIStyle, apply, persist, initial });
})();
