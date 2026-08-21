#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: |
  KIZILKAN PLAYER - Ultimate Edition (v4.0.0)
  User asked to integrate ALL of the following in sequence, then produce APK:
  1) UI/UX Polish (animated splash, skeleton loading, haptics, ripple, blur)
  2) Favorites + Watch History + Continue Watching + Watchlist + Statistics
  3) Advanced Search with fuzzy matching across Live/VOD/Series/EPG + Search history + Trending
  4) Video Player: Playback speed, gestures (double-tap seek, long-press 2x), stats overlay, watch progress tracking
  5) Extended Parental Control: Hide individual channels/movies/series/groups with PIN lock
  6) Home Screen Shortcuts (expo-quick-actions)
  7) Universal Search (Siri/Google Assistant) — scaffolded, requires native build
  8) Android Notification Media Player — scaffolded, requires native build

frontend:
  - task: "Animated splash screen with KIZILKAN glow"
    implemented: true
    working: "NA"
    file: "app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Reanimated scale + fade + pulse glow + neon loading bar. Verified via screenshot."

  - task: "Global fuzzy search (Live/VOD/Series) with history + trending"
    implemented: true
    working: "NA"
    file: "app/(tabs)/search.tsx, src/utils/fuzzy.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Custom Turkish-aware fuzzy search. Scope chips (Tümü/Kanallar/Filmler/Diziler). Search history, trending, VOD includes year/group, Series includes cast/director/genre."

  - task: "Enhanced Library tab (Continue/Favorites/Watchlist/Recent)"
    implemented: true
    working: "NA"
    file: "app/(tabs)/favorites.tsx, src/store/LibraryContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "New LibraryContext for per-profile watchProgress, watchlist, hidden items, search history. 4-tab UI with counts."

  - task: "Statistics screen"
    implemented: true
    working: "NA"
    file: "app/stats.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Modal screen: 8 stat cards (total watch, in-progress, favorites, watchlist, channels, movies, series, recent). Top favorites + top recent lists."

  - task: "Enhanced Video Player: Speed, Gestures, Stats"
    implemented: true
    working: "NA"
    file: "app/player.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added playback speed control (0.5x-2x), double-tap left/right seek (VOD only), long-press 2x speed, stats overlay (resolution/duration/codec), progress persistence every 5s to LibraryContext."

  - task: "Extended Parental: Hide items with PIN"
    implemented: true
    working: "NA"
    file: "app/hidden-manager.tsx, app/hidden-pin.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PIN-gated hidden manager. 4 tabs (Kanal/Film/Dizi/Grup). Hidden items disappear from all lists until session-unlock. Long-press on ChannelRow shows Alert with hide option. Detail page has eye-toggle."

  - task: "Home Screen Quick Actions + Notification/Siri scaffolding"
    implemented: true
    working: "NA"
    file: "src/utils/quickActions.ts, app/_layout.tsx, app/(tabs)/settings.tsx, app.json"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "expo-quick-actions registered with 4 shortcuts (Search/Favorites/EPG/Multi-view). Settings shows informational modals for Home Shortcuts, Notification Media Player (react-native-track-player), and Siri/App Intents — all clearly marked as NATIVE-build required."

  - task: "Haptic feedback + Skeleton loader"
    implemented: true
    working: "NA"
    file: "src/utils/haptic.ts, src/components/Skeleton.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Wrapper for expo-haptics (safe web no-op). Skeleton with reanimated shimmer. Applied to buttons, chip selection, favorite toggles, long-press."

metadata:
  created_by: "main_agent"
  version: "4.0.0"
  test_sequence: 6
  run_ui: false

test_plan:
  current_focus:
    - "Animated splash screen with KIZILKAN glow"
    - "Global fuzzy search (Live/VOD/Series) with history + trending"
    - "Enhanced Library tab (Continue/Favorites/Watchlist/Recent)"
    - "Extended Parental: Hide items with PIN"
    - "Enhanced Video Player: Speed, Gestures, Stats"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 6: Massive feature additions for v4.0.0 Ultimate Edition.
        Please regression-test all existing 22 backend endpoints (M3U parse, Xtream login/load/vod/series, MAG stalker, EPG, DVR, catchup) — no backend logic changed but requests may increase due to new UI.
        For frontend, focus on:
        1) NEW /search — fuzzy search (Turkish accents), scope chips, empty-state shows history + trending
        2) NEW /(tabs)/favorites — 4 tabs (Devam Et / Favoriler / İzleyeceğim / Son)
        3) NEW /stats and /hidden-manager and /hidden-pin routes
        4) Enhanced /player with speed sheet (0.5x-2x), stats sheet, gesture flash messages
        5) Long-press on ChannelRow shows Alert with actions
        6) Splash screen has KIZILKAN neon glow animation and loading bar
        BACKEND URL: http://localhost:8001, has /api/health returning ok/connected.
        USE testing with a sample M3U URL: https://iptv-org.github.io/iptv/countries/tr.m3u for functional testing.


## Iteration 8 — Network Failure Fix

user_reported_bug: |
  "Link yüklerken network hatası veriyor" — All connection types (M3U/Xtream/MAG) 
  show "Network request failed" error on installed APK build.
  Root cause: EXPO_PUBLIC_BACKEND_URL in .env pointed to the preview URL
  (python-app-builder-13.preview.emergentagent.com) which is less reliable than 
  the production URL (python-app-builder-13.emergent.host). APK had preview URL baked in.

frontend:
  - task: "Backend URL fallback resolver + retry logic"
    implemented: true
    working: "NA"
    file: "src/utils/api.ts, .env"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            1) Changed .env EXPO_PUBLIC_BACKEND_URL from preview → production URL
               (python-app-builder-13.emergent.host).
            2) Added FALLBACK_URLS array with both production and preview hosts.
            3) resolveBackend() probes /api/health with 6s timeout; first success becomes sticky.
            4) Cached backend is invalidated on network error, triggering re-resolve on next call.
            5) Turkish user-friendly error message with the tried URLs.
            6) dvrDelete() migrated to use resolveBackend as well.

  - task: "Diagnostic (Bağlantı Testi) screen"
    implemented: true
    working: "NA"
    file: "app/diagnostic.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            New modal screen at /diagnostic. Shows status of each configured backend URL
            with green/red dots + response time. Auto-runs on mount. Retry button.
            Tap-to-copy URL. Reachable from Settings and from error state in add-playlist.

  - task: "add-playlist error box shows Diagnostic button on network errors"
    implemented: true
    working: "NA"
    file: "app/add-playlist.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            When error text matches /sunucu|ulaş|network|erişil|internet/i,
            show "Bağlantıyı Test Et" pill button that navigates to /diagnostic.

test_plan:
  current_focus:
    - "Backend URL fallback resolver + retry logic"
    - "Diagnostic (Bağlantı Testi) screen"
    - "add-playlist error box shows Diagnostic button on network errors"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 8: User's installed APK cannot reach backend for any playlist type
        (M3U, Xtream, MAG) with "Network request failed" error.
        Applied fixes:
        1) .env EXPO_PUBLIC_BACKEND_URL now points to production (.emergent.host).
        2) Added multi-URL fallback resolver in api.ts.
        3) Added /diagnostic modal screen with per-URL status dots.
        4) add-playlist shows "Bağlantıyı Test Et" button when error is network-related.
        Please regression-test the 22 backend endpoints on both URLs:
          - https://python-app-builder-13.emergent.host/api/health  (should be 200)
          - https://python-app-builder-13.preview.emergentagent.com/api/health (should be 200)
        Frontend: verify /diagnostic screen loads and shows both URLs testing successfully.
        Verify api.ts still handles Xtream/M3U/Stalker requests without regression.

## Iteration 9 — Faz A: Multi-bug fix (User reported 6 issues)

user_reported_bugs: |
  1) Startup always shows "add playlist" instead of profile/playlist selection.
  2) VPN required + all traffic proxied via Emergent servers (except MAG).
  3) Most channels don't play: "CLEARTEXT communication not permitted by network security policy".
  4) DVR & Chromecast features not actually functional.
  5) No runtime permission requests (mic, storage, notifications).
  6) VOD/Series don't show groups like Live TV; search issues.

frontend:
  - task: "app.json: usesCleartextTraffic, full permissions, iOS ATS"
    implemented: true
    working: "NA"
    file: "app.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Android: usesCleartextTraffic=true + 12 permissions (RECORD_AUDIO, MEDIA, NOTIFICATIONS, FOREGROUND_SERVICE_MEDIA_PLAYBACK etc.).
            iOS: NSAppTransportSecurity.NSAllowsArbitraryLoads=true + microphone/photo usage descriptions in Turkish.
            **CRITICAL — this alone unblocks the majority of HTTP-only IPTV channels.**

  - task: "Client-side M3U + Xtream parser (backend bypass)"
    implemented: true
    working: "NA"
    file: "src/utils/iptv.ts, app/add-playlist.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            NEW /app/frontend/src/utils/iptv.ts (~350 lines):
              parseM3U (auto-classifies live/vod/series by URL patterns + ext),
              fetchAndParseM3U (direct HTTP with VLC UA),
              xtreamLogin/liveStreams/vod/series/vodInfo/seriesInfo — direct player_api.php calls.
              MAG/Stalker still goes through backend (protocol requires it).
            add-playlist.tsx switched to use new client-side functions for m3u_url, m3u_file, xtream.
            No more dependency on Emergent backend for M3U/Xtream (VPN issue resolved).

  - task: "VOD/Series group chips + prominent segmented tab bar"
    implemented: true
    working: "NA"
    file: "app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Segment tab bar (Canlı/Filmler/Diziler) now ALWAYS shown with counts + disabled state.
            Height increased 36→48 for touch + TV Box focus visibility.
            haptic.soft on tab switch, hasTVPreferredFocus on active tab.
            Category chips show item count per group; empty-state hint for VOD/Series lists.
            Groups computed from currentList — works for all three tabs equally.

  - task: "Startup flow: always show profile-select then playlist-select"
    implemented: true
    working: "NA"
    file: "app/index.tsx, app/profile-select.tsx, app/playlist-select.tsx (NEW), app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            app/index.tsx: after splash, always route to /profile-select (if playlists exist).
            profile-select: on select → /playlist-select (was /(tabs)).
            NEW /playlist-select.tsx: cards for each saved playlist, "SON" badge on last-used,
              4s auto-continue with countdown to last playlist (cancelable),
              hasTVPreferredFocus on first card, "Yeni Liste Ekle" call-to-action,
              "Profil değiştir" back-link.
            Fast path: if only 1 playlist and profile, auto-selects and goes to /(tabs).

  - task: "Runtime permission helper + baseline request"
    implemented: true
    working: "NA"
    file: "src/utils/permissions.ts, app/_layout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            askPreConsent (friendly TR modal), offerSettings (openSettings), requestMicrophone,
            requestNotifications (expo-notifications), requestMediaLibrary (dynamic).
            Baseline notifications permission requested 3s after splash.
            Honors canAskAgain flag → offerSettings on permanent denial.

test_plan:
  current_focus:
    - "Client-side M3U + Xtream parser (backend bypass)"
    - "VOD/Series group chips + prominent segmented tab bar"
    - "Startup flow: profile-select → playlist-select → tabs"
    - "app.json cleartext HTTP + permissions"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 9 — Faz A implementing user's 6-issue list.
        Backend regression: run all 22 tests — no backend code changed but ensure still 22/22.
        Frontend: verify NEW /playlist-select route works, add-playlist uses client-side parsing (fetch /player_api.php DIRECTLY, no calls to /api/xtream/* or /api/m3u/*).
        Test M3U with public URL https://iptv-org.github.io/iptv/countries/tr.m3u — should auto-classify live vs vod vs series.
        VOD/Series tabs should show group chips. Empty state for no-vod / no-series playlists is friendly.
        app.json changes are BUILD-TIME only — can only be fully verified after user rebuilds APK.

## Iteration 10 — EPG group filter + client-side Xtream EPG + format compat

user_reported_bugs: |
  1) EPG not showing at all.
  2) EPG stuck on first group — changing group doesn't refresh EPG.
  3) Does the player support MKV, M3U8, AVI, HTTPS? Wants seamless playback.

frontend:
  - task: "EPG timeline group filter chips + auto-reload on group change"
    implemented: true
    working: "NA"
    file: "app/epg-timeline.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Rewrote epg-timeline.tsx from scratch.
            NEW: Category filter chip strip at top (Tümü + each group with counts).
            selectedGroup state; channels list re-filters by group.
            useEffect(programs load) now depends on `channels` and `selectedGroup`, so switching group triggers reload.
            Cancellation guard prevents stale data races.
            Empty state message when no EPG for selected group.
            hasTVPreferredFocus + focusable on chips → TV Box D-Pad compatible.

  - task: "Client-side Xtream EPG (xtreamShortEpg, xtreamNowNextBatch)"
    implemented: true
    working: "NA"
    file: "src/utils/iptv.ts, app/(tabs)/index.tsx, app/epg-timeline.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            New functions in iptv.ts:
              xtreamShortEpg(cred, stream_id, limit=24) — calls player_api.php?action=get_short_epg,
                decodes base64 title/description.
              xtreamNowNextBatch(cred, ids, concurrency=8) — parallel fetch now/next for many channels.
            index.tsx: Live TV useEffect now supports Xtream client-side EPG.
              Also falls back to backend api.epgNowNext for XMLTV-configured playlists.
            epg-timeline.tsx: Same dual-source approach — Xtream direct player_api call, else backend.

  - task: "Player: better error messages with codec/format hints"
    implemented: true
    working: "NA"
    file: "app/player.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            statusChange listener now inspects error and adds Turkish contextual hint:
              cleartext/security policy → "Uygulamayı yeniden derleyin"
              AVI → "sınırlı destek, MP4/HLS önerilir"
              WMV/FLV → "nadir destek"
              timeout → "Sunucu yanıt vermiyor"
              404 → "Kanal bulunamadı, liste güncel olmayabilir"
              403 → "Erişim engellendi, abonelik süresi dolmuş olabilir"
              network → "VPN veya farklı Wi-Fi deneyin"

  - task: "Settings: Formats info modal + HTTPS confirmation"
    implemented: true
    working: "NA"
    file: "app/(tabs)/settings.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            New "Desteklenen Formatlar" settings entry that opens a comprehensive modal listing:
              ExoPlayer/AVPlayer supported formats (MP4/MKV/TS/HLS/DASH/WebM) with checkmarks
              Protocol support (HTTP + HTTPS both work — HTTPS was always supported natively)
              Multi-audio/subtitle track note.
              Warning about AVI/WMV/FLV limited support and DRM incompatibility.

test_plan:
  current_focus:
    - "EPG timeline group filter chips + auto-reload on group change"
    - "Client-side Xtream EPG (xtreamShortEpg, xtreamNowNextBatch)"
    - "Player: better error messages"
    - "Settings: Formats info modal"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 10 — EPG fixes + format compat clarity.
        Backend: 22/22 regression check.
        Frontend: 
          1) /epg-timeline route — now shows category chips at top. Switching group MUST re-trigger EPG load.
             For Xtream playlists it goes direct to player_api.php (no /api/epg/* calls).
             For M3U-with-XMLTV, falls back to /api/epg/channel.
          2) /(tabs) live TV EPG — Xtream playlists use client-side xtreamNowNextBatch. No backend calls.
          3) Player error messages now include codec/format hints in Turkish.
          4) Settings > "Desteklenen Formatlar" — new info modal.
        Please verify no regression in existing tests and confirm the new group filter works end-to-end.

## Iteration 11 — Faz B.1 (VLC dual-engine) + B.4 (Downloads) + B.2 (Chromecast)

frontend:
  - task: "Dual-engine player (ExoPlayer → VLC auto-fallback)"
    implemented: true
    working: "NA"
    file: "app/player.tsx, src/components/SmartVideoPlayer.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Installed react-native-vlc-media-player. In player.tsx, when
          ExoPlayer statusChange fires an error and VLC is available on native,
          setUseVLC(true) switches to VLC renderer inline. Fit modes mapped
          (contain→0, cover→3, fill→2). VLC engine indicator added to top bar
          info line ("• VLC"). SmartVideoPlayer wrapper also created for future use.

  - task: "Downloads: VOD/Series file downloads + queue"
    implemented: true
    working: "NA"
    file: "src/store/DownloadContext.tsx, app/downloads.tsx, app/detail.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          DownloadProvider with expo-file-system createDownloadResumable.
          Queue with add / pause / resume / cancel / remove / clearCompleted.
          Persisted to storage (kizilkan.downloads.v1). Interrupted downloads
          restored as "paused" on cold start. Downloads dir = documentDirectory/downloads/.
          /downloads modal route: active + completed sections, progress bar,
          human-readable byte sizes, Turkish status labels.
          detail.tsx: "İndir" button for VOD items with url; when completed
          shows "Çevrimdışı Hazır" and opens local file in player.

  - task: "Chromecast (react-native-google-cast)"
    implemented: true
    working: "NA"
    file: "src/components/CastButton.tsx, app/player.tsx, app.json"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Installed react-native-google-cast v4.9.1 with config plugin
          (iosReceiverAppId, androidReceiverAppId = CC1AD845 default receiver).
          CastButton lazy-loads native module — safe on web.
          Player top bar has cast button next to rotation button — passes
          current channel URL + name + poster to media receiver.
          iOS infoPlist: NSLocalNetworkUsageDescription + NSBonjourServices
          [_googlecast._tcp] added.

  - task: "Settings: Downloads link"
    implemented: true
    working: "NA"
    file: "app/(tabs)/settings.tsx"
    priority: "low"
    needs_retesting: true

test_plan:
  current_focus:
    - "Dual-engine player (ExoPlayer → VLC auto-fallback)"
    - "Downloads: VOD/Series file downloads + queue"
    - "Chromecast (react-native-google-cast)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 11 — Faz B.1 + B.4 + B.2 combined.
      No backend changes; verify 22/22 still passing.
      Frontend focus:
        1) /downloads route works; DownloadProvider wraps app in _layout.tsx.
        2) detail.tsx for a VOD item shows "İndir" button that adds to queue.
        3) app.json includes react-native-google-cast + react-native-vlc-media-player
           config plugins, and iOS Bonjour service for Cast discovery.
        4) player.tsx handles ExoPlayer error → sets useVLC=true (native only).
           Cast button appears in player top bar.
        5) On web, VLC + Cast are safe no-ops (lazy-required).
      Full end-to-end can only be tested on native APK; verify code + config.
