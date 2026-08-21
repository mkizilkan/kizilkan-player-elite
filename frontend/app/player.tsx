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
  const params = useLocalSearchParams<{ id: string; ext?: string }>();
  const { openPlayer } = usePlayer();

  useEffect(() => {
    const id = params.id ? String(params.id) : "";
    if (id) {
      openPlayer({ id, ext: params.ext ? String(params.ext) : undefined });
    }
    // Kendini yığından düşür — kalıcı katman zaten üstte gösterecek.
    try { if ((router as any).canGoBack?.()) router.back(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
