/**
 * KIZILKAN PLAYER — Büyük Veri Deposu (Native)
 * Dosya   : frontend/src/utils/storage/bigStore.native.ts
 * Sürüm   : v1.0.0
 * Faz     : FAZ A.4 / Bölüm 0 (liste kalıcılığı)
 *
 * ===========================================================================
 * NEDEN VAR? (P0-1 çözümü)
 * ===========================================================================
 * Kanal/film/dizi listeleri on binlerce öğe içerebilir (birkaç MB - onlarca MB).
 * Bunları AsyncStorage'a yazmak İKİ nedenle kırılıyordu:
 *
 *   1. AsyncStorage Android'de SQLite tabanlıdır ve satır başına ~2MB
 *      CursorWindow limiti vardır. Büyük liste bu limiti aşınca yazma
 *      SESSİZCE başarısız olur (setItem false döner, kimse bakmaz).
 *
 *   2. PlaylistContext ayrıca JSON.stringify uyguluyordu; storage katmanı
 *      da JSON.stringify uyguluyordu -> ÇİFT KODLAMA -> ~2x boyut.
 *
 * ÇÖZÜM: Ağır dizileri (channels/vod/series) AsyncStorage yerine gerçek
 * dosyalara yazarız. Dosya sisteminin böyle bir boyut limiti yoktur;
 * 150.000+ kanal bile sorunsuz saklanır. AsyncStorage'da yalnızca hafif
 * metadata (ad, kaynak, kimlik, sayaçlar) kalır.
 *
 * Her liste kendi dosyasına yazılır:  <documentDir>/kizilkan/playlists/<id>.json
 *
 * ===========================================================================
 * expo-file-system@19 NOTU
 * ===========================================================================
 * SDK 54 + expo-file-system@19'da klasik API (documentDirectory, readAsStringAsync,
 * writeAsStringAsync, makeDirectoryAsync) "legacy" alt-modüle taşındı. Yeni
 * File/Directory API'si de var ama legacy daha stabil ve yaygın test edilmiş.
 * Bu yüzden "expo-file-system/legacy" içe aktarıyoruz. İçe aktarma başarısız
 * olursa (ileride legacy kaldırılırsa) modül yüklenirken değil, İLK KULLANIMDA
 * anlamlı bir hata verir; uygulama açılışta çökmez.
 * ===========================================================================
 */

import type { BigStore } from "./bigStore.types";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

// Legacy API — dinamik require ile: modül yoksa uygulama açılışta çökmesin,
// sadece bu depo kullanılmaya çalışılınca anlaşılır hata versin.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let FS: any = null;
function fs() {
  if (FS) return FS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FS = require("expo-file-system/legacy");
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      FS = require("expo-file-system");
    } catch (e) {
      throw new Error(
        "expo-file-system yüklenemedi; büyük liste deposu kullanılamıyor: " + String(e)
      );
    }
  }
  return FS;
}

/** Kök klasör: <documentDir>/kizilkan/playlists/ */
function baseDir(): string {
  const f = fs();
  const doc: string = f.documentDirectory || f.cacheDirectory || "";
  // documentDirectory sonu "/" ile biter; yine de güvenli birleştirme yapalım.
  return doc.replace(/\/+$/, "") + "/kizilkan/playlists/";
}

function fileFor(id: string): string {
  // id'de dosya adını bozacak karakter olabilir; güvenli hale getir.
  const safe = String(id).replace(/[^a-zA-Z0-9_.-]/g, "_");
  return baseDir() + safe + ".json";
}

async function ensureDir(): Promise<void> {
  const f = fs();
  const dir = baseDir();
  try {
    const info = await f.getInfoAsync(dir);
    if (!info.exists) {
      await f.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // makeDirectory bazı sürümlerde zaten-var durumunda atar; yut.
    try {
      await f.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* son çare: sessiz geç, write anında gerçek hata yakalanır */
    }
  }
}

export const bigStore: BigStore = {
  /**
   * Bir listenin ağır verisini (channels/vod/series) dosyaya yazar.
   * Başarıyı boolean döndürür — çağıran taraf bunu KONTROL ETMELİDİR.
   */
  async write(id: string, data: unknown): Promise<boolean> {
    try {
      await ensureDir();
      const f = fs();
      const json = JSON.stringify(data);
      await f.writeAsStringAsync(fileFor(id), json, {
        encoding: f.EncodingType?.UTF8 ?? "utf8",
      });
      KizilkanNativeCore.invalidatePlaylist(id);
      return true;
    } catch (e) {
      console.warn("[bigStore.write] başarısız:", id, e);
      return false;
    }
  },

  /**
   * Bir listenin ağır verisini dosyadan okur. Yoksa/parse hatasında fallback döner.
   */
  async read<T>(id: string, fallback: T): Promise<T> {
    try {
      const f = fs();
      const path = fileFor(id);
      const info = await f.getInfoAsync(path);
      if (!info.exists) return fallback;
      // v15.2 Native Core: ağır JSON parse işini JS/Hermes thread'de yapma.
      if (KizilkanNativeCore.available) {
        try {
          const nativeValue = await KizilkanNativeCore.readPlaylistHeavy<T>(id);
          if (nativeValue !== null && nativeValue !== undefined) return nativeValue as T;
        } catch (nativeError) {
          console.warn("[bigStore.read] Native Core fallback:", id, nativeError);
        }
      }
      const raw = await f.readAsStringAsync(path, {
        encoding: f.EncodingType?.UTF8 ?? "utf8",
      });
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn("[bigStore.read] başarısız:", id, e);
      return fallback;
    }
  },

  /** Bir listenin dosyasını siler. */
  async remove(id: string): Promise<boolean> {
    try {
      const f = fs();
      const path = fileFor(id);
      const info = await f.getInfoAsync(path);
      if (info.exists) {
        await f.deleteAsync(path, { idempotent: true });
      }
      try { await KizilkanNativeCore.removePlaylistIndex(id); } catch {}
      return true;
    } catch (e) {
      console.warn("[bigStore.remove] başarısız:", id, e);
      return false;
    }
  },

  /** Bir listenin dosyasının var olup olmadığını söyler. */
  async exists(id: string): Promise<boolean> {
    try {
      const f = fs();
      const info = await f.getInfoAsync(fileFor(id));
      return !!info.exists;
    } catch {
      return false;
    }
  },
};
