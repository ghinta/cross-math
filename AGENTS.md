# Versionen und Abhängigkeiten

- Verwende die jeweils neueste Node.js-LTS-Version. Prüfe dafür den offiziellen Release-Index; verwende keine Current- oder Vorabversionen.
- `.nvmrc` ist die zentrale Vorgabe (`lts/*`). GitHub Actions lesen diese Datei mit `check-latest: true`.
- Verwende aktuelle stabile GitHub Actions mit unterstützter Node-LTS-Runtime. Prüfe auch die Actions innerhalb zusammengesetzter Actions auf veraltete Runtimes.
- Für Bibliotheken ohne LTS-Kanal gelten aktuelle stabile, kompatible Releases. Behalte exakte npm-Versionen und die Lockfiles für reproduzierbare Builds bei.
- Die Version der `wasm-bindgen`-CLI muss zur Rust-Abhängigkeit im `Cargo.lock` passen. Aktualisiere beide gemeinsam und prüfe native/WASM-Gleichheit.
