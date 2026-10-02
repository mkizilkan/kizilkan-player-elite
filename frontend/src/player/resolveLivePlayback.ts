import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { loadOverrides } from "@/src/utils/overrides";
import { buildPlaybackRequest } from "./v2/request";

/** Small alternative player surfaces use the same item/header/MAG boundary as
 * PlayerHost without hydrating a canonical playlist into JavaScript. */
export async function resolveLivePlayback(playlist: any, candidate: any, options: { forceFresh?: boolean; allowItem?: (item: any) => boolean } = {}) {
  const item = KizilkanNativeCore.available
    ? await KizilkanNativeCore.getItem<any>(String(playlist.id), "live", String(candidate.id))
    : candidate;
  if (!item?.url) throw new Error("Kanalın oynatma kaynağı bulunamadı.");
  if (options.allowItem && !options.allowItem(item)) throw new Error("Bu kanal ebeveyn kontrolü nedeniyle açılamaz.");
  const overrides = await loadOverrides(String(playlist.id));
  let url = String(item.url);
  let runtimeHeaders: Record<string, string> | undefined;
  if (playlist.source === "stalker") {
    const { stalkerResolveStream, stalkerCredsFromPlaylist, stripStreamPrefix } = await import("@/src/utils/stalker");
    const resolved = await stalkerResolveStream(stalkerCredsFromPlaylist(playlist), null, url, { forceFresh: !!options.forceFresh });
    url = stripStreamPrefix(resolved.url);
    runtimeHeaders = resolved.headers;
  }
  return { item, request: buildPlaybackRequest({ url, channel: item, playlist, override: overrides[item.id], runtimeHeaders, isLive: true }) };
}
