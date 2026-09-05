# DOGRULAMA — v17.1.1 RC1

Hard gates:
- check-v1711-edit-transaction.js
- check-v1711-mpv-ownership-overlay.js
- check-v1711-native-file-picker.js
- check-v1711-discovery-hardening.js
- preserved v17.1.0 EngineProfile and PanelScan extra-scope gates

Device acceptance:
1. Edit Xtream DNS, save with refresh enabled; new DNS must remain even if refresh fails.
2. Save screen must retain stable form/footer geometry and Back must remain responsive.
3. MPV channel A -> B: A audio must stop before/when B begins; no overlap.
4. MPV controls must be visibly composited, not merely touchable.
5. Large TXT/CSV: UI must show Selecting -> Reading -> Parsing/Ready and must not remain stuck on picker state.
6. Interrupted scan must reject recovery when source fingerprint differs.
