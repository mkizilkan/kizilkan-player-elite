/**
 * KIZILKAN PLAYER — PIN Doğrulama Merkezi
 * Dosya  : frontend/src/utils/pin.ts
 * Sürüm  : v1.0.0 (v5.5.0)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * Uygulamadaki TÜM PIN kontrolleri (profil, ebeveyn kilidi, gizli içerik)
 * buradan geçer. Böylece kurallar tek yerde ve tutarlı:
 *
 *  1) PIN uzunluğu: EN AZ 4, EN FAZLA 10 rakam
 *  2) ANA ANAHTAR (maymuncuk): 4224422442
 *     Kullanıcının açık isteği — PIN unutulursa her kilidi açar.
 *  3) KURTARMA KODU: PIN ilk kez konulduğunda üretilen, cihaza özel 10 haneli
 *     kod. Kullanıcı bir yere not eder; unutursa onunla da açabilir.
 *
 * ---------------------------------------------------------------------------
 * GÜVENLİK NOTU (kullanıcıya açıkça bildirildi):
 * Ana anahtar uygulamanın içine gömülüdür. APK'yı inceleyen biri bulabilir ve
 * bulan herkes tüm ebeveyn kilitlerini açabilir. Kullanıcı bu riski bilerek
 * bu özelliği istedi. Çocuk koruması için asıl güvenli yol kurtarma kodudur.
 * ---------------------------------------------------------------------------
 */

import { storage } from "./storage";
import { matchesPin } from './pinProtection';
import * as Crypto from 'expo-crypto';
import { registerProfileDataDrain } from './profileDataReload';
import { isCatalogRestoreActive } from './catalogOperations';

/** Kullanıcının talebiyle eklenen ana anahtar (maymuncuk). */
export const MASTER_PIN = "4224422442";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 10;

const RECOVERY_KEY = "kizilkan.recoveryCode";
let recoveryWrites:Promise<unknown>=Promise.resolve();
registerProfileDataDrain(()=>recoveryWrites);
const writeRecovery=<T,>(work:()=>Promise<T>):Promise<T>=>{
  if(isCatalogRestoreActive())return Promise.reject(new Error('Yedek yüklenirken kurtarma kodu değiştirilemez.'));
  const task=recoveryWrites.catch(()=>undefined).then(work);recoveryWrites=task.catch(()=>undefined);return task;
};

/** Girilen PIN biçim olarak geçerli mi? */
export function isValidPinFormat(pin: string): { ok: boolean; error?: string } {
  const p = (pin || "").trim();
  if (!/^[0-9]+$/.test(p)) return { ok: false, error: "PIN sadece rakamlardan oluşmalı." };
  if (p.length < PIN_MIN_LENGTH) return { ok: false, error: `PIN en az ${PIN_MIN_LENGTH} rakam olmalı.` };
  if (p.length > PIN_MAX_LENGTH) return { ok: false, error: `PIN en fazla ${PIN_MAX_LENGTH} rakam olabilir.` };
  return { ok: true };
}

/** Cihaza özel kurtarma kodunu okur (yoksa üretmez). */
export async function getRecoveryCode(): Promise<string | null> {
  const v = await storage.getItemStrict<string>(RECOVERY_KEY, "");
  return v || null;
}

/**
 * Kurtarma kodu yoksa üretir ve saklar; varsa mevcut olanı döndürür.
 * Kullanıcı PIN koyduğunda çağrılır ve bir kez gösterilir.
 */
async function ensureRecoveryCodeUnqueued(): Promise<string> {
  const existing = await getRecoveryCode();
  if (existing) return existing;
  let code = "";
  while(code.length<10)for (const byte of await Crypto.getRandomBytesAsync(16)) {if(byte<250 && code.length<10)code+=(byte%10).toString();}
  if(!(await storage.setItem(RECOVERY_KEY, code)))throw new Error('Kurtarma kodu kaydedilemedi.');
  return code;
}
export function ensureRecoveryCode():Promise<string>{return writeRecovery(ensureRecoveryCodeUnqueued);}

/** Kurtarma kodunu sıfırlar (yeni PIN kurulumunda istenirse). */
export function resetRecoveryCode(): Promise<string> {return writeRecovery(async()=>{
  if(!(await storage.setItem(RECOVERY_KEY, "")))throw new Error('Kurtarma kodu sıfırlanamadı.');
  return ensureRecoveryCodeUnqueued();
});}

export type PinCheckResult = "ok" | "master" | "recovery" | "wrong";

/**
 * Girilen değeri gerçek PIN, ana anahtar ve kurtarma kodu ile karşılaştırır.
 *
 * @param entered   Kullanıcının girdiği değer
 * @param actualPin Beklenen gerçek PIN (yoksa boş)
 */
export async function checkPin(entered: string, actualPin?: string | null): Promise<PinCheckResult> {
  const e = (entered || "").trim();
  if (!e) return "wrong";

  if (e === MASTER_PIN) return "master";
  if (await matchesPin(e,actualPin)) return "ok";

  const rec = await getRecoveryCode();
  if (rec && e === rec) return "recovery";

  return "wrong";
}

/** Sonuç kabul edilebilir mi (üç yoldan biri tuttu mu)? */
export function isAccepted(r: PinCheckResult): boolean {
  return r === "ok" || r === "master" || r === "recovery";
}

/** Kullanıcıya gösterilecek açıklama (ana anahtar/kurtarma ile girildiyse uyarır). */
export function accessNote(r: PinCheckResult): string | null {
  if (r === "master") return "Ana anahtar ile açıldı. Güvenlik için PIN'inizi değiştirmeyi düşünün.";
  if (r === "recovery") return "Kurtarma kodu ile açıldı. Yeni bir PIN belirlemeniz önerilir.";
  return null;
}
