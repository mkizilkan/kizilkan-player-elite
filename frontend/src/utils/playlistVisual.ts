import type { Playlist, PlaylistSource } from "@/src/types";

export type PlaylistVisualKind = "mag" | "xtream" | "m3u" | "server";

export const PLAYLIST_TYPE_COLORS: Record<PlaylistVisualKind, string> = {
  mag: "#A855F7",
  xtream: "#3B82F6",
  m3u: "#22C55E",
  server: "#F59E0B",
};

export function playlistVisualKind(pl: Pick<Playlist, "source" | "serverCodeBinding">): PlaylistVisualKind {
  if (pl.serverCodeBinding) return "server";
  if (pl.source === "stalker") return "mag";
  if (pl.source === "xtream") return "xtream";
  return "m3u";
}

export function playlistVisualColor(pl: Pick<Playlist, "source" | "serverCodeBinding">): string {
  return PLAYLIST_TYPE_COLORS[playlistVisualKind(pl)];
}

export function playlistTypeLabel(pl: Pick<Playlist, "source" | "serverCodeBinding">): string {
  if (pl.serverCodeBinding) return "Sunucu ile";
  if (pl.source === "stalker") return "MAG";
  if (pl.source === "xtream") return "Xtream";
  if (pl.source === "m3u_file") return "M3U Dosya";
  return "M3U Link";
}

export function playlistTypeIcon(pl: Pick<Playlist, "source" | "serverCodeBinding">): string {
  const kind = playlistVisualKind(pl);
  if (kind === "mag") return "hardware-chip-outline";
  if (kind === "xtream") return "server-outline";
  if (kind === "server") return "cloud-done-outline";
  return "link-outline";
}
