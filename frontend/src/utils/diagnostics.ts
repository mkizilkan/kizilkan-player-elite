import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { storage } from '@/src/utils/storage';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';

export type DiagnosticDomain = 'system' | 'player' | 'scan' | 'catalog' | 'backup' | 'navigation' | 'network' | 'database' | 'import' | 'lifecycle' | 'mag' | 'xtream';

export type DiagnosticEvent = {
  id: string;
  at: number;
  domain: DiagnosticDomain;
  event: string;
  sessionId?: string;
  runId?: string;
  severity?: 'info' | 'warn' | 'error' | 'critical';
  critical?: boolean;
  data?: Record<string, any>;
};

const KEY = 'kizilkan.diagnostics.flightRecorder.v2';
const LEGACY_KEY = 'kizilkan.diagnostics.flightRecorder.v1';
const MAX_EVENTS = 1500;
const MAX_EXPORT_EVENTS = 1500;
const SYSTEM_SAMPLE_INTERVAL_MS = 5000;
const CRITICAL_EVENT_RE = /CRASH|ANR|FATAL|BLACK_SCREEN|ROLLBACK|TIMEOUT|STALL|OOM|LOW_MEMORY|FAILED|ERROR/i;
const WARN_EVENT_RE = /WARN|STALE|RECOVERY|REBUFFER|SLOW|DROPPED/i;
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
let nativeInitialized = false;
let lastSystemSampleAt = 0;
let appSessionId = `js-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

function redactString(input: string): string {
  let value = String(input || '');
  value = value.replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi, '[REDACTED-MAC]');
  value = value.replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[REDACTED]@');
  const scrubUrl = (raw: string): string => {
    try {
      const u = new URL(raw);
      const queryKeys: string[] = [];
      u.searchParams.forEach((_value, key) => queryKeys.push(key));
      for (const key of queryKeys) if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, '[REDACTED]');
      const hostHash = shortHash(u.host.toLowerCase());
      u.username = ''; u.password = '';
      u.host = `host-${hostHash}.invalid`;
      return u.toString();
    } catch { return '[REDACTED-URL]'; }
  };
  try {
    if (/^https?:\/\//i.test(value)) value = scrubUrl(value);
    else value = value.replace(/https?:\/\/[^\s<>"']+/gi, (url) => scrubUrl(url));
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

function classifySeverity(event: string): DiagnosticEvent['severity'] {
  if (/CRASH|ANR|FATAL|BLACK_SCREEN|ROLLBACK_FAILED/i.test(event)) return 'critical';
  if (/ERROR|FAILED|TIMEOUT|STALL|OOM|LOW_MEMORY/i.test(event)) return 'error';
  if (WARN_EVENT_RE.test(event)) return 'warn';
  return 'info';
}

function shouldSampleSystem(domain: DiagnosticDomain, event: string, severity: DiagnosticEvent['severity']): boolean {
  const now = Date.now();
  if (severity === 'critical' || severity === 'error') return true;
  if (!['player','scan','catalog','import','navigation','lifecycle'].includes(domain)) return false;
  if (now - lastSystemSampleAt < SYSTEM_SAMPLE_INTERVAL_MS) return false;
  if (!/START|READY|FIRST_FRAME|COMPLETED|FAILED|ERROR|BUFFER|SWITCH|FOREGROUND|BACKGROUND|RESUME|PAUSE/i.test(event)) return false;
  lastSystemSampleAt = now;
  return true;
}

function systemSnapshot(): Record<string, any> {
  try { return sanitizeValue(KizilkanNativeCore.getRuntimeMemory?.() || {}); } catch { return {}; }
}

function ensureNativeBlackBox(): Record<string, any> {
  if (!KizilkanNativeCore.available) return {};
  if (!nativeInitialized) {
    try {
      const health = KizilkanNativeCore.initializeBlackBox?.() || {};
      nativeInitialized = true;
      appSessionId = String(health?.appSessionId || appSessionId);
      return health;
    } catch {}
  }
  return {};
}

export function initializeDiagnostics(): Record<string, any> {
  const native = ensureNativeBlackBox();
  try { KizilkanNativeCore.setBlackBoxCheckpoint?.(`startup;session:${appSessionId}`); } catch {}
  return { appSessionId, native };
}

function checkpointSummary(item: DiagnosticEvent): string {
  const bits = [item.domain, item.event];
  if (item.sessionId) bits.push(`s:${shortHash(item.sessionId)}`);
  if (item.runId) bits.push(`r:${shortHash(item.runId)}`);
  return bits.join(';').slice(0, 120);
}

export async function recordDiagnostic(
  domain: DiagnosticDomain,
  event: string,
  data: Record<string, any> = {},
  ctx: { sessionId?: string; runId?: string } = {},
): Promise<void> {
  ensureNativeBlackBox();
  const safeEvent = String(event || 'EVENT').slice(0, 80);
  const severity = classifySeverity(safeEvent);
  const critical = severity === 'critical' || severity === 'error' || CRITICAL_EVENT_RE.test(safeEvent);
  const syncCritical = severity === 'critical' || /CRASH|ANR|FATAL|BLACK_SCREEN|OOM|LOW_MEMORY|ROLLBACK_FAILED|PROCESS_DEATH/i.test(safeEvent);
  const safeData = sanitizeValue(data);
  const item: DiagnosticEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    domain,
    event: safeEvent,
    sessionId: ctx.sessionId ? String(ctx.sessionId).slice(0, 120) : undefined,
    runId: ctx.runId ? String(ctx.runId).slice(0, 120) : undefined,
    severity,
    critical,
    data: shouldSampleSystem(domain, safeEvent, severity)
      ? { ...safeData, _system: systemSnapshot(), _appSessionId: appSessionId }
      : { ...safeData, _appSessionId: appSessionId },
  };
  if (syncCritical) {
    // Gerçek terminal/kritik olay, JS promise kuyruğu/crash öncesinde mümkün olduğunca erken
    // native senkron ölüm-journalına düşer. Native taraf hatayı asla yutmaz/değiştirmez.
    try { KizilkanNativeCore.appendCriticalBlackBoxEvent?.(JSON.stringify(item)); } catch {}
  }
  writeQueue = writeQueue.then(async () => {
    // Native Room/WAL uçuş kaydı ilk kalıcılık katmanıdır. Başarısız olsa bile
    // JSONL + AsyncStorage geri dönüş yolları uygulama işlevini kesmez.
    try { await KizilkanNativeCore.appendBlackBoxEvent?.(JSON.stringify(item)); } catch {}
    try { KizilkanNativeCore.setBlackBoxCheckpoint?.(checkpointSummary(item)); } catch {}
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
  try { await KizilkanNativeCore.clearBlackBox?.(); } catch {}
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

function deriveAnomalies(events: DiagnosticEvent[]) {
  const out: Array<Record<string, any>> = [];
  const add = (type: string, e: DiagnosticEvent, evidence: Record<string, any> = {}) => {
    if (out.length >= 250) return;
    out.push({ type, at: e.at, domain: e.domain, event: e.event, sessionId: e.sessionId, runId: e.runId, evidence: sanitizeValue(evidence) });
  };
  for (const e of events) {
    if (e.event === 'STALE_BUFFERING_CLEARED') add('PLAYER_STALE_BUFFERING_STATE', e, e.data || {});
    if (e.event === 'PLAYLIST_SWITCH_STALE_DISCARDED') add('PLAYLIST_STALE_ASYNC_RESULT', e, e.data || {});
    if (e.event === 'FIRST_FRAME') {
      const ms = Number(e.data?.totalFromSelectionMs ?? e.data?.firstFrameMs ?? 0);
      if (Number.isFinite(ms) && ms >= 5000) add('PLAYER_SLOW_FIRST_FRAME', e, { firstFrameMs: ms });
    }
    if (/BLACK_SCREEN/i.test(e.event)) add('PLAYER_BLACK_SCREEN', e, e.data || {});
    if (/ANR|STALL|TIMEOUT|OOM|LOW_MEMORY/i.test(e.event)) add('RUNTIME_STALL_OR_RESOURCE', e, e.data || {});
    if (e.critical && /ERROR|FAILED|FATAL|CRASH/i.test(e.event)) add('CRITICAL_FAILURE', e, e.data || {});
  }
  return out;
}

export async function exportDiagnosticReport(extra: Record<string, any> = {}): Promise<string> {
  ensureNativeBlackBox();
  const events = await loadDiagnostics(MAX_EXPORT_EVENTS);
  const critical = events.filter((e) => e.critical || CRITICAL_EVENT_RE.test(e.event)).slice(0, 250);
  let nativeFlightRecorder: Record<string, any> = {};
  try { nativeFlightRecorder = await KizilkanNativeCore.getBlackBoxSnapshot?.(MAX_EXPORT_EVENTS) || {}; } catch {}
  const payload = sanitizeValue({
    format: 'KIZILKAN_FLIGHT_RECORDER_V3',
    schemaVersion: 3,
    eventCapacity: MAX_EVENTS,
    appSessionId,
    persistentJournal: journalInfo(),
    nativeFlightRecorder,
    processExitHistory: (() => { try { return KizilkanNativeCore.getExitHistory?.(10) || []; } catch { return []; } })(),
    runtimeAtExport: systemSnapshot(),
    createdAt: new Date().toISOString(),
    extra,
    critical,
    anomalies: deriveAnomalies(events),
    events,
  });
  const name = `kizilkan-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'KIZILKAN Flight Recorder Raporunu Paylaş' });
  }
  return file.uri;
}
