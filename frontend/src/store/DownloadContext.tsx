/**
 * DownloadContext — Manages movie/series downloads.
 * Uses expo-file-system's resumable download API.
 * Supports queue, progress, pause/resume, cancel, delete.
 * Downloads go to app documentDirectory/downloads/<id>.<ext>.
 * Web is a no-op (file system limited).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
// expo-file-system@19 (SDK 54): documentDirectory + createDownloadResumable
// klasik API "legacy" alt-modüle taşındı. /legacy import'u bu fonksiyonların
// çalışmasını garanti eder (P0-8 düzeltmesi). Yeni File/Directory API'sine
// geçiş ileride ayrı yapılabilir; legacy stabil ve tam desteklidir.
import * as FileSystem from "expo-file-system/legacy";
import { storage } from "@/src/utils/storage";

const STORAGE_KEY = "kizilkan.downloads.v1";
const DOWNLOAD_DIR = (FileSystem as any).documentDirectory ? `${(FileSystem as any).documentDirectory}downloads/` : null;

export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadItem {
  id: string;
  name: string;
  poster?: string | null;
  sourceUrl: string;
  localUri?: string;
  ext: string;
  kind: "vod" | "series" | "episode" | "channel";
  bytesDownloaded: number;
  totalBytes: number;
  status: DownloadStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  // Progress percentage 0..1
  progress: number;
  /** GERÇEK RESUME: pause anında saklanan devam verisi (5GB kopunca baştan inmesin). */
  resumeData?: string | null;
  /** Kullanıcının seçtiği hedef. app = uygulama içi, downloads = paylaşılabilir. */
  saveTarget?: "app" | "downloads";
}

interface DownloadContextValue {
  downloads: DownloadItem[];
  add: (item: Omit<DownloadItem, "bytesDownloaded" | "totalBytes" | "status" | "startedAt" | "progress">) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  isDownloaded: (id: string) => boolean;
  getLocalUri: (id: string) => string | undefined;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

// Runtime map of active DownloadResumable instances (not persisted)
const activeMap = new Map<string, any>();

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const persistRef = useRef<DownloadItem[]>([]);

  // Load persisted list
  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>(STORAGE_KEY, "");
      if (!raw) return;
      try {
        const list = JSON.parse(raw) as DownloadItem[];
        // Mark any "downloading" items as paused (they were interrupted by app close)
        const restored = list.map(d => d.status === "downloading" ? { ...d, status: "paused" as DownloadStatus } : d);
        setDownloads(restored);
        persistRef.current = restored;
      } catch { /* ignore */ }
      // ensure downloads dir exists
      if (DOWNLOAD_DIR && Platform.OS !== "web") {
        try { await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true }); } catch { /* exists */ }
      }
    })();
  }, []);

  const persist = useCallback((list: DownloadItem[]) => {
    persistRef.current = list;
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  }, []);

  const patchOne = useCallback((id: string, patch: Partial<DownloadItem>) => {
    setDownloads(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...patch } : d);
      persist(next);
      return next;
    });
  }, [persist]);

  const startDownload = useCallback(async (item: DownloadItem) => {
    if (Platform.OS === "web" || !DOWNLOAD_DIR) {
      patchOne(item.id, { status: "failed", error: "Web'de indirme desteklenmiyor" });
      return;
    }

    // KLASÖR GARANTİSİ (indirme hatası düzeltmesi):
    // ESKİ: klasör sadece uygulama açılışında bir kez oluşturulmaya çalışılıyor
    // ve hatası sessizce yutuluyordu. Klasör yoksa native taraf
    // 'downloadResumableStartAsync' hatası veriyordu.
    // YENİ: her indirmeden ÖNCE klasörü kontrol et/oluştur, hata olursa bildir.
    try {
      const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
      }
    } catch (e: any) {
      patchOne(item.id, {
        status: "failed",
        error: `İndirme klasörü oluşturulamadı: ${e?.message || e}`,
      });
      return;
    }

    // Uzantı boş/geçersizse dosya adı bozulur ("abc.") ve native indirme patlar.
    const safeExt = (item.ext || "mp4").replace(/[^a-zA-Z0-9]/g, "") || "mp4";
    const localPath = `${DOWNLOAD_DIR}${item.id}.${safeExt}`;

    if (!item.sourceUrl || !/^https?:\/\//i.test(item.sourceUrl)) {
      patchOne(item.id, { status: "failed", error: "Geçersiz indirme adresi" });
      return;
    }

    patchOne(item.id, { status: "downloading" });

    const callback = (progress: FileSystem.DownloadProgressData) => {
      const pct = progress.totalBytesExpectedToWrite > 0
        ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
        : 0;
      patchOne(item.id, {
        bytesDownloaded: progress.totalBytesWritten,
        totalBytes: progress.totalBytesExpectedToWrite,
        progress: pct,
      });
    };
    const downloadResumable = FileSystem.createDownloadResumable(
      item.sourceUrl,
      localPath,
      { headers: { "User-Agent": "VLC/3.0.16 LibVLC/3.0.16" } },
      callback,
      // GERÇEK RESUME: kayıtlı devam verisi varsa geç -> kaldığı yerden devam.
      item.resumeData || undefined,
    );
    activeMap.set(item.id, downloadResumable);

    try {
      // resumeData varsa resumeAsync (kaldığı yerden), yoksa downloadAsync (baştan).
      const result = item.resumeData
        ? await downloadResumable.resumeAsync()
        : await downloadResumable.downloadAsync();
      activeMap.delete(item.id);
      if (result?.uri) {
        patchOne(item.id, {
          status: "completed",
          localUri: result.uri,
          progress: 1,
          completedAt: Date.now(),
          resumeData: null,
        });
        // "İndirilenler" hedefi seçildiyse: tamamlanınca paylaş/kaydet menüsü aç.
        // (SAF yerine sharing — native-risksiz, kullanıcı istediği yere kaydeder.)
        if (item.saveTarget === "downloads") {
          try {
            const Sharing = await import("expo-sharing");
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(result.uri);
            }
          } catch { /* paylaşım iptal edilebilir — dosya app içinde zaten hazır */ }
        }
      } else {
        // May have been paused/canceled — leave state alone
      }
    } catch (err: any) {
      activeMap.delete(item.id);
      const msg = String(err?.message || err || "İndirme başarısız");
      if (!/canceled|cancelled|aborted/i.test(msg)) {
        patchOne(item.id, { status: "failed", error: msg });
      }
    }
  }, [patchOne]);

  const add = useCallback(async (rec: Omit<DownloadItem, "bytesDownloaded" | "totalBytes" | "status" | "startedAt" | "progress">) => {
    const item: DownloadItem = {
      ...rec,
      bytesDownloaded: 0,
      totalBytes: 0,
      progress: 0,
      status: "queued",
      startedAt: Date.now(),
    };
    setDownloads(prev => {
      // Deduplicate by id
      const existing = prev.find(d => d.id === item.id);
      const next = existing ? prev : [item, ...prev];
      persist(next);
      return next;
    });
    // Kick off immediately (parallel-safe — expo handles multiple downloads)
    setTimeout(() => startDownload(item), 50);
  }, [persist, startDownload]);

  const pause = useCallback(async (id: string) => {
    const r = activeMap.get(id);
    if (!r) return;
    try {
      await r.pauseAsync();
      // GERÇEK RESUME: devam verisini sakla. Böylece 5GB film kopunca/duraklayınca
      // baştan inmez, kaldığı yerden devam eder.
      const savable = r.savable ? r.savable() : null;
      const resumeData = savable?.resumeData || null;
      patchOne(id, { status: "paused", resumeData });
    } catch { /* ignore */ }
  }, [patchOne]);

  const resume = useCallback(async (id: string) => {
    const item = persistRef.current.find(d => d.id === id);
    if (!item) return;
    // item.resumeData startDownload içinde okunur -> resumeAsync ile kaldığı yerden.
    startDownload(item);
  }, [startDownload]);

  const cancel = useCallback(async (id: string) => {
    const r = activeMap.get(id);
    if (r) {
      try { await r.pauseAsync(); } catch {}
      activeMap.delete(id);
    }
    patchOne(id, { status: "canceled" });
  }, [patchOne]);

  const remove = useCallback(async (id: string) => {
    const item = persistRef.current.find(d => d.id === id);
    if (item?.localUri && Platform.OS !== "web") {
      try { await FileSystem.deleteAsync(item.localUri, { idempotent: true }); } catch {}
    }
    setDownloads(prev => {
      const next = prev.filter(d => d.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const clearCompleted = useCallback(async () => {
    setDownloads(prev => {
      const next = prev.filter(d => d.status !== "completed");
      persist(next);
      return next;
    });
  }, [persist]);

  const isDownloaded = useCallback((id: string) => {
    return persistRef.current.some(d => d.id === id && d.status === "completed");
  }, []);

  const getLocalUri = useCallback((id: string) => {
    const d = persistRef.current.find(x => x.id === id);
    return d?.status === "completed" ? d.localUri : undefined;
  }, []);

  return (
    <DownloadContext.Provider value={{
      downloads, add, pause, resume, cancel, remove, clearCompleted, isDownloaded, getLocalUri,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error("useDownloads must be used within DownloadProvider");
  return ctx;
}
