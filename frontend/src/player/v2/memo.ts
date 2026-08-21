import { storage } from "@/src/utils/storage";
import type { EngineProfile, PlaybackErrorKind, PlaybackTelemetry } from "./types";

const key = (channelId: string) => `kizilkan.playerV2.profile.${channelId}`;
const logKey = (channelId: string) => `kizilkan.playerV2.telemetry.${channelId}`;

type StoredProfile = {
  profile: EngineProfile;
  confidence: number;
  successes: number;
  failures: number;
  lastSuccess?: number;
  lastFailure?: number;
};

export async function loadEngineProfile(channelId: string): Promise<StoredProfile | null> {
  const raw = await storage.getItem<string>(key(channelId), "");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredProfile; } catch { return null; }
}

export async function recordEngineSuccess(channelId: string, profile: EngineProfile, firstFrameMs?: number) {
  const prev = await loadEngineProfile(channelId);
  const same = JSON.stringify(prev?.profile) === JSON.stringify(profile);
  const next: StoredProfile = {
    profile,
    confidence: Math.min(10, (same ? prev?.confidence || 0 : 0) + 2),
    successes: (same ? prev?.successes || 0 : 0) + 1,
    failures: same ? prev?.failures || 0 : 0,
    lastSuccess: Date.now(),
    lastFailure: same ? prev?.lastFailure : undefined,
  };
  await storage.setItem(key(channelId), JSON.stringify(next));
  await appendTelemetry(channelId, { channelId, profile, firstFrameMs, success: true, at: Date.now() });
}

export async function recordEngineFailure(channelId: string, profile: EngineProfile, errorKind: PlaybackErrorKind, technical?: string) {
  const prev = await loadEngineProfile(channelId);
  const same = JSON.stringify(prev?.profile) === JSON.stringify(profile);
  const confidence = same ? Math.max(-10, (prev?.confidence || 0) - 3) : -3;
  if (same && confidence <= -3) {
    await storage.removeItem(key(channelId));
  } else if (same && prev) {
    await storage.setItem(key(channelId), JSON.stringify({ ...prev, confidence, failures: prev.failures + 1, lastFailure: Date.now() }));
  }
  await appendTelemetry(channelId, { channelId, profile, success: false, errorKind, technical, at: Date.now() });
}

async function appendTelemetry(channelId: string, item: PlaybackTelemetry) {
  const raw = await storage.getItem<string>(logKey(channelId), "");
  let prev: PlaybackTelemetry[] = [];
  if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) prev = parsed; } catch {} }
  const next = [item, ...prev].slice(0, 20);
  await storage.setItem(logKey(channelId), JSON.stringify(next));
}

export async function loadPlaybackTelemetry(channelId: string): Promise<PlaybackTelemetry[]> {
  const raw = await storage.getItem<string>(logKey(channelId), "");
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
