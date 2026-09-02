/**
 * KIZILKAN PLAYER — Kullanıcı Özelleştirmeleri (İsim / Simge / Grup)
 * Dosya  : frontend/src/utils/overrides.ts
 * Sürüm  : v1.0.0 (v5.0.0)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * IPTV Extreme Pro'daki "İsimleri Yönet", "Kanal Simgesi Değiştir" ve
 * "Add / Remove Group" özelliklerinin karşılığı.
 *
 * Kullanıcının yaptığı değişiklikler LİSTEYİ BOZMADAN ayrı saklanır. Liste
 * yenilendiğinde (sağlayıcıdan tekrar çekildiğinde) özelleştirmeler KAYBOLMAZ,
 * çünkü kanalın kalıcı ID'sine bağlıdırlar.
 *
 * Yapı:  kizilkan.overrides.<playlistId> = {
 *          "<itemId>": { name?: string, logo?: string, groups?: string[] }
 *        }
 * ===========================================================================
 */

import { storage } from "./storage";

export interface ItemOverride {
  /** Kullanıcının verdiği isim (orijinalin yerine gösterilir). */
  name?: string;
  /** Kullanıcının verdiği logo/afiş adresi. */
  logo?: string;
  /** Kullanıcının eklediği özel gruplar. */
  groups?: string[];
  /**
   * KANAL BAŞINA BAĞLANTI BAŞLIKLARI (v7.3.0)
   * Bazı yayınlar belirli bir User-Agent veya Referer olmadan açılmaz
   * ("başka oynatıcıda çalışıyor ama burada çalışmıyor" durumunun sık sebebi).
   * Boş bırakılırsa uygulamanın varsayılanı kullanılır.
   */
  userAgent?: string;
  referer?: string;
  /** v17.0.2: item-level Origin; overrides playlist/account default. */
  origin?: string;
}

export type OverrideMap = Record<string, ItemOverride>;

const KEY_PREFIX = "kizilkan.overrides.";

/** Değişiklikleri dinleyenler (ekranların anında güncellenmesi için). */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOverrides(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notify() { listeners.forEach(fn => { try { fn(); } catch {} }); }

/** Bir listenin tüm özelleştirmelerini okur. */
export async function loadOverrides(playlistId: string): Promise<OverrideMap> {
  if (!playlistId) return {};
  try {
    const raw = await storage.getItem<string>(KEY_PREFIX + playlistId, "");
    if (!raw) return {};
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Tek bir öğenin özelleştirmesini günceller (birleştirerek). */
export async function setOverride(
  playlistId: string,
  itemId: string,
  patch: ItemOverride
): Promise<OverrideMap> {
  const map = await loadOverrides(playlistId);
  const current = map[itemId] || {};
  const next: ItemOverride = { ...current, ...patch };

  // Boş alanları temizle (gereksiz veri tutma).
  if (!next.name) delete next.name;
  if (!next.logo) delete next.logo;
  if (next.groups && next.groups.length === 0) delete next.groups;

  if (Object.keys(next).length === 0) delete map[itemId];
  else map[itemId] = next;

  await storage.setItem(KEY_PREFIX + playlistId, JSON.stringify(map));
  notify();
  return map;
}

/** Bir öğeyi özel gruba ekler/çıkarır. */
export async function toggleGroup(
  playlistId: string,
  itemId: string,
  group: string
): Promise<OverrideMap> {
  const map = await loadOverrides(playlistId);
  const current = map[itemId] || {};
  const groups = new Set(current.groups || []);
  if (groups.has(group)) groups.delete(group);
  else groups.add(group);
  return setOverride(playlistId, itemId, { groups: Array.from(groups) });
}

/** Bir öğenin tüm özelleştirmelerini siler. */
export async function clearOverride(playlistId: string, itemId: string): Promise<void> {
  const map = await loadOverrides(playlistId);
  delete map[itemId];
  await storage.setItem(KEY_PREFIX + playlistId, JSON.stringify(map));
  notify();
}

/** Listedeki tüm özel grup adlarını toplar (kategori listesine eklemek için). */
export function collectCustomGroups(map: OverrideMap): string[] {
  const set = new Set<string>();
  Object.values(map).forEach(o => (o.groups || []).forEach(g => set.add(g)));
  return Array.from(set).sort();
}

/**
 * Bir öğeye özelleştirmeleri uygular (isim/logo).
 * Orijinal nesneyi DEĞİŞTİRMEZ, kopyasını döndürür.
 */
export function applyOverride<T extends { id: string; name?: string; logo?: string; poster?: string | null }>(
  item: T,
  map: OverrideMap
): T {
  const o = map[item.id];
  if (!o) return item;
  const out: any = { ...item };
  if (o.name) out.name = o.name;
  if (o.logo) {
    out.logo = o.logo;
    if ("poster" in out) out.poster = o.logo;
  }
  return out as T;
}

// ===========================================================================
// SIRALAMA ve DÜZEN (v5.1.0)
// ===========================================================================
/**
 * Kullanıcının elle belirlediği sıra.
 *  - groups: özel grupların gösterim sırası
 *  - items : her grup içindeki öğelerin sırası (grup adı -> öğe id listesi)
 *
 * Sunucudan gelen kategoriler bu düzenden ETKİLENMEZ; sadece kullanıcının
 * kendi oluşturduğu gruplar ve içerikleri elle taşınabilir.
 */
export interface Ordering {
  groups: string[];
  items: Record<string, string[]>;
}

const ORDER_PREFIX = "kizilkan.ordering.";

export async function loadOrdering(playlistId: string): Promise<Ordering> {
  if (!playlistId) return { groups: [], items: {} };
  try {
    const raw = await storage.getItem<string>(ORDER_PREFIX + playlistId, "");
    if (!raw) return { groups: [], items: {} };
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { groups: Array.isArray(p?.groups) ? p.groups : [], items: p?.items && typeof p.items === "object" ? p.items : {} };
  } catch {
    return { groups: [], items: {} };
  }
}

async function saveOrdering(playlistId: string, o: Ordering): Promise<void> {
  await storage.setItem(ORDER_PREFIX + playlistId, JSON.stringify(o));
  notify();
}

/** Bir grubu listede yukarı/aşağı taşır. */
export async function moveGroup(
  playlistId: string,
  group: string,
  direction: -1 | 1,
  knownGroups: string[]
): Promise<void> {
  const o = await loadOrdering(playlistId);
  // Kayıtlı sıra yoksa bilinen gruplardan başlat.
  let list = o.groups.length > 0 ? [...o.groups] : [...knownGroups];
  // Eksik grupları sona ekle (yeni oluşturulmuş olabilir).
  knownGroups.forEach(g => { if (!list.includes(g)) list.push(g); });
  // Artık var olmayanları temizle.
  list = list.filter(g => knownGroups.includes(g));

  const i = list.indexOf(group);
  if (i === -1) return;
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];

  o.groups = list;
  await saveOrdering(playlistId, o);
}

/** Bir grup içindeki öğeyi yukarı/aşağı taşır. */
export async function moveItemInGroup(
  playlistId: string,
  group: string,
  itemId: string,
  direction: -1 | 1,
  currentOrder: string[]
): Promise<void> {
  const o = await loadOrdering(playlistId);
  let list = o.items[group]?.length ? [...o.items[group]] : [...currentOrder];
  currentOrder.forEach(id => { if (!list.includes(id)) list.push(id); });
  list = list.filter(id => currentOrder.includes(id));

  const i = list.indexOf(itemId);
  if (i === -1) return;
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];

  o.items[group] = list;
  await saveOrdering(playlistId, o);
}

/** Grubu yeniden adlandırır (tüm öğelerde ve sırada). */
export async function renameGroup(
  playlistId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const clean = newName.trim();
  if (!clean || clean === oldName) return;

  const map = await loadOverrides(playlistId);
  Object.keys(map).forEach(id => {
    const gs = map[id].groups;
    if (gs && gs.includes(oldName)) {
      const next = gs.filter(g => g !== oldName);
      if (!next.includes(clean)) next.push(clean);
      map[id] = { ...map[id], groups: next };
    }
  });
  await storage.setItem(KEY_PREFIX + playlistId, JSON.stringify(map));

  const o = await loadOrdering(playlistId);
  o.groups = o.groups.map(g => (g === oldName ? clean : g));
  if (o.items[oldName]) {
    o.items[clean] = o.items[oldName];
    delete o.items[oldName];
  }
  await saveOrdering(playlistId, o);
}

/** Grubu tamamen siler (tüm öğelerden çıkarır). */
export async function deleteGroup(playlistId: string, group: string): Promise<void> {
  const map = await loadOverrides(playlistId);
  Object.keys(map).forEach(id => {
    const gs = map[id].groups;
    if (gs && gs.includes(group)) {
      const next = gs.filter(g => g !== group);
      if (next.length > 0) map[id] = { ...map[id], groups: next };
      else {
        const rest = { ...map[id] };
        delete rest.groups;
        if (Object.keys(rest).length === 0) delete map[id];
        else map[id] = rest;
      }
    }
  });
  await storage.setItem(KEY_PREFIX + playlistId, JSON.stringify(map));

  const o = await loadOrdering(playlistId);
  o.groups = o.groups.filter(g => g !== group);
  delete o.items[group];
  await saveOrdering(playlistId, o);
}

/** Kayıtlı sıraya göre grupları düzenler (kayıtsızlar sona). */
export function applyGroupOrder(groups: string[], ordering: Ordering): string[] {
  if (!ordering.groups.length) return groups;
  const known = ordering.groups.filter(g => groups.includes(g));
  const rest = groups.filter(g => !known.includes(g));
  return [...known, ...rest];
}

/** Kayıtlı sıraya göre bir grubun öğelerini düzenler. */
export function applyItemOrder<T extends { id: string }>(
  items: T[],
  group: string,
  ordering: Ordering
): T[] {
  const order = ordering.items[group];
  if (!order?.length) return items;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ia = pos.has(a.id) ? (pos.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
    const ib = pos.has(b.id) ? (pos.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
}

// ===========================================================================
// KATEGORİ SIRALAMA TERCİHİ (v5.1.0)
// ===========================================================================
export type CategorySort = "server" | "az" | "za";

/**
 * Sıralama tercihi LİSTE BAŞINA saklanır (v5.1.1).
 * Böylece yeni eklenen her oynatma listesi VARSAYILAN olarak sunucudan geldiği
 * sırayla açılır; kullanıcının başka bir listede yaptığı A-Z tercihi yeni
 * listeye bulaşmaz. Kullanıcı istediği an değiştirebilir.
 */
const SORT_PREFIX = "kizilkan.categorySort.";

export async function loadCategorySort(playlistId: string): Promise<CategorySort> {
  if (!playlistId) return "server";
  const v = await storage.getItem<string>(SORT_PREFIX + playlistId, "server");
  return v === "az" || v === "za" || v === "server" ? v : "server";
}

export async function saveCategorySort(playlistId: string, v: CategorySort): Promise<void> {
  if (!playlistId) return;
  await storage.setItem(SORT_PREFIX + playlistId, v);
  notify();
}

/** Sağlayıcı kategorilerini seçilen tercihe göre sıralar. */
export function sortCategories(cats: string[], mode: CategorySort): string[] {
  if (mode === "server") return cats;          // sunucudan geldiği sıra
  const sorted = [...cats].sort((a, b) => a.localeCompare(b, "tr"));
  return mode === "az" ? sorted : sorted.reverse();
}
