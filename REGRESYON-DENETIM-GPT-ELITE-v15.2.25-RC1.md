# REGRESYON DENETİMİ — v15.2.25 RC1

Zorunlu kapılar:
- Player Core v15
- v15.2.14 Stalker/Backup fixture
- v15.2.15 TypeScript contract
- v15.2.16 diagnostics/session cache
- v15.2.17 scan transport/MAG connection
- v15.2.18-v15.2.24 tüm önceki hard-gate'ler
- v15.2.25 MAG architecture fixture
- TDZ self-test

v15.2.25 fixture ayrıca şunları doğrular:
1. MAG254 ilk başarılı handshake tek istekte durur.
2. HTTP 512 + error JSON handshake başarısı sayılmaz ve request fırtınası oluşmaz.
3. Duplicate VOD sayfası bounded biçimde durur.
4. Enrichment `await addPlaylist` sonrasında başlar.
5. Native partial kind replace LIVE verisini silmeden VOD/Series günceller.
