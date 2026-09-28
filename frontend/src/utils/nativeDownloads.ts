/**
 * KIZILKAN PLAYER v18.6.0 — Native (parçalı) indirme yardımcıları.
 * Motor: modules/kizilkan-native-core/.../DownloadEngine.kt. Görünür varsayılan klasör:
 * İndirilenler/KIZILKAN PLAYER ELITE/Filmler  ve  .../Diziler/<Dizi adı>.
 */
import { useEffect, useState } from "react";
import { KizilkanNativeCore, type NativeDownloadStatus } from "@/modules/kizilkan-native-core";
import { recordDiagnostic } from "./diagnostics";

export function safeFileName(name: string): string {
  return String(name || "video").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "video";
}

export type StartNativeDownloadArgs = {
  id: string; name: string; url: string; ext?: string; subdir: string;
  parts: number; treeUri?: string; size?: number; headers?: Record<string, string>;
  /** "download" | "record-vod" (Media3 film/dizi kaydı) */
  reason?: "download" | "record-vod";
};

export async function startNativeDownload(a: StartNativeDownloadArgs): Promise<NativeDownloadStatus | null> {
  const ext = (a.ext || "mp4").replace(/^\./, "").toLowerCase() || "mp4";
  const fileName = `${safeFileName(a.name)}.${ext}`;
  const list = await KizilkanNativeCore.downloadStart({
    id: a.id, url: a.url, headers: a.headers, subdir: a.subdir, fileName,
    treeUri: a.treeUri, size: a.size, parts: Math.max(1, Math.min(16, a.parts || 1)),
  });
  void recordDiagnostic("player", "NATIVE_DOWNLOAD_START", {
    parts: a.parts, custom: !!a.treeUri, size: a.size || 0, ext, reason: a.reason || "download", subdir: a.subdir.split("/")[0],
  }, { stage: "download", outcome: "started" });
  return list.find(d => d.id === a.id) || null;
}

/** İndirilenler ekranı: 1 sn'de bir native durum (yalnız görünürken). */
export function useNativeDownloads(active = true): NativeDownloadStatus[] {
  const [list, setList] = useState<NativeDownloadStatus[]>(() => KizilkanNativeCore.downloadStatus());
  useEffect(() => {
    if (!active) return;
    setList(KizilkanNativeCore.downloadStatus());
    const t = setInterval(() => setList(KizilkanNativeCore.downloadStatus()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return list;
}

export function fmtSpeed(bps: number): string {
  if (!bps || bps <= 0) return "";
  const mb = bps / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/sn` : `${Math.round(bps / 1024)} KB/sn`;
}

export function fmtEta(sec: number): string {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h} sa ${m} dk` : m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
}
