# Cross Math

Werbefreie Cross-Platform-App mit einer von Apple Liquid Glass inspirierten Oberfläche, gemeinsamem Rust-Kern und installierbarer Offline-PWA.

Die App enthält freie Rätsel in drei Schwierigkeitsstufen, ein gemeinsames Tagesrätsel, Notizen, Undo/Redo, kostenlose Hinweise, Pause, Statistiken, Light/Dark Mode, Einstellungen für reduzierte Bewegung/Transparenz und exportierbare lokale Spielstände. Alle Zahlen stammen aus dem eigenen Generator; es werden keine fremden Leveldaten verwendet.

## Starten

Voraussetzungen: die neueste Node.js-LTS-Version (aktuell 24.21.0 mit npm 11.19.0), Rust (getestet mit 1.99.0), das Target `wasm32-unknown-unknown` und die zum Cargo-Lockfile passende `wasm-bindgen`-CLI (aktuell 0.2.129). Mit nvm wählen `nvm install` und `nvm use` anhand der `.nvmrc` automatisch die aktuelle LTS-Version.

```bash
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm run build:wasm
npm run dev
```

In der vorbereiteten Cloud-Umgebung vor Cargo-/Tauri-Befehlen `source /workspace/.cross-math-tools/activate.sh` ausführen. Netzwerkzugang und lokale Testserver benötigen dort die entsprechenden Sandbox-Berechtigungen.

CI liest dieselbe `.nvmrc` mit `check-latest: true`; neue LTS-Versionen werden dadurch beim nächsten Lauf verwendet. Die JavaScript-Actions verwenden Node 24 statt der abgekündigten Node-20-Runtime. Bibliotheken ohne LTS-Kanal verwenden stabile Releases mit festgeschriebenem Lockfile. Dependabot prüft npm-Pakete und GitHub Actions wöchentlich und schlägt Updates als Pull Requests vor; sie werden vor Übernahme durch CI geprüft.

## PWA

```bash
npm run build
npm run preview
```

`dist/` auf einem statischen HTTPS-Host veröffentlichen. Die App ist nach dem ersten vollständigen Laden offline nutzbar, einschließlich neuer Rätsel und Hinweise. Der Service Worker speichert auch die WASM-Engine und den Worker. Die App bietet Updates an; der Spielstand wird vor dem Aktualisieren gesichert. Die Installation erfolgt über den Browser, auf dem iPhone über das Teilen-Menü. Der Entwicklungsserver verwendet keinen Offline-Cache.

### GitHub Pages

Im Repository unter **Settings → Pages → Build and deployment → Source** einmal **GitHub Actions** auswählen. Danach baut und veröffentlicht `.github/workflows/pages.yml` jeden Push auf `main`. Der Workflow übernimmt den von GitHub gemeldeten Pfad für Assets, Manifest, Service Worker und Offline-Navigation. Bei diesem Repository lautet die erwartete Adresse `https://ghinta.github.io/cross-math/`; sie ist erst nach einer erfolgreichen Deployment-Ausführung erreichbar.

Den Pages-Build lokal prüfen:

```bash
VITE_BASE_PATH=/cross-math/ npm run build
E2E_BASE_PATH=/cross-math/ npm run test:e2e
```

### Cloudflare Pages

Für Cloudflare oder einen anderen Host am Domain-Stamm `npm run build` ohne `VITE_BASE_PATH` ausführen und den Inhalt von `dist/` veröffentlichen. Für ein Unterverzeichnis `VITE_BASE_PATH` mit führendem und abschließendem `/` setzen. Bei Cloudflare Direct Upload wird der gebaute Ordner hochgeladen; ein eigener Cloudflare-Zugang ist dafür erforderlich.

## Tauri

Zusätzlich werden die [Tauri-Systemvoraussetzungen](https://v2.tauri.app/start/prerequisites/) der jeweiligen Plattform benötigt.

```bash
npm run tauri -- dev
npm run tauri -- build
```

Web und Tauri verwenden dieselbe React-Oberfläche. Der Web-Build liegt in `dist/`, der native Frontend-Build getrennt in `dist-native/`. Der Browser ruft den Rust-Kern über WebAssembly in einem Web Worker auf; Tauri verwendet denselben Core direkt über lokale Commands. Rechenintensive native Commands laufen außerhalb des UI-Threads.

Für Android auf einer vorbereiteten Android-Entwicklungsumgebung: `npm run tauri -- android init`, anschließend `npm run tauri -- android dev`. Für iOS auf macOS mit Xcode: `npm run tauri -- ios init`, anschließend `npm run tauri -- ios dev`. Mobile Projektdateien werden lokal generiert. Signierung und Store-Veröffentlichung sind gesonderte Schritte.

## Prüfen

```bash
npm run check
npm run test:wasm
npm run build
npx playwright install chromium
npm run test:e2e
```

Der Browser-Test nutzt vorhandenes `/usr/bin/chromium`, falls verfügbar; sonst das von Playwright installierte Chromium. Die Tests starten und stoppen ihren eigenen Preview-Server.

- Rust: 288 neue Aufgaben plus alle 36 mitgelieferten Rechenkreuze werden mit unabhängig implementierter Arithmetik und vollständiger Zahlenpermutation auf genau eine Lösung geprüft. Jeder Rechenschritt wird gegen den damaligen Zahlenvorrat nachgerechnet. Die Prüfungen der alten Engine bleiben erhalten.
- WASM: 36 neue Aufgaben werden mit dem nativen Katalog verglichen; 36 neue und 36 alte Aufgaben werden geprüft und über Hinweise vollständig gelöst.
- Frontend: Zahlenverbrauch, doppelte Kacheln, Notizen, History und Importvalidierung.
- Browser: Eingabe, konkrete Hinweise, Wiederherstellung, alte Spielstände, Tagesrätsel, Schwierigkeitswechsel, Offline-Neustart und Offline-Generierung. Brett, Zahlen und Aktionen werden unter anderem bei 320×568, 375×667, 390×844, 667×375 und 900×600 Pixeln auf Sichtbarkeit ohne Scrollen geprüft.

Screenshots werden unter `artifacts/` erzeugt. CI prüft die Web-App unter Linux und native Builds unter Linux, Windows und macOS; die Plattformjobs müssen auf diesen Runnern tatsächlich laufen, bevor ihre Ergebnisse als bestätigt gelten.

## Rätsel und Daten

Neue Rätsel verwenden ein verbundenes Rechenkreuz mit bis zu 11×11 Rasterpositionen und 15 Gleichungen. Jede Gleichung hat die Form `a ⊕ b = c`; alle drei Zahlen können freie Felder sein. Kreuzungen teilen sich dieselbe Zahl. Zahlen liegen zwischen 1 und 99, Division muss ohne Rest aufgehen. Leicht hat sechs freie Felder und Addition/Subtraktion; Mittel hat neun und Schwer zwölf freie Felder mit allen Rechenarten. Die Formen variieren deterministisch mit dem Startwert. Die Stufen unterscheiden sich derzeit nach fehlenden Zahlen und Rechenarten; eine feinere Kalibrierung folgt anhand von Spieltests.

Der Generator erzeugt zunächst ein vollständig korrektes Brett und entfernt nur Zahlen, wenn eine vollständige Folge von Einzelschritten erhalten bleibt. Jeder Schritt löst eine konkrete Gleichung mit genau einer unbekannten Zahl und prüft den Zahlenvorrat. Ein separater Solver zählt danach die Lösungen: Nur genau eine Lösung wird zugelassen. Bei ausgeschöpftem Suchbudget gilt eine Aufgabe als ungeprüft und wird abgelehnt. Doppelte Zahlen sind Häufigkeiten, keine verschiedenen Lösungen. Vorab mitgelieferte Aufgaben unterliegen zusätzlich dem unabhängigen Referenzprüfer in CI. Der Hinweis zeigt die unvollständige und die vervollständigte Rechnung; Fehlerkorrekturen geben falsch platzierte Kacheln zurück.

Formatversion 1 bleibt über `crates/core/src/legacy.rs` unterstützt. Laufende alte Spiele, Notizen, Verlauf und Statistiken werden erhalten. „Neues Rätsel“ startet das größere Brett. Der Tagesrätsel-Startwert verwendet für neue Aufgaben einen versionierten Namensraum; bereits gespeicherte Tagesrätsel desselben UTC-Datums bleiben erhalten.

Die Spielansicht nutzt die verfügbare dynamische Bildschirmhöhe und sichere Randabstände. Auf dem Handy liegt der Zahlenvorrat unter dem Brett, auf breiten Bildschirmen daneben. Hinweise, Einstellungen und Regeln öffnen eigene Dialoge; umfangreiche Dialoginhalte können innerhalb des Dialogs scrollen. Das Spielfeld und der Zahlenvorrat benötigen keinen Scrollbereich.

36 eigene, vorab geprüfte Aufgaben liegen in `src/data/puzzles.json`. Sie ermöglichen den unmittelbaren ersten Start und dienen bei einem Generierungsfehler als Reserve. Regeneration: `cargo run -p cross-math-core --release --example catalog > src/data/puzzles.json`.

### Hugging-Face-Datensätze

Geprüft am 11. Oktober 2026: [xuyige/CrossMath](https://huggingface.co/datasets/xuyige/CrossMath) enthält 1.000 Benchmark-Zeilen mit mehreren Darstellungen; [xuyige/CrossMath-Train](https://huggingface.co/datasets/xuyige/CrossMath-Train) enthält 5.000 Aufgaben einschließlich Tabellen, Antworten und Schritten. Beide weisen `CC BY-NC-ND 4.0` aus. Die Lizenz erlaubt nichtkommerzielle Weitergabe mit Namensnennung, untersagt jedoch die Weitergabe bearbeiteten Materials; reine Formatänderungen gelten laut [Creative Commons](https://creativecommons.org/licenses/by-nc-nd/4.0/) nicht automatisch als Bearbeitung. Eine Freigabe für den konkreten Einsatz in der interaktiven App wurde nicht festgestellt. Die App übernimmt deshalb keine Aufgaben, Bilder oder Lösungen daraus.

Die [Veröffentlichung zum Benchmark](https://arxiv.org/abs/2604.16256) beschreibt menschliche Prüfung der gleichen Informationen in Bild- und Textvarianten. Daraus folgt keine pauschale Garantie für eindeutige, ohne Raten lösbare App-Level. Falls später externe Aufgaben aufgenommen werden, benötigen sie eine passende Nutzungsfreigabe, festgehaltene Quelle/Revision und denselben vollständigen Rechenweg sowie dieselbe Eindeutigkeitsprüfung. Der Import von Spielständen prüft neue Aufgaben zusätzlich mathematisch in der Rust-Engine; reine Strukturprüfung reicht nicht.

Der Startwert, die Generatorversion und geordnete Solver-Datenstrukturen garantieren reproduzierbare Aufgaben zwischen nativen und WASM-Builds. Das konkrete Rätsel wird im Spielstand gespeichert. Tagesrätsel wechseln weltweit um 00:00 UTC; das zugehörige Datum bleibt auch beim Weiterspielen über Mitternacht erhalten.

Spielstände liegen in IndexedDB mit einem synchronen lokalen Backup. Es gibt keinen Account, kein Tracking und keine Aufgaben-API. Browserdaten können durch das Löschen von Website-Daten verloren gehen; Export/Import ermöglicht eine eigene Sicherung und Gerätewechsel.

## Struktur

```text
crates/core/       Rust: Rechenregeln, Solver, Generator, Prüfung, Hinweise
src/              React-App, Spielzustand, Speicherung, Engine-Adapter
src/wasm/         generiert, nicht versioniert
src/data/         eigene geprüfte Aufgaben
src-tauri/        native App und Commands
scripts/          WASM-Build und Vergleichsprüfung
tests/            Frontend- und Browserprüfungen
```

Die Gestaltung verwendet Systemschriften, eigene SVG-Icons und lokale Assets. Glasflächen liegen hauptsächlich auf Navigation, Zahlenpalette und Aktionen; das Spielbrett nutzt ruhigere, gut lesbare Flächen. Die Darstellung ist eine Web-Umsetzung des Liquid-Glass-Looks.
