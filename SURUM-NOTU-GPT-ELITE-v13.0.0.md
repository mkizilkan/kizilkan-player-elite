# GPT KIZILKAN PLAYER ELITE v13.0.0 — Playback Reliability

## Panel taraması
- Android'de kullanıcı tarafından başlatılan panel/DNS taraması native foreground data-sync service'e taşındı.
- Uygulama arka plana alınsa da tarama JS timer'ına bağlı kalmaz.
- Bildirimde taranan/toplam ve bulunan hesap sayısı güncellenir.
- Sonuçlar SharedPreferences snapshot'ına sürekli yazılır; uygulama görünürken yaklaşık 450 ms aralıkla UI'ya aktarılır.
- İlk geçerli DNS hesabı bulunduğu anda sonuç modalı açılabilir; tüm taramanın bitmesi beklenmez.
- Kodum var / Paneli biliyorum / Paneli bilmiyorum yolları aynı native aday tarayıcısını kullanır.
- Native modül yoksa mevcut JS tarayıcı fallback olarak korunur.

## Playback Reliability
- Gerçek playback yolu `PlayerHost.tsx` olarak korunur.
- `SmartVideoPlayer.tsx` legacy/deprecated olarak işaretlendi, silinmedi.
- Exo başarı kriteri artık yalnız readyToPlay/error değildir: `onFirstFrameRender` gerçek video karesini doğrular.
- AUTO Exo'da 4.5 sn first-frame yoksa alternatif SurfaceView/TextureView profili denenir.
- Alternatif Exo yüzeyi de first-frame üretmezse VLC HW profiline geçilir.
- VLC HW yaklaşık 5.5 sn içinde video-output sinyali üretmezse VLC SW decoder profiliyle yeniden kurulur.
- Kanal motor hafızası yalnız video sağlığı doğrulandıktan sonra yazılır.
- Hafıza profil düzeyindedir: exo:surfaceView, exo:textureView, vlc:hw, vlc:sw.
- Per-channel AUTO recovery, kullanıcının global surface/hardware ayarını kalıcı olarak değiştirmez.
- Kanal/session değişiminde first-frame ve recovery state tamamen sıfırlanır.
- Eski Exo motoru VLC fallback öncesinde pause + replace(null) ile kaynağı bırakır.
- VLC yeniden denemeleri key ile native view'ı gerçekten yeniden kurar.

## Mimari
`PlayerHost` = tek gerçek playback orkestratörü.
Exo ve VLC ayrı engine/profil olarak kalır; tek health contract altında yönetilir.
`SmartVideoPlayer` yeni geliştirmelerde kullanılmamalıdır.

## Sürüm
- version: 13.0.0
- buildNumber: 13.0.0
- Android versionCode: 130000
- package: com.gpt.kizilkan.player
