/**
 * KIZILKAN PLAYER — Büyük Veri Deposu (giriş noktası)
 * Dosya   : frontend/src/utils/storage/bigStore.ts
 * Sürüm   : v1.0.0
 * Faz     : FAZ A.4 / Bölüm 0
 *
 * Metro bu import'u platforma göre çözer:
 *   - native  -> bigStore.native.ts (expo-file-system)
 *   - web     -> bigStore.web.ts    (AsyncStorage/IndexedDB)
 *
 * Kullanım:
 *   import { bigStore } from "@/src/utils/storage/bigStore";
 *   await bigStore.write(id, { channels, vod, series });
 *   const data = await bigStore.read(id, { channels: [], vod: [], series: [] });
 */
export { bigStore } from "./bigStore.native";
export type { BigStore } from "./bigStore.types";
