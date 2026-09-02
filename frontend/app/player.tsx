/**
 * /player ROUTE — İNCE YÖNLENDİRME (YOL B / FAZ 1)
 *
 * Gerçek oynatıcı artık kök seviyede KALICI katman: src/player/PlayerHost.tsx
 * (bkz. app/_layout.tsx). Bu route dosyası yalnızca eski `router.push("/player",
 * {id})` çağrılarını kalıcı katmana köprüler: paramı global duruma yazar ve
 * kendini yığından düşürür. Böylece video yüzeyi hiç yeniden-attach olmaz →
 * listeden açılışta arkadaki temalı ekran sızamaz (şerit/boyanma kökü çözülür).
 */
import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePlayer } from "@/src/player/PlayerContext";

export default function PlayerRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ext?: string; resumeAt?: string; navOrigin?: string; navGroup?: string; navSearch?: string; focusKey?: string; navScopeKey?: string }>();
  const { openPlayer } = usePlayer();

  useEffect(() => {
    const id = params.id ? String(params.id) : "";
    if (id) {
      openPlayer({
        id,
        ext: params.ext ? String(params.ext) : undefined,
        resumeAt: params.resumeAt ? Number(params.resumeAt) : undefined,
        nav: {
          origin: (params.navOrigin ? String(params.navOrigin) : "unknown") as any,
          group: params.navGroup ? String(params.navGroup) : undefined,
          search: params.navSearch ? String(params.navSearch) : undefined,
          focusKey: params.focusKey ? String(params.focusKey) : undefined,
          scopeKey: params.navScopeKey ? String(params.navScopeKey) : undefined,
        },
      });
    }
    // Kendini yığından düşür — kalıcı katman zaten üstte gösterecek.
    try { if ((router as any).canGoBack?.()) router.back(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
