import { useEffect, useState } from 'react';
import { appearance, type Platform } from './appearance';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function installInstructions(platform: Platform): string[] {
  if (['iOS', 'iPadOS'].includes(platform.os)) return ['Das Teilen-Menü im Browser öffnen.', '„Zum Home-Bildschirm“ wählen.', 'Mit „Hinzufügen“ bestätigen.'];
  if (platform.browser === 'Safari' && platform.os === 'macOS') return ['In Safari „Ablage“ öffnen.', '„Zum Dock hinzufügen“ wählen und bestätigen.'];
  if (platform.os === 'Android') return ['Das Browsermenü öffnen.', '„App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.', 'Die Installation bestätigen.'];
  if (platform.browser === 'Edge') return ['Im Browsermenü „Apps“ öffnen.', '„Diese Site als App installieren“ wählen und bestätigen.'];
  if (platform.browser === 'Chrome') return ['Im Browsermenü „Streamen, speichern und teilen“ öffnen.', '„Seite als App installieren“ wählen und bestätigen.'];
  return ['Die Seite in Chrome, Edge oder Safari öffnen.', 'Im Browsermenü die Installation auswählen.'];
}
export function useInstallation(onHelp: () => void) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [standalone, setStandalone] = useState(() => matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [error, setError] = useState('');
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone), (display-mode: minimal-ui)');
    const change = () => setStandalone(media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    media.addEventListener('change', change); addEventListener('beforeinstallprompt', before); addEventListener('appinstalled', complete);
    return () => { media.removeEventListener('change', change); removeEventListener('beforeinstallprompt', before); removeEventListener('appinstalled', complete); };
  }, []);
  return {
    visible: !appearance.initial.detected.native && isSecureContext && !installed && !standalone,
    pending, error, instructions: installInstructions(appearance.initial.detected),
    install: async () => {
      if (pending) return;
      setError('');
      if (!prompt) { onHelp(); return; }
      setPending(true); setPrompt(null);
      try { await prompt.prompt(); if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true); }
      catch { setError('Der Installationsdialog konnte nicht geöffnet werden. Nutze das Browsermenü.'); onHelp(); }
      finally { setPending(false); }
    },
  };
}
