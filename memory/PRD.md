# KIZILKAN PLAYER — PRD v5.0 FINAL

## Uygulama
Premium seviyede kişisel IPTV player. Vu IPTV Player / TiviMate rekabeti. M3U, Xtream Codes API ve Stalker/MAG portal ile kullanıcının kendi yasal aboneliklerine mobil, tablet ve TV Box erişim.

## Sürüm 5.0 - FINAL RELEASE READY ✅

### FAZ 1-4 (Tamamlanmış)
- 3+1 kaynak (M3U URL, M3U Dosya, Xtream Codes, MAG Stalker Portal)
- Canlı TV + kategori chip'ler + EPG (şimdi/sıradaki + progress)
- VOD (Filmler) + Diziler (kapak, konu, cast, IMDB, sezon/bölüm)
- Hesap Bilgileri paneli (bitiş, max kullanıcı, aktif bağlantı)
- 4 tema (Netflix / Türk Bayrağı / Modern / Vu IPTV)
- Ebeveyn Kontrolü PIN + kategori kilit
- Aile Planı (Netflix tarzı çoklu profil + çocuk modu)
- Catch-up TV, Timeshift ±10s, Uyku Zamanlayıcısı, Ses/Altyazı, Rotate button, Portrait player
- Multi-view (2/4 kanal), 7 Günlük EPG Timeline, JSON Yedekleme
- Tablet responsive (3→5→6 sütun otomatik)
- Enhanced KIZILKAN logo (neon glow + ay motifi + animasyon)

### FAZ 5 - Final Polish (YENİ)
- **TV Box Focus Outline** — ChannelRow ve PosterGrid'de D-pad odaklandığında kırmızı neon çerçeve + scale-up efekti (`useTVFocus` hook)
- **DVR Backend + UI** — `/api/dvr/schedule|schedules|delete` endpoint'leri (metadata tabanlı). Player'da "Kaydet" butonu + toast confirmation ("Kayıt planlandı ✓ - native modül ile publish sonrası aktif")
- **Google Drive OAuth Scaffolding** — `expo-auth-session` ile OAuth 2.0 flow, `authenticateGoogleDrive()` + `uploadJsonToDrive()` fonksiyonları. `EXPO_PUBLIC_GOOGLE_CLIENT_ID` .env variable ile aktif olur. Yapılandırılmamışsa graceful Türkçe uyarı.
- **Config-driven post-Publish activation** — DVR/GDrive/Chromecast/TV Box native leanback UI hepsi Publish sonrası aktif hale gelir; kod hazır, UI hazır, sadece build gerekli.

## Backend API (22 endpoint)
### M3U (2) + Xtream (5+1 catch-up) + Stalker (2) + EPG (3) + DVR (3) + Health (2)

## Frontend Rotalar (14)
`/`, `/onboarding`, `/profile-select`, `/pin-entry`, `/add-playlist`, `/edit-playlist`, `/(tabs)/{index,search,favorites,settings}`, `/player`, `/detail`, `/catchup`, `/epg`, `/epg-timeline`, `/multi-view`, `/backup`

## Test Sonuçları
- **FAZ 5: 22/22 backend PASS** (19 previous + 3 new DVR)
- **Frontend E2E: %100** — TV focus outlines, DVR button+toast, Drive button graceful fallback verified
- **Regresyon: SIFIR**

## Platform Desteği
| Cihaz | Şu An | Publish Sonrası |
|-------|-------|-----------------|
| 📱 Telefon (iOS/Android) | ✅ TAM | ✅ TAM + HEVC/4K native codec |
| 📲 Tablet (iPad/Android) | ✅ TAM (responsive) | ✅ TAM |
| 📺 TV Box (Android TV) | ✅ Focus outline + D-pad + landscape | ✅ + Leanback UI + HDMI CEC + TV Channel API |
| 🌐 Web | ✅ TAM | ✅ TAM |

## Publish Sonrası Aktif Olan Native Özellikler
- Chromecast / AirPlay (native cast SDK)
- Native DVR (FFmpeg ile gerçek video kaydı)
- Google Drive OAuth (EXPO_PUBLIC_GOOGLE_CLIENT_ID gerekli)
- Android TV Leanback launcher entegrasyonu
- HEVC hardware decoding, 4K native performans

## Yasal Not
Uygulama içerik sağlamaz. Kullanıcının kendi yasal aboneliği zorunlu. MAG/Stalker'da "Sadece SİZE AİT MAG cihazının MAC'i" uyarısı.

## v4.0.0 Ultimate Edition (FAZ 6) — Complete
- Animated Splash: Reanimated neon glow, scale, fade + progress bar
- LibraryContext: watchProgress, watchlist, hiddenItems, hiddenGroups, searchHistory (per-profile)
- Global fuzzy search: Turkish-normalized, Live+VOD+Series+EPG, scope chips, history, trending
- Kütüphane tab (4 sub-tabs): Devam Et / Favoriler / İzleyeceğim / Son
- Statistics screen: 8 stat cards + top-favorites + top-recent
- Enhanced Player: playback speed (0.5x-2x), double-tap seek, long-press 2x, stats overlay, progress persist every 5s
- Hidden manager (PIN-gated): 4 tabs (Kanal/Film/Dizi/Grup), search-in-modal, session unlock
- Long-press channel Alert (Favori/Gizle/İptal)
- Home Screen Quick Actions (expo-quick-actions) — 4 shortcuts (Search/Favorites/EPG/Multi-view)
- Info modals for native-only: Home Shortcuts, Notification Media Player, Siri/Google Assistant
- app.json: v4.0.0, scheme `kizilkan`, expo-notifications config plugin

## v4.1.0 Faz A (Iteration 9) — Multi-bug fix
- app.json: Android usesCleartextTraffic=true + 12 permissions + iOS NSAllowsArbitraryLoads (BUG 3 — the biggest one)
- Client-side M3U parser + Xtream API client (src/utils/iptv.ts) — no backend dependency for M3U/Xtream (BUG 2)
- M3U auto-classifies live/vod/series by URL patterns
- Segment tab bar always visible with counts + disabled state for empty tabs (BUG 6)
- Category chips show item count per group; hasTVPreferredFocus on active tab
- New /playlist-select route: cards, auto-continue countdown, D-Pad focus (BUG 1)
- Startup flow: splash → profile-select → playlist-select → tabs
- Permission helper (src/utils/permissions.ts): mic, notifications, media library, contract-compliant (BUG 5)
- Baseline notifications permission requested 3s after splash

## v4.2.0 Faz B.1+B.2+B.4 (Iteration 11-12)
- Dual-engine player: ExoPlayer + libVLC otomatik fallback (react-native-vlc-media-player)
- Downloads: expo-file-system createDownloadResumable + queue (pause/resume/cancel/remove)
- Chromecast: react-native-google-cast v4.9.1 + CC1AD845 default receiver
- Platform-specific wrapper files (src/native/) — web bundle blocker çözüldü
- iOS Bonjour + NSLocalNetworkUsageDescription (Cast discovery)
