# GÜNCEL DURUM — KIZILKAN PLAYER ELITE v15.2.0-RC1

**Native Core Migration Phase 1 başladı.** Ağır playlist JSON parse Android Kotlin Native Core'a, panel bilinmiyor çoklu hesap taraması foreground native service'e taşındı. React Native UI korunuyor. MPV dependency 1.0.0 olarak korunuyor.

Kritik amaç: playlist seçimi sonrası 5–10 dakika Pressable/navigation kilitlenmesini ve uygulama background'a alınınca çoklu hesap taramasının durmasını kökten gidermek. Bu sürüm gerçek cihaz/GitHub build ile doğrulanmadan stabil sayılmaz.

---

# BAŞLARKEN OKU — KIZILKAN PLAYER ELITE

**Güncel çalışma: v15.1.1-RC1**

Yeni sohbet/model için ilk ve zorunlu belge: **`AI-PROJE-DEVIR-BAGLAM.md`**.

Kritik gerçekler:

- Motor zinciri: **Media3 → MPV/FFmpeg → VLC**.
- Native MPV artık `libmpv 1.0.0` multiple-instance API migration hattındadır.
- Son kanıtlı/kurulmuş APK: v15.0.4.
- v15.1.1-RC1 henüz GitHub full build ve cihaz kabul testi geçmedi.
- Kör patch/fallback yasaktır; önce kök neden kanıtlanır.
- Çalışan özellik silinmez/azaltılmaz.
- Her ZIP `gpt-kizilkan-player-elite/` kökü ve güncel AI devir belgesi ile çıkar.

Detay için sırasıyla:
1. `AI-PROJE-DEVIR-BAGLAM.md`
2. `SURUM-NOTU-GPT-ELITE-v15.1.1-RC1.md`
3. `REGRESYON-DENETIM-GPT-ELITE-v15.1.1-RC1.md`
