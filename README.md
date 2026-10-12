# Cross Math

Werbefreie Cross-Platform-App mit einer von Apple Liquid Glass inspirierten Oberfläche, gemeinsamem Rust-Kern und installierbarer Offline-PWA.

Die App enthält freie Rätsel in drei Schwierigkeitsstufen, ein gemeinsames Tagesrätsel, Notizen, Undo/Redo, kostenlose Hinweise, Pause, Statistiken, Light/Dark Mode, Einstellungen für reduzierte Bewegung/Transparenz und exportierbare lokale Spielstände. Im freien Spiel stehen unveränderte, geprüfte CrossMath-Originalaufgaben und der eigene Generator zur Auswahl. Das Tagesrätsel bleibt beim eigenen Generator, damit der begrenzte Originalkatalog keine täglichen Wiederholungen erzwingt.

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

CI liest dieselbe `.nvmrc` mit `check-latest: true`; neue LTS-Versionen werden dadurch beim nächsten Lauf verwendet. Die JavaScript-Actions verwenden Node 24. `npm run check:actions` kontrolliert die tatsächlichen Action-Metadaten einschließlich eingebetteter Composite-Actions und blockiert Node-20-Runtimes in CI. Bibliotheken ohne LTS-Kanal verwenden stabile Releases mit festgeschriebenem Lockfile. Dependabot prüft npm-Pakete und GitHub Actions wöchentlich und schlägt Updates als Pull Requests vor; sie werden vor Übernahme durch CI geprüft.

## PWA

```bash
npm run build
npm run preview
```

`dist/` auf einem statischen HTTPS-Host veröffentlichen. Die App ist nach dem ersten vollständigen Laden offline nutzbar, einschließlich neuer Rätsel und Hinweise. Der Service Worker speichert auch die WASM-Engine und den Worker. Die App bietet Updates an; der Spielstand wird vor dem Aktualisieren gesichert. Die Installation erfolgt über den Browser, auf dem iPhone über das Teilen-Menü. Der Entwicklungsserver verwendet keinen Offline-Cache.

### GitHub Pages

Im Repository unter **Settings → Pages → Build and deployment → Source** einmal **GitHub Actions** auswählen. Danach baut und veröffentlicht `.github/workflows/pages.yml` jeden Push auf `main`. Der Workflow übernimmt den von GitHub gemeldeten Pfad für Assets, Manifest, Service Worker und Offline-Navigation. Bei diesem Repository lautet die erwartete Adresse `https://ghinta.github.io/cross-math/`; der Workflow prüft nach der Veröffentlichung die tatsächlich ausgelieferte Revision und Prüfsummen von HTML, JavaScript, WASM und weiteren Build-Dateien. Ein grüner Deploy-Schritt allein reicht nicht.

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

Der Browser-Test nutzt vorhandenes `/usr/bin/chromium`, falls verfügbar; sonst das von Playwright installierte Chromium. Die Tests starten und stoppen ihren eigenen Preview-Server. Ein zusätzlicher Test wechselt eine gecachte alte PWA auf die neue Version und prüft den Erhalt des Spielstands sowie die Erkennung eines weiteren Updates.

- Rust: 288 neue Aufgaben plus alle 36 mitgelieferten Rechenkreuze werden mit unabhängig implementierter Arithmetik und vollständiger Zahlenpermutation auf genau eine Lösung geprüft. Jeder Rechenschritt wird gegen den damaligen Zahlenvorrat nachgerechnet. Die Prüfungen der alten Engine bleiben erhalten.
- WASM: 36 generierte Aufgaben werden mit dem nativen Katalog verglichen; 36 neue, 36 alte und 242 CrossMath-Originalaufgaben werden geprüft und über Hinweise vollständig gelöst. Die Originale werden zusätzlich gegen die Antworten und unveränderten Vorgaben der Quelle kontrolliert.
- Frontend: Zahlenverbrauch, doppelte Kacheln, Notizen, History und Importvalidierung.
- Browser: Eingabe, konkrete Hinweise, Wiederherstellung, alte Spielstände, Tagesrätsel, Schwierigkeitswechsel, Offline-Neustart und Offline-Generierung. Brett, Zahlen und Aktionen werden unter anderem bei 320×568, 375×667, 390×844, 667×375 und 900×600 Pixeln auf Sichtbarkeit ohne Scrollen geprüft.

Screenshots werden unter `artifacts/` erzeugt. CI prüft die Web-App unter Linux und native Builds unter Linux, Windows und macOS; die Plattformjobs müssen auf diesen Runnern tatsächlich laufen, bevor ihre Ergebnisse als bestätigt gelten.

## Rätsel und Daten

Die Engine unterstützt verbundene Rechenkreuze bis 21×21 Rasterpositionen, 36 Zahlenfeldern und 20 Gleichungen. Der eigene Generator erzeugt weiterhin Bretter bis 11×11 mit höchstens 15 Gleichungen. Jede Gleichung hat die Form `a ⊕ b = c`; alle drei Zahlen können freie Felder sein. Kreuzungen teilen sich dieselbe Zahl. Originalaufgaben können Zahlen von 1 bis 999 enthalten; der Generator verwendet 1 bis 99. Division muss ohne Rest aufgehen. Leicht hat sechs freie Felder und Addition/Subtraktion; Mittel hat neun und Schwer zwölf freie Felder mit allen Rechenarten. Die Formen variieren deterministisch mit dem Startwert. Die Stufen unterscheiden sich derzeit nach fehlenden Zahlen und Rechenarten; eine feinere Kalibrierung folgt anhand von Spieltests.

Der Generator erzeugt zunächst ein vollständig korrektes Brett und entfernt nur Zahlen, wenn eine vollständige Folge von Einzelschritten erhalten bleibt. Jeder Schritt löst eine konkrete Gleichung mit genau einer unbekannten Zahl und prüft den Zahlenvorrat. Ein separater Solver zählt danach die Lösungen: Nur genau eine Lösung wird zugelassen. Bei ausgeschöpftem Suchbudget gilt eine Aufgabe als ungeprüft und wird abgelehnt. Doppelte Zahlen sind Häufigkeiten, keine verschiedenen Lösungen. Vorab mitgelieferte Aufgaben unterliegen zusätzlich dem unabhängigen Referenzprüfer in CI. Der Hinweis zeigt die unvollständige und die vervollständigte Rechnung; Fehlerkorrekturen geben falsch platzierte Kacheln zurück.

Formatversion 1 bleibt über `crates/core/src/legacy.rs` unterstützt. Laufende alte Spiele, Notizen, Verlauf und Statistiken werden erhalten. „Neues Rätsel“ startet das größere Brett. Der Tagesrätsel-Startwert verwendet für neue Aufgaben einen versionierten Namensraum; bereits gespeicherte Tagesrätsel desselben UTC-Datums bleiben erhalten.

Die Spielansicht nutzt die verfügbare dynamische Bildschirmhöhe und sichere Randabstände. Auf dem Handy liegt der Zahlenvorrat unter dem Brett, auf breiten Bildschirmen daneben. Hinweise, Einstellungen und Regeln öffnen eigene Dialoge; umfangreiche Dialoginhalte können innerhalb des Dialogs scrollen. Das Spielfeld und der Zahlenvorrat benötigen keinen Scrollbereich.

Arbeitsbereiche enthalten vollständige, verbundene Gleichungen und können an Kreuzungen überlappen. Die Bereiche passen sich an die verfügbare Fläche an; die Gesamtübersicht ermöglicht direkte Navigation. Auf sehr niedrigen Displays wird eine senkrechte Einzelrechnung zusätzlich waagrecht angezeigt und ausdrücklich gekennzeichnet. Übersicht/Detail sind per Knopf oder Zweifingergeste erreichbar. Der optionale geführte Modus zeigt die Lösungszahlen des sichtbaren Bereichs einschließlich ihrer Häufigkeiten. Er gibt zusätzliche Hinweise und reduziert die Schwierigkeit; „Alle Zahlen“ und das Ausschalten des Modus bleiben verfügbar. Große Vorräte werden ohne Scrollen in erreichbare Seiten aufgeteilt.

36 eigene, vorab geprüfte Aufgaben liegen in `src/data/puzzles.json`. Sie dienen im Generator-Modus als geprüfte Reserve bei einem Generierungsfehler. Regeneration: `cargo run -p cross-math-core --release --example catalog > src/data/puzzles.json`.

### Hugging-Face-Datensätze

Der [1k-Benchmark xuyige/CrossMath](https://huggingface.co/datasets/xuyige/CrossMath) enthält 250 unterschiedliche Originalrätsel in vier Bildvarianten, nicht 1.000 unterschiedliche Aufgaben. Die Datei `Original/testset_hr.jsonl` enthält die 250 Originale. Die App verwendet 242 davon unverändert: 88 leichte, 84 mittlere und 70 schwere. Acht widersprüchliche Datensätze werden ausgeschlossen. Alle 242 bestehen die unabhängige arithmetische Prüfung, die Eindeutigkeitsprüfung und einen vollständig nachrechenbaren Lösungsweg. Der eigene Generator bleibt in den Einstellungen wählbar.

Zwölf Startaufgaben werden direkt eingebunden. Drei versionierte JSON-Pakete mit 100, 100 und 42 Aufgaben liegen unter `public/puzzles/`. Der Client lädt sie asynchron vom statischen Hosting, prüft SHA-256 und speichert sie in IndexedDB. Ein Paket wird im Hintergrund vorgeladen; weitere werden bei Bedarf geladen. „Alle Aufgaben herunterladen“ in den Einstellungen stellt die ganze Sammlung für Offline-Neustarts bereit. Das App-JavaScript enthält keine vollständigen Originaldatensätze oder Bilddateien.

Die Datensatzlizenz ist **CC BY-NC-ND 4.0**. Die App wird nichtkommerziell verwendet. Zahlen, Operatoren, Positionen, freie Felder und Antworten bleiben identisch; lediglich das Datenformat wird technisch umgesetzt. [CC erklärt ausdrücklich](https://creativecommons.org/faq/#can-i-take-a-cc-licensed-work-and-use-it-in-a-different-format), dass ein anderes Format auch unter ND zulässig ist. Quelle, Autoren, Lizenz und technischer Formatwechsel werden in der App und in [NOTICE.md](NOTICE.md) genannt. Für diese unveränderte nichtkommerzielle Verwendung wird keine weitere Freigabe vorausgesetzt. Die Aufgaben werden nicht unter die MIT-Lizenz des eigenen Codes gestellt.

`src/data/crossmath-originals.json` enthält Originaldatensätze, formatierte App-Aufgaben, Antworten und Quellenrevision. `src/data/crossmath-audit.json` dokumentiert die Auswahl und alle ausgeschlossenen Datensatzzeilen. Die Revision ist `b6cb3a1ff374af296786d74459cc16a931d97bc2`; der SHA-256 der Quelldatei ist mitgespeichert. Regeneration mit der unveränderten Quelldatei:

```bash
npm run build:wasm
node scripts/import-crossmath.mjs /pfad/zu/Original/testset_hr.jsonl
npm run check
npm run test:wasm
```

Der Import prüft die vollständigen Autorenantworten unabhängig arithmetisch, kontrolliert deren Gleichungsliste und lässt nur Aufgaben mit eindeutiger Lösung und vollständigem Einzelschritt-Rechenweg zu. Rust-Tests verwenden einen zweiten vollständigen Zahlenpermutationsprüfer und vergleichen jede Vorgabe mit der unveränderten Originaltabelle. Die [Benchmark-Veröffentlichung](https://arxiv.org/abs/2604.16256) allein ersetzt diese Qualitätsprüfung nicht.

### Updates und Build-Prüfung

Die App prüft den Service Worker beim Start, beim Zurückkehren, nach Wiederverbindung und einmal pro Minute im sichtbaren Tab. Neue Service Worker werden nach vollständigem Cache-Aufbau automatisch aktiviert. Sie bitten laufende Clients, ihren Spielstand zu speichern, und laden anschließend die Oberfläche neu. Auch frühe Fassungen ohne funktionierende Update-Oberfläche werden beim nächsten Online-Start aktualisiert; ihre synchronen Spielstands-Backups bleiben erhalten. „Einstellungen → Update prüfen“ löst eine zusätzliche Prüfung aus. Die Einstellungen zeigen die Commit-Kennung; `version.json` enthält die vollständige Revision und Prüfsummen aller fertig geschriebenen Build-Dateien, einschließlich Service Worker und Aufgabenpaketen. `scripts/verify-deployment.mjs` prüft diese Dateien nach dem tatsächlichen Pages-Deploy mit umgangenem HTTP-Cache.

Die Rust-Action ist auf den geprüften `stable`-Commit fixiert; `toolchain: 1.99.0` wählt den tatsächlichen Compiler. Dependabot behandelt diese Compiler-Tags nicht länger als Action-Versionen. Der fehlerhafte Vorschlag auf Rust 1.120.0 war ein unveröffentlichter Dependabot-PR und kein fehlgeschlagener Pages-Build des Hauptzweigs.

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
