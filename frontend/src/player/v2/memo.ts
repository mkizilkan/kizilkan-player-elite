import { storage } from "@/src/utils/storage";
import type { EngineProfile, PlaybackErrorKind, PlaybackTelemetry } from "./types";
import { recordDiagnostic } from "@/src/utils/diagnostics";

// v18.7.3: Xtream stream IDs are only unique inside a playlist. Keep legacy
// records intact, but never borrow their engine confidence for another account.
export const engineMemoIdentity = (channelId: string, playlistId = "") =>
  playlistId ? JSON.stringify([playlistId, channelId]) : channelId;
const key = (channelId: string, playlistId = "") => `kizilkan.playerV2.profile.${engineMemoIdentity(channelId, playlistId)}`;
const logKey = (channelId: string, playlistId = "") => `kizilkan.playerV2.telemetry.${engineMemoIdentity(channelId, playlistId)}`;

type StoredProfile = {
  profile: EngineProfile;
  confidence: number;
  successes: number;
  failures: number;
  lastSuccess?: number;
  lastFailure?: number;
};

export async function loadEngineProfile(channelId: string, playlistId = ""): Promise<StoredProfile | null> {
  const raw = await storage.getItem<string>(key(channelId, playlistId), "");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredProfile; } catch { return null; }
}

export async function recordEngineSuccess(channelId: string, profile: EngineProfile, firstFrameMs?: number, playlistId = "") {
  const prev = await loadEngineProfile(channelId, playlistId);
  const same = JSON.stringify(prev?.profile) === JSON.stringify(profile);
  const next: StoredProfile = {
    profile,
    confidence: Math.min(10, (same ? prev?.confidence || 0 : 0) + 2),
    successes: (same ? prev?.successes || 0 : 0) + 1,
    failures: same ? prev?.failures || 0 : 0,
    lastSuccess: Date.now(),
    lastFailure: same ? prev?.lastFailure : undefined,
  };
  await storage.setItem(key(channelId, playlistId), JSON.stringify(next));
  await appendTelemetry(channelId, { channelId, profile, firstFrameMs, success: true, at: Date.now() }, playlistId);
  await recordDiagnostic("player", "ENGINE_SUCCESS", { channelId, engine: profile.engine, profile, firstFrameMs }, { sessionId: channelId });
}

export async function recordEngineFailure(channelId: string, profile: EngineProfile, errorKind: PlaybackErrorKind, technical?: string, playlistId = "") {
  const prev = await loadEngineProfile(channelId, playlistId);
  const same = JSON.stringify(prev?.profile) === JSON.stringify(profile);
  const confidence = same ? Math.max(-10, (prev?.confidence || 0) - 3) : -3;
  if (same && confidence <= -3) {
    await storage.removeItem(key(channelId, playlistId));
  } else if (same && prev) {
    await storage.setItem(key(channelId, playlistId), JSON.stringify({ ...prev, confidence, failures: prev.failures + 1, lastFailure: Date.now() }));
  }
  await appendTelemetry(channelId, { channelId, profile, success: false, errorKind, technical, at: Date.now() }, playlistId);
  await recordDiagnostic("player", "ENGINE_ERROR", { channelId, engine: profile.engine, profile, errorKind, technical }, { sessionId: channelId });
}

async function appendTelemetry(channelId: string, item: PlaybackTelemetry, playlistId = "") {
  const raw = await storage.getItem<string>(logKey(channelId, playlistId), "");
  let prev: PlaybackTelemetry[] = [];
  if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) prev = parsed; } catch {} }
  const next = [item, ...prev].slice(0, 20);
  await storage.setItem(logKey(channelId, playlistId), JSON.stringify(next));
}

export async function loadPlaybackTelemetry(channelId: string, playlistId = ""): Promise<PlaybackTelemetry[]> {
  const raw = await storage.getItem<string>(logKey(channelId, playlistId), "");
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
