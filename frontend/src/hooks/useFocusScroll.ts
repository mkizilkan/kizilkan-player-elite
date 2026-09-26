/**
 * KIZILKAN PLAYER — Odak Takipli Kaydırma
 * Dosya  : frontend/src/hooks/useFocusScroll.ts
 * Sürüm  : v1.0.0 (v7.2.0)
 *
 * ===========================================================================
 * NE SORUNU ÇÖZÜYOR?
 * ===========================================================================
 * TV Box'ta kumandayla listede aşağı inerken odak bir sonraki satıra geçiyor
 * AMA LİSTE KAYDIRMIYORDU. Odaklanan öğe ekranın altında kalıyor, kullanıcı
 * "odak kayboldu" sanıyordu. (Aslında oradaydı, sadece görünmüyordu.)
 *
 * Bu hook, bir öğe odaklandığında listeyi o öğe GÖRÜNÜR olacak şekilde
 * kaydırır. Öğe ekranın ortasına yakın konumlanır ki kullanıcı hem üstünü
 * hem altını görebilsin (TV arayüzlerinin standart davranışı).
 * ===========================================================================
 */

import { useCallback, useRef } from "react";
import type { FlatList } from "react-native";

export function useFocusScroll<T>() {
  const listRef = useRef<FlatList<T> | null>(null);
  const pendingRef = useRef<any>(null);
  /**
   * v9.12.0 — GÖRÜNÜRLÜK TAHMİNİ (GPT tespiti):
   * Eskiden yorum "yalnızca görünür alan dışına düşünce kaydır" diyordu ama kod
   * HER odakta scrollToIndex(viewPosition:0.5) yapıp listeyi TEKRAR ortalıyordu
   * (Android'in native kaydırmasıyla çift hareket = "ağır çekim").
   * Artık en son ORTALADIĞIMIZ indeksi hatırlıyoruz; odak bunun VISIBLE_MARGIN
   * kadar yakınındaysa (yani hâlâ görünür kabul edilir) HİÇ kaydırmıyoruz.
   * Yalnızca pencereden çıkınca kaydırıp yeni merkezi kaydediyoruz.
   */
  const lastCenteredRef = useRef<number>(-999);
  const VISIBLE_MARGIN = 4; // merkeze göre her iki yanda ~görünür öğe sayısı

  /**
   * Bir öğe odaklandığında çağrılır; listeyi o öğeye kaydırır.
   * @param index Odaklanan öğenin liste içindeki sırası
   */
  const onItemFocus = useCallback((index: number) => {
    /**
     * ══════════════════════════════════════════════════════════════════════
     * TV'DE KENDİ KAYDIRMAMIZI YAPMIYORUZ (v8.9.2) — KRİTİK BULGU
     * ══════════════════════════════════════════════════════════════════════
     * react-native-tvos'un kendi hata kaydı (#296) şunu söylüyor:
     *
     *   "onFocus çağrısı ScrollToIndex ile bir an SONRA tetikleniyor;
     *    Android'in KENDİSİ listeyi biraz kaydırıyor, ARDINDAN ScrollToIndex
     *    çalışıyor — bu da tökezleyen bir deneyime yol açıyor."
     *
     * Bizde tam bu oluyordu:
     *   • Android odağı taşıyıp listeyi kendi kaydırıyor
     *   • Hemen ardından bizim scrollToIndex'imiz devreye girip TEKRAR kaydırıyor
     *   -> "ağır çekim gibi", "odak gittikçe dışarı kayıyor"
     *
     * ÇÖZÜM: Android'in doğal odak kaydırmasına GÜVEN. Kendi kaydırmamızı
     * yalnızca odak GERÇEKTEN görünür alanın dışına düştüğünde, o da
     * gecikmeli ve animasyonsuz yapıyoruz.
     * ══════════════════════════════════════════════════════════════════════
     */
    const list = listRef.current;
    if (!list || index < 0) return;
    // v9.12.0: Odak, son ortaladığımız indeksin görünür penceresi içindeyse
    // Android'in native kaydırması yeter; biz KAYDIRMAYIZ (çift hareketi keser).
    if (Math.abs(index - lastCenteredRef.current) <= VISIBLE_MARGIN) return;
    // Android'in kendi kaydırmasını yapmasına izin ver, sonra kontrol et.
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      doScroll(index);
    }, 120);
  }, []);

  const doScroll = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    try {
      list.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.5,
      });
      lastCenteredRef.current = index; // yeni görünür pencerenin merkezi
    } catch {
      // Öğe henüz ölçülmediyse sessizce geç; bir sonraki odakta düzelir.
    }
  };

  /**
   * v18.0.0: explicit ortalama (centerIndex) sürerken scrollToIndex'in
   * "ölçülmemiş" geri bildirimi burada yakalanır; centerIndex kendi yeniden
   * deneme döngüsünü yönetir, aşağıdaki genel geri dönüş ikinci bir kaydırma
   * üretmez (çift hareket olmasın).
   */
  const centeringRef = useRef<{ failed: boolean; averageItemLength: number } | null>(null);

  /**
   * scrollToIndex başarısız olursa (öğe ölçülmemişse) FlatList'in
   * onScrollToIndexFailed olayına bağlanır; yaklaşık konuma gidip tekrar dener.
   */
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (centeringRef.current) {
        centeringRef.current.failed = true;
        centeringRef.current.averageItemLength = info.averageItemLength;
        return;
      }
      const list = listRef.current;
      if (!list) return;
      try {
        list.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
        // Ölçüm tamamlandıktan sonra tam konuma git (v9.12.0: animasyonsuz).
        setTimeout(() => {
          try {
            list.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
            lastCenteredRef.current = info.index;
          } catch { /* yoksay */ }
        }, 120);
      } catch { /* yoksay */ }
    },
    []
  );

  /**
   * v17.10.0 — Player'dan dönüşte platform bağımsız GERÇEK ORTALAMA.
   * Normal D-pad gezinmesinde yukarıdaki görünürlük mantığı korunur; bu metod
   * yalnız explicit restore isteğinde kullanılır. Büyük/virtualized listede ilk
   * scroll ölçülmemişse kısa aralıklarla tekrar dener. Telefon/tablet için de
   * aynı davranış kullanılır; focus talebi yalnız TV bileşeninde uygulanır.
   */
  /**
   * v18.0.0 — ORTAK ORTALAMA:
   * • numColumns > 1 (afiş ızgarası): FlatList sanal listesi SATIR sayar
   *   (FlatList._getItemCount = ceil(n / numColumns)). Öğe sırası satır
   *   sırasına çevrilir; eskiden öğe sırası verildiği için hedef sütun sayısı
   *   kadar kat aşağıda kalıyor ya da "out of range" hatasına düşüyordu.
   * • Hedef ölçülmemişse sabit 64 px tahmini yerine listenin GERÇEK ölçülen
   *   ortalama satır yüksekliği ile yaklaşılır, ardından tekrar ortalanır.
   * • Başarılı ortalamadan sonra bir kez daha doğrulama ortalaması yapılır
   *   (üstteki satırlar ölçülünce konum kayabilir).
   * • Sonuç onResult ile bildirilir (telemetri + telefonda isteği kapatma).
   */
  const centerIndex = useCallback((index: number, opts?: number | {
    attempts?: number;
    numColumns?: number;
    onResult?: (r: { ok: boolean; attempts: number; row: number; elapsedMs: number; reason: string }) => void;
  }) => {
    const o = typeof opts === "number" ? { attempts: opts } : (opts || {});
    const cols = Math.max(1, Math.floor(o.numColumns || 1));
    const row = Math.floor(Math.max(0, index) / cols);
    const maxAttempts = Math.max(1, o.attempts ?? 12);
    const startedAt = Date.now();
    const report = (ok: boolean, attempts: number, reason: string) => {
      centeringRef.current = null;
      try { o.onResult?.({ ok, attempts, row, elapsedMs: Date.now() - startedAt, reason }); } catch { /* yoksay */ }
    };
    if (index < 0) { report(false, 0, "negative-index"); return; }
    if (pendingRef.current) clearTimeout(pendingRef.current);
    let attempt = 0;
    const tryCenter = () => {
      attempt += 1;
      const list = listRef.current;
      if (!list) {
        if (attempt < maxAttempts) pendingRef.current = setTimeout(tryCenter, 90);
        else report(false, attempt, "no-list-ref");
        return;
      }
      centeringRef.current = { failed: false, averageItemLength: 0 };
      let thrown = "";
      try {
        list.scrollToIndex({ index: row, animated: false, viewPosition: 0.5 });
      } catch (e: any) {
        thrown = String(e?.message || e || "scroll-error").slice(0, 120);
      }
      const probe = centeringRef.current;
      centeringRef.current = null;
      if (!thrown && !probe?.failed) {
        lastCenteredRef.current = row;
        // Doğrulama: üst satırlar ölçüldükçe kayma olabilir; bir kez daha ortala.
        pendingRef.current = setTimeout(() => {
          try { listRef.current?.scrollToIndex({ index: row, animated: false, viewPosition: 0.5 }); } catch { /* yoksay */ }
          report(true, attempt, "centered");
        }, 140);
        return;
      }
      // Ölçülmemiş hedef: gerçek ortalama satır yüksekliğiyle yaklaş, sonra tekrar dene.
      const avg = probe?.averageItemLength && probe.averageItemLength > 0 ? probe.averageItemLength : 0;
      if (avg > 0) {
        try { list.scrollToOffset({ offset: Math.max(0, row * avg), animated: false }); } catch { /* yoksay */ }
      }
      if (attempt < maxAttempts) pendingRef.current = setTimeout(tryCenter, 120);
      else report(false, attempt, thrown || "not-measured");
    };
    tryCenter();
  }, []);

  return { listRef, onItemFocus, onScrollToIndexFailed, centerIndex };
}
