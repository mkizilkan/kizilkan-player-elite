# KIZILKAN PLAYER ELITE v17.1.1 RC1

## Corrective scope
- Xtream edit: DNS/credential metadata is committed before optional catalogue refresh; refresh failure no longer reverts the edited DNS.
- Android edit layout: keyboard height-resize path removed; keyboard is dismissed before save.
- MPV: single native audio owner prevents old-channel audio overlap; ownership telemetry added. Surface stays behind the Activity window so RN controls can composite above it while v17.0.13 background fix remains.
- Multi-account picker: explicit selecting/reading/parsing/terminal states. Android TXT/CSV uses ContentResolver streaming parser and avoids whole-file `response.text()` and cache copy on the common path.
- Panel discovery: journal source-fingerprint mismatch blocks unsafe recovery; per-host concurrency is capped and HTTP 429/503 uses bounded Retry-After backoff.

## Preserved corrective contracts
v17.1.0 EngineProfile async closure TS2339 and PanelScan snapshot `extra` scope fixes are preserved.

## Validation boundary
Static hard-gates and TypeScript transpile syntax checks are run assistant-side. Android Gradle release compilation and physical-device acceptance are NOT claimed here; CI/device remain authoritative.
