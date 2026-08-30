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

const KEY = 'kizilkan.diagnostics.flightRecorder.v5';
const V4_KEY = 'kizilkan.diagnostics.flightRecorder.v4';
const V3_KEY = 'kizilkan.diagnostics.flightRecorder.v2';
const LEGACY_KEY = 'kizilkan.diagnostics.flightRecorder.v1';
const MAX_EVENTS = 50000;
const MAX_EXPORT_EVENTS = 50000;
// v15.2.23-RC2: AsyncStorage is only a recent fallback cache. The durable full
// flight recorder is Native Room/WAL (100k) + critical/native journals. Serializing
// 50k JS events on every event was O(n) main-thread work and could itself create stalls.
const MAX_JS_FALLBACK_EVENTS = 5000;
const JS_STORAGE_FLUSH_EVERY = 64;
const JS_JOURNAL_SAMPLE_EVERY = 16;
const SYSTEM_SAMPLE_INTERVAL_MS = 5000;
/**
 * v16.8.0 — "ROOM" -> "OOM" YANLIŞ POZİTİFİ DÜZELTİLDİ.
 * OOM kalıbı sınır kontrolü olmadan yazıldığı için "R-OOM" kelimesi de
 * eşleşiyordu: MAG_ENRICH_ROOM_OK, ROOM_VERIFY_OK gibi BAŞARI olayları
 * "kritik" sayılıyor, kayıtları kirletiyor ve gerçek kritik olayları
 * gizliyordu. Artık OOM yalnız kendi başına bir sözcük olarak eşleşir.
 */
const CRITICAL_EVENT_RE = /CRASH|ANR|FATAL|BLACK_SCREEN|ROLLBACK|TIMEOUT|STALL|(?<![A-Z])OOM(?![A-Z])|LOW_MEMORY|FAILED|ERROR/i;
const WARN_EVENT_RE = /WARN|STALE|RECOVERY|REBUFFER|SLOW|DROPPED/i;
const JOURNAL_NAME = 'kizilkan-blackbox-v5.jsonl';
const JOURNAL_ARCHIVE_NAMES = Array.from({ length: 7 }, (_, i) => `kizilkan-blackbox-v5.${i + 1}.jsonl`);
const LEGACY_JOURNALS = ['kizilkan-blackbox-v4.jsonl', 'kizilkan-blackbox-v4.1.jsonl', 'kizilkan-blackbox-v4.2.jsonl', 'kizilkan-blackbox-v4.3.jsonl', 'kizilkan-blackbox-v2.jsonl', 'kizilkan-blackbox-v2.1.jsonl'];
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const SENSITIVE_KEY = /(pass(word)?|token|cookie|authorization|secret|pin|device[_-]?id|serial|mac|username|user(name)?)/i;

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i=0;i<input.length;i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
let writeQueue: Promise<void> = Promise.resolve();
let jsEventCache: DiagnosticEvent[] | null = null;
let jsDirtyEvents = 0;
let jsJournalSequence = 0;
let nativeInitialized = false;
let lastSystemSampleAt = 0;
let appSessionId = `js-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;


// v15.2.24-RC3 — Claude telemetry ideas integrated without regressing the
// existing Flight Recorder V5 persistence path. Task ownership is token-based
// so overlapping async jobs cannot restore a stale label when they finish out of order.
type DiagnosticTask = { id: string; label: string; startedAt: number; seq: number; meta?: Record<string, any> };
export type DiagnosticMemorySample = {
  at: number;
  fg: boolean;
  appState: string;
  task: string;
  taskCount: number;
  javaUsedMb: number;
  javaCommittedMb: number;
  javaMaxMb: number;
  pssMb: number;
  nativePssMb: number;
  dalvikPssMb: number;
  otherPssMb: number;
  systemAvailMb: number;
  systemTotalMb: number;
  systemLowMemory: boolean;
};

let diagnosticAppState = 'active';
let diagnosticForeground = true;
let taskSeq = 0;
const activeTasks = new Map<string, DiagnosticTask>();
const memorySeries: DiagnosticMemorySample[] = [];
const MEMORY_SERIES_MAX = 240; // 30 sn cadence ile yaklaşık 2 saat.
let memoryTimer: ReturnType<typeof setInterval> | null = null;

function activeTaskSnapshot() {
  let primary: DiagnosticTask | null = null;
  for (const task of activeTasks.values()) if (!primary || task.seq > primary.seq) primary = task;
  return {
    label: primary?.label || 'idle',
    startedAt: primary?.startedAt || 0,
    count: activeTasks.size,
    labels: Array.from(activeTasks.values()).sort((a,b)=>a.seq-b.seq).slice(-6).map((x)=>x.label),
  };
}

/** Existing root AppState listener calls this; no second native listener is created. */
export function setDiagnosticAppState(state: string): void {
  diagnosticAppState = String(state || 'unknown').slice(0, 24);
  diagnosticForeground = diagnosticAppState === 'active';
}

/**
 * Marks an expensive async task. Returned disposer is idempotent and removes only
 * its own token, therefore overlapping refresh/MAG/Room/player/scan tasks are safe.
 */
export function markTask(label: string, meta: Record<string, any> = {}): () => void {
  const safeLabel = String(label || 'task').slice(0, 80);
  const id = `task-${Date.now().toString(36)}-${(++taskSeq).toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  activeTasks.set(id, { id, label: safeLabel, startedAt: Date.now(), seq: taskSeq, meta: sanitizeValue(meta) });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    activeTasks.delete(id);
  };
}

export function getActiveTask(): string { return activeTaskSnapshot().label; }
export function getActiveTasks(): string[] { return activeTaskSnapshot().labels.slice(); }
export function isAppForeground(): boolean { return diagnosticForeground; }

function bytesToMb(v: any): number { const n = Number(v || 0); return Number.isFinite(n) && n > 0 ? Math.round(n / 1048576) : 0; }
function kbToMb(v: any): number { const n = Number(v || 0); return Number.isFinite(n) && n > 0 ? Math.round(n / 1024) : 0; }

function captureMemorySample(): void {
  try {
    const snap: any = systemSnapshot() || {};
    const task = activeTaskSnapshot();
    memorySeries.push({
      at: Date.now(), fg: diagnosticForeground, appState: diagnosticAppState,
      task: task.label, taskCount: task.count,
      javaUsedMb: bytesToMb(snap.javaHeapUsedBytes),
      javaCommittedMb: bytesToMb(snap.javaHeapCommittedBytes),
      javaMaxMb: bytesToMb(snap.javaHeapMaxBytes),
      pssMb: kbToMb(snap.totalPssKb),
      nativePssMb: kbToMb(snap.nativePssKb),
      dalvikPssMb: kbToMb(snap.dalvikPssKb),
      otherPssMb: kbToMb(snap.otherPssKb),
      systemAvailMb: bytesToMb(snap.systemAvailMemBytes),
      systemTotalMb: bytesToMb(snap.systemTotalMemBytes),
      systemLowMemory: !!snap.systemLowMemory,
    });
    if (memorySeries.length > MEMORY_SERIES_MAX) memorySeries.splice(0, memorySeries.length - MEMORY_SERIES_MAX);
  } catch {}
}

/** Idempotent bounded memory timeline; background samples are retained but explicitly tagged. */
export function startMemorySampling(intervalMs = 30000): void {
  if (memoryTimer) return;
  captureMemorySample();
  memoryTimer = setInterval(captureMemorySample, Math.max(10000, Number(intervalMs) || 30000));
}

export function getMemorySeries(): DiagnosticMemorySample[] { return memorySeries.slice(); }

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
  return value.slice(0, 2000);
}

function sanitizeValue(value: any, key = '', depth = 0): any {
  if (depth > 8) return '[TRUNCATED]';
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 80).map((v) => sanitizeValue(v, '', depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value).slice(0, 80)) out[k] = sanitizeValue(v, k, depth + 1);
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
      for (let i = JOURNAL_ARCHIVE_NAMES.length - 1; i >= 0; i--) {
        const dst = new File(Paths.document, JOURNAL_ARCHIVE_NAMES[i]);
        if (dst.exists) dst.delete();
        const srcName = i === 0 ? JOURNAL_NAME : JOURNAL_ARCHIVE_NAMES[i - 1];
        const src = new File(Paths.document, srcName);
        if (src.exists) src.move(dst);
      }
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
  for (const name of [JOURNAL_NAME, ...JOURNAL_ARCHIVE_NAMES, ...LEGACY_JOURNALS]) {
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
  const info = { currentBytes: 0, archiveBytes: 0, segments: 1 + JOURNAL_ARCHIVE_NAMES.length, maxSegmentBytes: MAX_JOURNAL_BYTES };
  try { const f = new File(Paths.document, JOURNAL_NAME); if (f.exists) info.currentBytes = Number(f.size || 0); } catch {}
  for (const name of JOURNAL_ARCHIVE_NAMES) { try { const f = new File(Paths.document, name); if (f.exists) info.archiveBytes += Number(f.size || 0); } catch {} }
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

async function ensureJsEventCache(): Promise<DiagnosticEvent[]> {
  if (jsEventCache) return jsEventCache;
  let raw = (await storage.getItem<string>(KEY, '')) || '';
  if (!raw) raw = (await storage.getItem<string>(V4_KEY, '')) || '';
  if (!raw) raw = (await storage.getItem<string>(V3_KEY, '')) || '';
  if (!raw) raw = (await storage.getItem<string>(LEGACY_KEY, '')) || '';
  jsEventCache = parseEvents(raw).slice(0, MAX_JS_FALLBACK_EVENTS);
  return jsEventCache;
}

function nativeSnapshotEvents(snapshot: Record<string, any>): DiagnosticEvent[] {
  const rows = Array.isArray(snapshot?.events) ? snapshot.events : [];
  return rows.map((row: any) => ({
    id: String(row?.id || `${row?.at || Date.now()}-${Math.random().toString(36).slice(2,8)}`),
    at: Number(row?.at || 0),
    domain: String(row?.domain || 'system') as DiagnosticDomain,
    event: String(row?.event || 'EVENT'),
    sessionId: row?.sessionId ? String(row.sessionId) : undefined,
    runId: row?.runId ? String(row.runId) : undefined,
    severity: row?.severity || undefined,
    critical: !!row?.critical,
    data: row?.data && typeof row.data === 'object' ? row.data : {},
  })).filter((x: DiagnosticEvent) => x.at > 0);
}

function classifySeverity(event: string): DiagnosticEvent['severity'] {
  if (/CRASH|ANR|FATAL|BLACK_SCREEN|ROLLBACK_FAILED/i.test(event)) return 'critical';
  // v16.8.0: OOM sınır kontrollü (ROOM eşleşmesin)
  if (/ERROR|FAILED|TIMEOUT|STALL|(?<![A-Z])OOM(?![A-Z])|LOW_MEMORY/i.test(event)) return 'error';
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
  const syncCritical = severity === 'critical' || /CRASH|ANR|FATAL|BLACK_SCREEN|(?<![A-Z])OOM(?![A-Z])|LOW_MEMORY|ROLLBACK_FAILED|PROCESS_DEATH/i.test(safeEvent);
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
    data: (() => {
      const task = activeTaskSnapshot();
      const context = {
        _appSessionId: appSessionId,
        _fg: diagnosticForeground,
        _appState: diagnosticAppState,
        _task: task.label,
        _taskCount: task.count,
        _taskAgeMs: task.startedAt ? Math.max(0, Date.now() - task.startedAt) : 0,
      };
      return shouldSampleSystem(domain, safeEvent, severity)
        ? { ...safeData, _system: systemSnapshot(), ...context }
        : { ...safeData, ...context };
    })(),
  };
  if (syncCritical) {
    // Gerçek terminal/kritik olay, JS promise kuyruğu/crash öncesinde mümkün olduğunca erken
    // native senkron ölüm-journalına düşer. Native taraf hatayı asla yutmaz/değiştirmez.
    try { KizilkanNativeCore.appendCriticalBlackBoxEvent?.(JSON.stringify(item)); } catch {}
  }
  writeQueue = writeQueue.then(async () => {
    // Native Room/WAL uçuş kaydı ilk kalıcılık katmanıdır. Başarısız olsa bile
    // sampled JSONL + küçük AsyncStorage recent-cache geri dönüş yolu kalır.
    try { await KizilkanNativeCore.appendBlackBoxEvent?.(JSON.stringify(item)); } catch {}
    try { KizilkanNativeCore.setBlackBoxCheckpoint?.(checkpointSummary(item)); } catch {}

    // JS thread üzerinde her eventte senkron dosya append + 50k JSON stringify
    // yapılmaz. Kritik/error/warn olaylar daima; normal olaylar örneklemeli journal'a
    // gider. Tam normal geçmiş native Room'da 100k kapasiteyle korunur.
    jsJournalSequence += 1;
    if (critical || severity === 'warn' || jsJournalSequence % JS_JOURNAL_SAMPLE_EVERY === 0) {
      appendPersistentJournal(item);
    }

    const prev = await ensureJsEventCache();
    jsEventCache = [item, ...prev].slice(0, MAX_JS_FALLBACK_EVENTS);
    jsDirtyEvents += 1;
    if (critical || jsDirtyEvents >= JS_STORAGE_FLUSH_EVERY) {
      await storage.setItem(KEY, JSON.stringify(jsEventCache));
      jsDirtyEvents = 0;
    }
  }).catch(() => {});
  await writeQueue;
}

export async function loadDiagnostics(limit = MAX_EVENTS): Promise<DiagnosticEvent[]> {
  await writeQueue.catch(() => {});
  const bounded = Math.max(1, Math.min(MAX_EVENTS, limit));
  // Android'de tam geçmişin authority'si Room/WAL'dır. Böylece 50k event yüklemek
  // için her record sırasında dev AsyncStorage blob'u yeniden yazılmaz.
  if (KizilkanNativeCore.available) {
    try {
      const snapshot = await KizilkanNativeCore.getBlackBoxSnapshot?.(bounded) || {};
      const nativeEvents = nativeSnapshotEvents(snapshot).slice(0, bounded);
      if (nativeEvents.length) return nativeEvents;
    } catch {}
  }
  const cached = (await ensureJsEventCache()).slice(0, bounded);
  return cached.length ? cached : loadPersistentJournal(bounded);
}

export async function clearDiagnostics(): Promise<void> {
  await writeQueue.catch(() => {});
  jsEventCache = [];
  jsDirtyEvents = 0;
  jsJournalSequence = 0;
  memorySeries.splice(0, memorySeries.length);
  activeTasks.clear();
  await Promise.all([storage.removeItem(KEY), storage.removeItem(V4_KEY), storage.removeItem(V3_KEY), storage.removeItem(LEGACY_KEY)]);
  try { await KizilkanNativeCore.clearBlackBox?.(); } catch {}
  for (const name of [JOURNAL_NAME, ...JOURNAL_ARCHIVE_NAMES, ...LEGACY_JOURNALS]) {
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
    if (/ANR|STALL|TIMEOUT|OOM|LOW_MEMORY/i.test(e.event)) {
      if (e.data?._fg === false) add('BACKGROUND_STALL_OR_DOZE', e, e.data || {});
      else add('FOREGROUND_RUNTIME_STALL_OR_RESOURCE', e, e.data || {});
    }
    if (e.critical && /ERROR|FAILED|FATAL|CRASH/i.test(e.event)) add('CRITICAL_FAILURE', e, e.data || {});
  }
  return out;
}

/**
 * v16.2.0 — OTOMATİK TEŞHİS ÖZETİ
 * ---------------------------------------------------------------------------
 * Kayıtları elle okurken en çok zaman kaybettiren şey, yüzlerce olayın içinden
 * ASIL kök nedeni ayıklamaktı. Örneğin 28.08 kaydında 38 motor hatasının 20'si
 * tek bir sebepti ("MPV başlatılamadı: dev.jdtech.mpv.MPVLib") — ama bunu
 * görmek için tüm olayları taramak gerekti.
 *
 * Bu özet, dışa aktarımın EN BAŞINA konur ve şunları hazır verir:
 *   • en sık hata imzaları (kaç kez, hangi motor)
 *   • motor bazlı başarı/başarısızlık dağılımı
 *   • ilk kare oranı (görüntü gerçekten geliyor mu?)
 *   • ortalama açılış süresi
 *   • ön plan/arka plan ayrımıyla ANR sayısı (yanlış pozitif elenir)
 */
function buildAutoSummary(events: any[]): Record<string, any> {
  const sig = new Map<string, number>();
  const engineFail = new Map<string, number>();
  let firstFrames = 0, sessions = 0, anrFg = 0, anrBg = 0;
  const firstFrameMs: number[] = [];

  for (const e of events) {
    const ev = String(e?.event || "");
    const d: any = e?.data || {};
    if (ev === "ENGINE_ERROR" || ev === "MEDIA3_ERROR" || ev === "VLC_ERROR_SIGNAL") {
      const tech = String(d.technical || d.message || "bilinmiyor").slice(0, 90);
      const eng = String(d.engine || "?");
      sig.set(`${eng} :: ${tech}`, (sig.get(`${eng} :: ${tech}`) || 0) + 1);
      engineFail.set(eng, (engineFail.get(eng) || 0) + 1);
    }
    if (ev === "PLAYER_FIRST_FRAME" || ev === "FIRST_FRAME") {
      firstFrames++;
      const ms = Number(d.firstFrameMs || 0);
      if (ms > 0) firstFrameMs.push(ms);
    }
    if (ev === "PLAYBACK_SESSION_START" || ev === "ENGINE_ATTEMPT") sessions++;
    if (ev === "ANR_WATCHDOG_STALL") { if (e?.data?._fg === false) anrBg++; else anrFg++; }
  }

  const top = [...sig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => ({ imza: k, adet: v }));
  const avg = firstFrameMs.length
    ? Math.round(firstFrameMs.reduce((a, b) => a + b, 0) / firstFrameMs.length) : null;

  return {
    aciklama: "Otomatik teşhis özeti — kök nedeni hızlı görmek için (v16.2.0).",
    enSikHatalar: top,
    motorBazliHata: Object.fromEntries(engineFail),
    ilkKareSayisi: firstFrames,
    oturumSayisi: sessions,
    ilkKareOraniYuzde: sessions > 0 ? Math.round((firstFrames / sessions) * 100) : null,
    ortalamaIlkKareMs: avg,
    anrOnPlan: anrFg,
    anrArkaPlan_yanlisPozitifOlabilir: anrBg,
    mpvKullanilabilir: undefined as any,   // PlayerHost tarafından doldurulur
  };
}

export async function exportDiagnosticReport(extra: Record<string, any> = {}): Promise<string> {
  ensureNativeBlackBox();
  const events = await loadDiagnostics(MAX_EXPORT_EVENTS);
  const critical = events.filter((e) => e.critical || CRITICAL_EVENT_RE.test(e.event)).slice(0, 250);
  let nativeFlightRecorder: Record<string, any> = {};
  try { nativeFlightRecorder = await KizilkanNativeCore.getBlackBoxSnapshot?.(MAX_EXPORT_EVENTS) || {}; } catch {}
  const payload = sanitizeValue({
    format: 'KIZILKAN_FLIGHT_RECORDER_V5',
    // v16.2.0: kök nedeni en başta göster
    autoSummary: buildAutoSummary(events),
    schemaVersion: 5,
    eventCapacity: MAX_EVENTS,
    appSessionId,
    persistentJournal: journalInfo(),
    nativeFlightRecorder,
    processExitHistory: (() => {
      try {
        const clearEpoch = Number(nativeFlightRecorder?.health?.clearEpochMs || 0);
        return (KizilkanNativeCore.getExitHistory?.(10) || []).filter((x:any) => Number(x?.timestamp || 0) >= clearEpoch);
      } catch { return []; }
    })(),
    runtimeAtExport: systemSnapshot(),
    memorySeries: getMemorySeries(),
    appStateAtExport: diagnosticAppState,
    foregroundAtExport: diagnosticForeground,
    activeTaskAtExport: getActiveTask(),
    activeTasksAtExport: getActiveTasks(),
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
