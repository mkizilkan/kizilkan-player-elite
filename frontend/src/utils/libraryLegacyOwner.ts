import { storage } from "@/src/utils/storage";
import { registerProfileDataDrain } from "@/src/utils/profileDataReload";
import { isCatalogRestoreActive } from "@/src/utils/catalogOperations";
const claims = new Map<string, Promise<unknown>>();
registerProfileDataDrain(() => Promise.allSettled(Array.from(claims.values())));
export const libraryLegacyOwnerKey = (profileId: string): string => "kizilkan.libraryLegacyOwner." + profileId;
/** Both playlist favorites and LibraryProvider claim through the same queue; first owner wins. */
export function claimLibraryLegacyOwner(profileId: string, playlistId: string): Promise<string | null> {
  if (isCatalogRestoreActive()) return Promise.reject(new Error("Yedek geri yüklenirken eski kayıt sahipliği değiştirilemez."));
  const task = (claims.get(profileId) || Promise.resolve()).catch(() => undefined).then(async () => {
    if (isCatalogRestoreActive()) throw new Error("Yedek geri yüklenirken eski kayıt sahipliği değiştirilemez.");
    const saved = await storage.getItemStrict<string>(libraryLegacyOwnerKey(profileId), "");
    if (typeof saved === "string" && saved) return saved;
    if (!playlistId) return null;
    if (!(await storage.setItem(libraryLegacyOwnerKey(profileId), playlistId))) throw new Error("Eski kütüphane kayıtlarının liste sahibi kaydedilemedi.");
    return playlistId;
  });
  claims.set(profileId, task);
  void task.finally(() => { if (claims.get(profileId) === task) claims.delete(profileId); }).catch(() => undefined);
  return task;
}
