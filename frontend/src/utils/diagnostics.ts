import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { storage } from '@/src/utils/storage';

export type DiagnosticDomain = 'system' | 'player' | 'scan' | 'catalog' | 'backup' | 'navigation';

export type DiagnosticEvent = {
  id: string;
  at: number;
  domain: DiagnosticDomain;
  event: string;
  sessionId?: string;
  runId?: string;
  data?: Record<string, any>;
};

const KEY = 'kizilkan.diagnostics.flightRecorder.v2';
const LEGACY_KEY = 'kizilkan.diagnostics.flightRecorder.v1';
const MAX_EVENTS = 1500;
const MAX_EXPORT_EVENTS = 1500;
const JOURNAL_NAME = 'kizilkan-blackbox-v2.jsonl';
const JOURNAL_ARCHIVE_NAME = 'kizilkan-blackbox-v2.1.jsonl';
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const SENSITIVE_KEY = /(pass(word)?|token|cookie|authorization|secret|pin|device[_-]?id|serial|mac|username|user(name)?)/i;

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i=0;i<input.length;i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
let writeQueue: Promise<void> = Promise.resolve();

function redactString(input: string): string {
  let value = String(input || '');
  value = value.replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi, '[REDACTED-MAC]');
  value = value.replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[REDACTED]@');
  try {
    if (/^https?:\/\//i.test(value)) {
      const u = new URL(value);
      const queryKeys: string[] = [];
      u.searchParams.forEach((_value, key) => queryKeys.push(key));
      for (const key of queryKeys) if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, '[REDACTED]');
      const hostHash = shortHash(u.host.toLowerCase());
      u.host = `host-${hostHash}.invalid`;
      value = u.toString();
    }
  } catch {}
  return value.slice(0, 1000);
}

function sanitizeValue(value: any, key = '', depth = 0): any {
  if (depth > 4) return '[TRUNCATED]';
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => sanitizeValue(v, '', depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value).slice(0, 50)) out[k] = sanitizeValue(v, k, depth + 1);
    return out;
  }
  return String(value);
}


function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder === 'undefined') return new Uint8Array([]);
  return new TextEncoder().encode(text);
}

function appendPersistentJournal(item: DiagnosticEvent): void {
  try {
    let file = new File(Paths.document, JOURNAL_NAME);
    if (!file.exists) file.create();
    if (Number(file.size || 0) >= MAX_JOURNAL_BYTES) {
      const archive = new File(Paths.document, JOURNAL_ARCHIVE_NAME);
      if (archive.exists) archive.delete();
      file.move(archive);
      file = new File(Paths.document, JOURNAL_NAME);
      file.create();
    }
    const bytes = encodeUtf8(JSON.stringify(item) + '\n');
    if (!bytes.length) return;
    const handle = file.open();
    try {
      handle.offset = Number(handle.size || file.size || 0);
      handle.writeBytes(bytes);
    } finally {
      handle.close();
    }
  } catch {
    // Journal hiçbir zaman uygulama işlevini bozmaz; AsyncStorage ring yedek yoludur.
  }
}

function loadPersistentJournal(limit: number): DiagnosticEvent[] {
  const out: DiagnosticEvent[] = [];
  for (const name of [JOURNAL_NAME, JOURNAL_ARCHIVE_NAME]) {
    try {
      const file = new File(Paths.document, name);
      if (!file.exists || !file.size) continue;
      const lines = file.textSync().split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        try { const ev = JSON.parse(line); if (ev && ev.event && ev.at) out.push(ev); } catch {}
      }
    } catch {}
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function journalInfo() {
  const info = { currentBytes: 0, archiveBytes: 0, maxSegmentBytes: MAX_JOURNAL_BYTES };
  try { const f = new File(Paths.document, JOURNAL_NAME); if (f.exists) info.currentBytes = Number(f.size || 0); } catch {}
  try { const f = new File(Paths.document, JOURNAL_ARCHIVE_NAME); if (f.exists) info.archiveBytes = Number(f.size || 0); } catch {}
  return info;
}

function parseEvents(raw: string): DiagnosticEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function recordDiagnostic(
  domain: DiagnosticDomain,
  event: string,
  data: Record<string, any> = {},
  ctx: { sessionId?: string; runId?: string } = {},
): Promise<void> {
  const item: DiagnosticEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    domain,
    event: String(event || 'EVENT').slice(0, 80),
    sessionId: ctx.sessionId ? String(ctx.sessionId).slice(0, 120) : undefined,
    runId: ctx.runId ? String(ctx.runId).slice(0, 120) : undefined,
    data: sanitizeValue(data),
  };
  writeQueue = writeQueue.then(async () => {
    appendPersistentJournal(item);
    let raw = (await storage.getItem<string>(KEY, '')) || '';
    if (!raw) raw = (await storage.getItem<string>(LEGACY_KEY, '')) || '';
    const prev = parseEvents(raw);
    const next = [item, ...prev].slice(0, MAX_EVENTS);
    await storage.setItem(KEY, JSON.stringify(next));
  }).catch(() => {});
  await writeQueue;
}

export async function loadDiagnostics(limit = MAX_EVENTS): Promise<DiagnosticEvent[]> {
  await writeQueue.catch(() => {});
  let raw = (await storage.getItem<string>(KEY, '')) || '';
  if (!raw) raw = (await storage.getItem<string>(LEGACY_KEY, '')) || '';
  const bounded = Math.max(1, Math.min(MAX_EVENTS, limit));
  const parsed = parseEvents(raw).slice(0, bounded);
  return parsed.length ? parsed : loadPersistentJournal(bounded);
}

export async function clearDiagnostics(): Promise<void> {
  await writeQueue.catch(() => {});
  await Promise.all([storage.removeItem(KEY), storage.removeItem(LEGACY_KEY)]);
  for (const name of [JOURNAL_NAME, JOURNAL_ARCHIVE_NAME]) {
    try { const file = new File(Paths.document, name); if (file.exists) file.delete(); } catch {}
  }
}

export function summarizePlayerDiagnostics(events: DiagnosticEvent[]) {
  const player = events.filter((e) => e.domain === 'player');
  const firstFrames = player
    .filter((e) => e.event === 'FIRST_FRAME')
    .map((e) => Number(e.data?.totalFromSelectionMs ?? e.data?.firstFrameMs ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const errors = player.filter((e) => e.event === 'ERROR' || e.event === 'ENGINE_ERROR' || e.event.endsWith('_ERROR'));
  const rebuffers = player.filter((e) =>
    (e.event === 'MEDIA3_STATUS' && !!e.data?.rebuffer) ||
    ((e.event === 'VLC_BUFFERING_START' || e.event === 'MPV_BUFFERING_START') && !!e.data?.afterFirstFrame)
  );
  const resolve = player
    .filter((e) => e.event === 'STALKER_RESOLVE_DONE')
    .map((e) => Number(e.data?.elapsedMs || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  return {
    sessions: new Set(player.map((e) => e.sessionId).filter(Boolean)).size,
    firstFrameCount: firstFrames.length,
    avgFirstFrameMs: avg(firstFrames),
    avgStalkerResolveMs: avg(resolve),
    errors: errors.length,
    rebuffers: rebuffers.length,
    lastError: errors[0] || null,
  };
}

export async function recordBlackBox(event: string, data: Record<string, any> = {}, ctx: { sessionId?: string; runId?: string } = {}): Promise<void> {
  return recordDiagnostic('system', `BLACKBOX_${event}`, { ...data, appAt: Date.now() }, ctx);
}

export async function exportDiagnosticReport(extra: Record<string, any> = {}): Promise<string> {
  const events = await loadDiagnostics(MAX_EXPORT_EVENTS);
  const critical = events.filter((e) => /ERROR|FAILED|CRASH|ANR|STALL|TIMEOUT|ROLLBACK|BLACK_SCREEN/.test(e.event)).slice(0, 250);
  const payload = sanitizeValue({
    format: 'KIZILKAN_BLACK_BOX_V2',
    schemaVersion: 2,
    eventCapacity: MAX_EVENTS,
    persistentJournal: journalInfo(),
    createdAt: new Date().toISOString(),
    extra,
    critical,
    events,
  });
  const name = `kizilkan-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'KIZILKAN Tanılama Raporunu Paylaş' });
  }
  return file.uri;
}
