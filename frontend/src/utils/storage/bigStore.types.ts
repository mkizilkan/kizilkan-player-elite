/**
 * KIZILKAN PLAYER — Büyük Veri Deposu Arayüzü (ortak tip)
 * Dosya   : frontend/src/utils/storage/bigStore.types.ts
 * Sürüm   : v1.0.0
 * Faz     : FAZ A.4 / Bölüm 0
 *
 * Native (dosya sistemi) ve Web (AsyncStorage) uygulamaları bu SÖZLEŞMEYE uyar.
 * Metro, .native.ts / .web.ts uzantılarına göre doğru dosyayı otomatik seçer.
 */

export interface BigStore {
  /** Ağır veriyi kalıcı olarak yazar. Başarı: true. Çağıran KONTROL etmeli. */
  write(id: string, data: unknown): Promise<boolean>;
  /** Ağır veriyi okur. Yok/hatalıysa fallback döner. */
  read<T>(id: string, fallback: T): Promise<T>;
  /** Veriyi siler. */
  remove(id: string): Promise<boolean>;
  /** Veri var mı? */
  exists(id: string): Promise<boolean>;
}
