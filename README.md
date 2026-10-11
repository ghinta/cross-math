# Cross Math

Werbefreie Cross-Platform-App mit einer von Apple Liquid Glass inspirierten Oberfläche, gemeinsamem Rust-Kern und installierbarer Offline-PWA.

Die erste Version enthält freie Rätsel in drei Schwierigkeitsstufen, ein gemeinsames Tagesrätsel, Notizen, Undo/Redo, kostenlose Hinweise, Pause, Statistiken, Light/Dark Mode, Einstellungen für reduzierte Bewegung/Transparenz und exportierbare lokale Spielstände. Alle Zahlen stammen aus dem eigenen Generator; es werden keine fremden Leveldaten verwendet.

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

- Rust: Vorrat, arithmetische Regeln, Eindeutigkeit, deterministische Erzeugung, Hinweise und ungültige Eingaben. Ein unabhängiger vollständiger Solver prüft zusätzlich ausgewählte Aufgaben.
- WASM: Alle 36 mitgelieferten Aufgaben werden mit dem nativen Katalog verglichen und über Hinweise vollständig gelöst.
- Frontend: Zahlenverbrauch, doppelte Kacheln, Notizen, History und Importvalidierung.
- Browser: Eingabe, Hinweise, Wiederherstellung, Tagesrätsel, Schwierigkeitswechsel, Offline-Neustart und Offline-Generierung, responsive Darstellung und Erscheinungsbild.

Screenshots werden unter `artifacts/` erzeugt. CI prüft die Web-App unter Linux und native Builds unter Linux, Windows und macOS; die Plattformjobs müssen auf diesen Runnern tatsächlich laufen, bevor ihre Ergebnisse als bestätigt gelten.

## Rätsel und Daten

Das erste Layout hat neun Zahlenfelder. Drei Zeilen und drei Spalten teilen sich die Felder; jede Gleichung enthält drei Zahlen, zwei feste Operatoren und ein Ergebnis. Punkt vor Strich und Linksassoziativität gelten. Division muss ohne Rest aufgehen.

Der Generator erzeugt eine vollständige Lösung und entfernt nur Zahlen, solange die Aufgabe genau eine Lösung behält. Identische Zahlen werden als Mengen mit Häufigkeiten behandelt. Ein zweiter Durchlauf prüft, ob sich alle fehlenden Werte über Gleichungen und Zahlenvorrat ableiten lassen. Die Startstufen unterscheiden sich nach Zahlenbereich, Rechenzeichen und Informationsmenge; die Lösungsbewertung wird mitgespeichert. Weitere Layouts und eine feinere Kalibrierung anhand von Spieltests können darauf aufbauen.

36 eigene, vorab geprüfte Aufgaben liegen in `src/data/puzzles.json`. Sie ermöglichen den unmittelbaren ersten Start und dienen bei einem Generierungsfehler als Reserve. Regeneration: `cargo run -p cross-math-core --release --example catalog > src/data/puzzles.json`.

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
