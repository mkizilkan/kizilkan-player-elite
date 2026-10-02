const PREFIX = '@list:';
export function libraryItemKey(playlistId: string, itemId: string): string {
  return `${PREFIX}${encodeURIComponent(playlistId)}:${itemId}`;
}
export function libraryScopePrefix(playlistId: string): string {
  return `${PREFIX}${encodeURIComponent(playlistId)}:`;
}
export function libraryScopedMap<T>(map: Record<string, T>, playlistId: string, legacyOwner: string | null): Record<string, T> {
  if (!playlistId) return {};
  const prefix = libraryScopePrefix(playlistId);
  const out: Record<string, T> = {};
  if (legacyOwner === playlistId) for (const [key, value] of Object.entries(map)) if (!key.startsWith(PREFIX)) out[key] = value;
  for (const [key, value] of Object.entries(map)) if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  return out;
}
export function libraryScopedIds(ids: string[], playlistId: string, legacyOwner: string | null): string[] {
  if (!playlistId) return [];
  const prefix = libraryScopePrefix(playlistId);
  return Array.from(new Set(ids.filter(id => id.startsWith(prefix) || (legacyOwner === playlistId && !id.startsWith(PREFIX)))
    .map(id => id.startsWith(prefix) ? id.slice(prefix.length) : id)));
}
export function removeScopedLibraryItem<T>(map: Record<string, T>, playlistId: string, itemId: string, legacyOwner: string | null): Record<string, T> {
  const next = { ...map }; delete next[libraryItemKey(playlistId, itemId)];
  if (legacyOwner === playlistId) delete next[itemId];
  return next;
}
/** Explicit clearing affects the visible list only; unclaimed legacy entries are retained. */
export function clearScopedLibraryMap<T>(map: Record<string, T>, playlistId: string, legacyOwner: string | null): Record<string, T> {
  if (!playlistId) return { ...map };
  const prefix = libraryScopePrefix(playlistId);
  return Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith(prefix) && !(legacyOwner === playlistId && !key.startsWith(PREFIX))));
}
export function removeScopedLibraryId(ids: string[], playlistId: string, itemId: string, legacyOwner: string | null): string[] {
  const key = libraryItemKey(playlistId, itemId);
  return ids.filter(id => id !== key && !(legacyOwner === playlistId && id === itemId));
}
/** New per-list caps never prune another list or legacy entries during migration. */
export function trimScopedLibraryMap<T>(map: Record<string, T>, playlistId: string, max: number, timestamp: (value: T) => number): Record<string, T> {
  const prefix = libraryScopePrefix(playlistId);
  const keys = Object.keys(map).filter(key => key.startsWith(prefix));
  if (keys.length <= max) return map;
  const next = { ...map };
  keys.sort((a, b) => timestamp(map[b]) - timestamp(map[a])).slice(max).forEach(key => { delete next[key]; });
  return next;
}
export function trimScopedLibraryIds(ids: string[], playlistId: string, max: number): string[] {
  const prefix = libraryScopePrefix(playlistId);
  let count = 0;
  return ids.filter(id => !id.startsWith(prefix) || ++count <= max);
}
