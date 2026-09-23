/**
 * KIZILKAN PLAYER — YENİLEME FARK RAPORU (v17.4.0)
 * ===========================================================================
 * AMAÇ
 * ---------------------------------------------------------------------------
 * Kullanıcı bir listeyi güncellediğinde ne değiştiğini GÖREMİYORDU. Yalnız
 * "şu kadar kanal" yazıyordu; eklenen/silinen içerik görünmüyor, olağandışı
 * bir kayıp (ör. sağlayıcı eksik cevap verdi) fark edilmiyordu.
 *
 * TASARIM KARARI: Farklar KARARLI İÇERİK KİMLİKLERİYLE hesaplanır, yalnız
 * toplam sayı farkıyla DEĞİL. Çünkü "önce 100, sonra 100" demek "hiçbir şey
 * değişmedi" demek değildir: 20 kanal silinip 20 yeni kanal eklenmiş olabilir.
 * Sayı farkı bunu gizler, kimlik karşılaştırması göstermez.
 *
 * Kimlik seçimi (sırayla ilk bulunan):
 *   1) stream_id / series_id  — sağlayıcının kalıcı kimliği (en güvenilir)
 *   2) id                     — uygulama içi kimlik
 *   3) url                    — adres (kimlik yoksa)
 *   4) name|group             — son çare
 */

export interface KindDiff {
  /** Güncellemeden önceki toplam. */
  before: number;
  /** Güncellemeden sonraki toplam. */
  after: number;
  /** Yeni gelen (eskide olmayan) öğe sayısı. */
  added: number;
  /** Kaybolan (yenide olmayan) öğe sayısı. */
  removed: number;
  /** Kimliği aynı kalıp adı/grubu/adresi değişen öğe sayısı. */
  changed: number;
  /** Hiç değişmeyen öğe sayısı. */
  unchanged: number;
  /** Silinenlerin ilk birkaçının adı (kullanıcıya gösterim için). */
  removedSamples: string[];
}

export interface RefreshDiff {
  live: KindDiff;
  vod: KindDiff;
  series: KindDiff;
  /** Olağandışı düşüş var mı? (kullanıcı onayına sunulmalı) */
  suspiciousDrop: boolean;
  /** Hangi türlerde olağandışı düşüş var. */
  suspiciousKinds: string[];
}

/** Bir içerik öğesinin kararlı kimliği. */
function itemKey(x: any): string {
  if (!x) return '';
  const sid = x.stream_id ?? x.series_id ?? x.streamId ?? x.seriesId;
  if (sid !== undefined && sid !== null && String(sid).length) return `s:${sid}`;
  if (x.id) return `i:${x.id}`;
  if (x.url) return `u:${String(x.url).trim()}`;
  return `n:${String(x.name || '').trim()}|${String(x.group || '').trim()}`;
}

/** Öğenin "içeriği değişti mi" karşılaştırması için parmak izi. */
function itemFingerprint(x: any): string {
  return [
    String(x?.name || ''),
    String(x?.group || ''),
    String(x?.url || ''),
    String(x?.logo || ''),
  ].join('\u0000');
}

const EMPTY: KindDiff = {
  before: 0, after: 0, added: 0, removed: 0, changed: 0, unchanged: 0, removedSamples: [],
};

/**
 * İki listeyi karşılaştırır.
 * @param before güncelleme öncesi liste (yoksa boş kabul edilir)
 * @param after  güncelleme sonrası liste
 */
export function diffKind(before: any[] | undefined | null, after: any[] | undefined | null): KindDiff {
  const prev = Array.isArray(before) ? before : [];
  const next = Array.isArray(after) ? after : [];
  if (prev.length === 0 && next.length === 0) return { ...EMPTY };

  const prevMap = new Map<string, any>();
  for (const x of prev) { const k = itemKey(x); if (k) prevMap.set(k, x); }

  let added = 0, changed = 0, unchanged = 0;
  const seen = new Set<string>();
  for (const x of next) {
    const k = itemKey(x);
    if (!k) continue;
    seen.add(k);
    const old = prevMap.get(k);
    if (!old) { added++; continue; }
    if (itemFingerprint(old) !== itemFingerprint(x)) changed++; else unchanged++;
  }

  const removedSamples: string[] = [];
  let removed = 0;
  for (const [k, x] of prevMap) {
    if (seen.has(k)) continue;
    removed++;
    if (removedSamples.length < 8) removedSamples.push(String(x?.name || k).slice(0, 60));
  }

  return { before: prev.length, after: next.length, added, removed, changed, unchanged, removedSamples };
}

/**
 * Olağandışı düşüş eşiği.
 * Sağlayıcı eksik/bozuk cevap verdiğinde katalog aniden küçülür. Bunu "başarılı
 * güncelleme" saymak, kullanıcının içeriğini kaybetmesi demektir.
 * Eşik: önceden en az 50 öğe varken %30'dan fazla kayıp.
 */
export function isSuspiciousDrop(d: KindDiff): boolean {
  if (d.before < 50) return false;
  return d.removed / d.before > 0.30;
}

export function buildRefreshDiff(
  before: { channels?: any[]; vod?: any[]; series?: any[] } | null | undefined,
  after: { channels?: any[]; vod?: any[]; series?: any[] } | null | undefined,
): RefreshDiff {
  const live = diffKind(before?.channels, after?.channels);
  const vod = diffKind(before?.vod, after?.vod);
  const series = diffKind(before?.series, after?.series);
  const suspiciousKinds: string[] = [];
  if (isSuspiciousDrop(live)) suspiciousKinds.push('Canlı');
  if (isSuspiciousDrop(vod)) suspiciousKinds.push('Film');
  if (isSuspiciousDrop(series)) suspiciousKinds.push('Dizi');
  return { live, vod, series, suspiciousDrop: suspiciousKinds.length > 0, suspiciousKinds };
}

const nf = (n: number) => n.toLocaleString('tr-TR');

/** Tek tür için kullanıcıya gösterilecek satır. */
export function formatKindLine(label: string, d: KindDiff): string | null {
  if (d.before === 0 && d.after === 0) return null;
  const parts = [`${label}: ${nf(d.before)} → ${nf(d.after)}`];
  if (d.added) parts.push(`+${nf(d.added)} eklendi`);
  if (d.removed) parts.push(`−${nf(d.removed)} silindi`);
  if (d.changed) parts.push(`${nf(d.changed)} güncellendi`);
  if (!d.added && !d.removed && !d.changed) parts.push('değişiklik yok');
  return parts.join(' · ');
}

/** Tüm rapor — telefon ve TV'de aynı metin kullanılır. */
export function formatRefreshDiff(diff: RefreshDiff): string {
  const lines = [
    formatKindLine('Canlı', diff.live),
    formatKindLine('Film', diff.vod),
    formatKindLine('Dizi', diff.series),
  ].filter(Boolean) as string[];
  if (lines.length === 0) return 'Güncellenecek içerik bulunamadı.';
  if (diff.suspiciousDrop) {
    lines.push('');
    lines.push(`⚠ Olağandışı içerik kaybı (${diff.suspiciousKinds.join(', ')}). Sağlayıcı eksik cevap vermiş olabilir.`);
  }
  return lines.join('\n');
}

/** Flight Recorder'a yazılacak sade veri (örnek adlar hariç). */
export function diffTelemetry(diff: RefreshDiff, reason: string) {
  const pick = (d: KindDiff) => ({ before: d.before, after: d.after, added: d.added, removed: d.removed, changed: d.changed });
  return {
    reason,
    live: pick(diff.live),
    vod: pick(diff.vod),
    series: pick(diff.series),
    suspiciousDrop: diff.suspiciousDrop,
    suspiciousKinds: diff.suspiciousKinds,
  };
}

/**
 * v17.9.1 — Native (Room) tarafında hesaplanan farkı rapor biçimine çevirir.
 * Native Core modunda JS bellekteki diziler boş olduğundan fark YALNIZ burada
 * doğru hesaplanabilir. "Güncellendi" (aynı kimlik, değişen içerik) native'de
 * sayılmadığı için 0'dır; eklenen/silinen/değişmeyen sayıları kesindir.
 */
export function diffFromNative(native: any): RefreshDiff | null {
  if (!native || typeof native !== "object") return null;
  const pick = (k: string): KindDiff => {
    const d = native[k] || {};
    const before = Number(d.before || 0), after = Number(d.after || 0);
    return {
      before, after,
      added: Number(d.added || 0), removed: Number(d.removed || 0),
      changed: 0, unchanged: Number(d.unchanged || 0), removedSamples: [],
    };
  };
  const live = pick("live"), vod = pick("vod"), series = pick("series");
  const suspiciousKinds: string[] = [];
  if (isSuspiciousDrop(live)) suspiciousKinds.push("Canlı");
  if (isSuspiciousDrop(vod)) suspiciousKinds.push("Film");
  if (isSuspiciousDrop(series)) suspiciousKinds.push("Dizi");
  return { live, vod, series, suspiciousDrop: suspiciousKinds.length > 0, suspiciousKinds };
}
