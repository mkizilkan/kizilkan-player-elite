/**
 * KIZILKAN PLAYER v18.4.0 — Fotoğraf Görüntüleyici (Medya Merkezi)
 * ===========================================================================
 *  • Tam ekran, sağa/sola kaydırarak geçiş (sayfalı liste, yalnız yakın sayfalar yüklenir)
 *  • İki parmakla yakınlaştırma (1–5×), yakınken sürükleme, çift dokunma 2.5× / sıfırla
 *  • Tek dokunma: kontrolleri gizle/göster
 *  • Slayt gösterisi (3 / 5 / 10 sn, döngü) — ekran açık tutulur
 *  • Döndür (90°), Bilgi, Paylaş
 *  • TV: kontroller gizliyken ◀ ▶ fotoğraf değiştirir, OK/↑↓ kontrolleri açar, ⏯ slayt
 * Yeni paket YOK: expo-image + react-native-gesture-handler + reanimated (kurulu).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, FlatList, StyleSheet, Text, View, useTVEventHandler, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { FONT, SPACING, RADIUS } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { fmtSize } from "@/src/utils/localMedia";
import { getPhotoViewerList, shareMediaItem } from "@/src/utils/deviceMedia";
import { extOf, qualityBadge, type MediaItem } from "@/src/utils/deviceMediaModel";
import { CastButton, type ResolvedCastMedia } from "@/src/components/CastButton";

const SLIDE_STEPS = [3, 5, 10];

function ZoomPage({ item, width, height, rotation, active, onZoomChange, onTap }: {
  item: MediaItem; width: number; height: number; rotation: number; active: boolean;
  onZoomChange: (zoomed: boolean) => void; onTap: () => void;
}) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0), ty = useSharedValue(0), stx = useSharedValue(0), sty = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const reset = useCallback(() => {
    scale.value = withTiming(1); saved.value = 1;
    tx.value = withTiming(0); ty.value = withTiming(0); stx.value = 0; sty.value = 0;
    setZoomed(false); onZoomChange(false);
  }, [onZoomChange, saved, scale, stx, sty, tx, ty]);

  // Sayfadan çıkınca yakınlaştırmayı sıfırla.
  useEffect(() => { if (!active && zoomed) reset(); }, [active, zoomed, reset]);

  const pinch = Gesture.Pinch().runOnJS(true)
    .onUpdate(e => { scale.value = Math.max(1, Math.min(5, saved.value * e.scale)); })
    .onEnd(() => {
      saved.value = scale.value;
      const z = scale.value > 1.02;
      if (!z) reset(); else { setZoomed(true); onZoomChange(true); }
    });
  const pan = Gesture.Pan().runOnJS(true).enabled(zoomed)
    .onUpdate(e => { tx.value = stx.value + e.translationX; ty.value = sty.value + e.translationY; })
    .onEnd(() => { stx.value = tx.value; sty.value = ty.value; });
  const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.02) reset();
      else { scale.value = withTiming(2.5); saved.value = 2.5; setZoomed(true); onZoomChange(true); }
    });
  const singleTap = Gesture.Tap().runOnJS(true).numberOfTaps(1).requireExternalGestureToFail(doubleTap).onEnd(() => onTap());
  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Animated.View style={[{ width, height }, style]}>
          <Image
            source={{ uri: item.uri }}
            style={{ width, height, transform: [{ rotate: `${rotation}deg` }] }}
            contentFit="contain"
            recyclingKey={String(item.id)}
            transition={150}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export default function PhotoViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slideshow?: string }>();
  const { isTv } = useTv();
  const { width, height } = useWindowDimensions();
  const initial = useMemo(() => getPhotoViewerList(), []);
  const items = initial.items;
  const [index, setIndex] = useState(initial.index);
  const [overlay, setOverlay] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [slideSec, setSlideSec] = useState<number>(params.slideshow === "1" ? 5 : 0);
  // v18.6.0: slayt "Sürekli" (sonda başa döner) / "Sonda dur".
  const [slideLoop, setSlideLoop] = useState(true);
  const listRef = useRef<FlatList<MediaItem>>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const goTo = useCallback((i: number, animated = true) => {
    if (!items.length) return;
    const n = (i + items.length) % items.length;
    setIndex(n);
    listRef.current?.scrollToIndex({ index: n, animated });
  }, [items.length]);
  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);
  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo]);

  // Slayt gösterisi + ekranı açık tut
  useEffect(() => {
    if (!slideSec) { KizilkanNativeCore.setKeepScreenOn(false); return; }
    KizilkanNativeCore.setKeepScreenOn(true);
    const t = setInterval(() => {
      if (zoomed) return;
      if (!slideLoop && indexRef.current >= items.length - 1) { setSlideSec(0); return; }
      next();
    }, slideSec * 1000);
    return () => { clearInterval(t); };
  }, [slideSec, zoomed, next, slideLoop, items.length]);
  useEffect(() => () => { KizilkanNativeCore.setKeepScreenOn(false); }, []);
  useEffect(() => {
    void recordDiagnostic("player", "PHOTO_VIEWER_OPEN", { count: items.length, index: initial.index, slideshow: params.slideshow === "1" }, { stage: "media-center", outcome: "started" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TV kumandası: kontroller gizliyken ◀ ▶ gezinir; OK/↑/↓ kontrolleri açar; ⏯ slayt.
  useTVEventHandler((evt: any) => {
    const t = evt?.eventType;
    if (t === "playPause") { setSlideSec(s => (s ? 0 : 5)); return; }
    if (overlay) return;
    if (t === "right") next();
    else if (t === "left") prev();
    else if (t === "select" || t === "up" || t === "down") setOverlay(true);
  });
  // Geri: kontroller açıksa (TV) önce kapat.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isTv && overlay) { setOverlay(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [isTv, overlay]);

  const cur = items[index];
  /**
   * v18.6.0 — CHROMECAST: fotoğraf ve slayt. Fotoğraf telefondaki yayın köprüsünden (LAN)
   * sunulur; bağlıyken fotoğraf değişince (kaydırma / slayt) alıcıya yenisi yüklenir.
   */
  const castSource = useMemo(() => {
    if (!cur) return undefined;
    const mime = cur.mime && cur.mime.startsWith("image/") ? cur.mime : "image/jpeg";
    return {
      url: cur.uri, name: cur.name, contentType: mime, isLive: false,
      resolveCastMedia: async (): Promise<ResolvedCastMedia | null> => {
        const r = await KizilkanNativeCore.castBridgeRegisterFile(cur.uri, mime);
        if (!r.ok || !r.url) throw new Error(r.error || "Fotoğraf köprüsü açılamadı");
        return { url: r.url, contentType: mime, bridged: true, mode: "file" };
      },
    };
  }, [cur]);
  const rotate = () => { if (cur) setRotations(r => ({ ...r, [cur.id]: ((r[cur.id] || 0) + 90) % 360 })); };
  const cycleSlide = () => setSlideSec(s => { const i = SLIDE_STEPS.indexOf(s); return s === 0 ? SLIDE_STEPS[0] : i === SLIDE_STEPS.length - 1 ? 0 : SLIDE_STEPS[i + 1]; });
  const info = () => {
    if (!cur) return;
    Alert.alert("Bilgi", [
      cur.name,
      cur.folder ? `Albüm: ${cur.folder}` : "",
      cur.width && cur.height ? `Çözünürlük: ${cur.width}×${cur.height}${qualityBadge(cur.width, cur.height) ? ` (${qualityBadge(cur.width, cur.height)})` : ""}` : "",
      `Boyut: ${fmtSize(cur.size)}`,
      `Tür: ${(extOf(cur.name) || cur.mime).toUpperCase()}`,
      cur.dateModified ? `Tarih: ${new Date(cur.dateModified * 1000).toLocaleString("tr-TR")}` : "",
    ].filter(Boolean).join("\n"));
  };

  if (!items.length) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: "#fff" }}>Gösterilecek fotoğraf yok.</Text>
        <FocusButton focusKey="pv-close-empty" autoFocus onPress={() => router.back()} style={[styles.btn, { marginTop: SPACING.md }]}>
          <Text style={{ color: "#fff" }}>Kapat</Text>
        </FocusButton>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe} testID="photo-viewer-screen">
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={it => String(it.id)}
        initialScrollIndex={initial.index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        renderItem={({ item, index: i }) => (
          <ZoomPage item={item} width={width} height={height} rotation={rotations[item.id] || 0} active={i === index}
            onZoomChange={setZoomed} onTap={() => setOverlay(o => !o)} />
        )}
      />

      {overlay && (
        <>
          <SafeAreaView edges={["top"]} style={styles.top} pointerEvents="box-none">
            <View style={styles.topRow}>
              <FocusButton focusKey="pv-close" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
                <Ionicons name="close" size={26} color="#fff" />
              </FocusButton>
              <View style={{ flex: 1, paddingHorizontal: SPACING.sm }}>
                <Text style={styles.name} numberOfLines={1}>{cur?.name}</Text>
                <Text style={styles.sub}>{index + 1} / {items.length}{cur?.folder ? ` · ${cur.folder}` : ""}{slideSec ? ` · Slayt ${slideSec} sn` : ""}</Text>
              </View>
              <View style={styles.iconBtn}>
                <CastButton testID="pv-cast" source={castSource} color="#fff" />
              </View>
            </View>
          </SafeAreaView>
          <SafeAreaView edges={["bottom"]} style={styles.bottom} pointerEvents="box-none">
            <View style={styles.bottomRow}>
              <FocusButton focusKey="pv-prev" onPress={prev} style={styles.iconBtn}><Ionicons name="chevron-back" size={26} color="#fff" /></FocusButton>
              <FocusButton focusKey="pv-slide" autoFocus={isTv} onPress={cycleSlide} style={[styles.pill, slideSec ? { backgroundColor: "rgba(229,9,20,0.85)" } : null]}>
                <Ionicons name={slideSec ? "pause" : "play"} size={18} color="#fff" />
                <Text style={styles.pillText}>{slideSec ? `${slideSec} sn` : "Slayt"}</Text>
              </FocusButton>
              <FocusButton focusKey="pv-loop" onPress={() => setSlideLoop(v => !v)} style={[styles.pill, slideLoop ? { backgroundColor: "rgba(229,9,20,0.55)" } : null]}>
                <Ionicons name={slideLoop ? "repeat" : "arrow-forward"} size={16} color="#fff" />
                <Text style={styles.pillText}>{slideLoop ? "Sürekli" : "Sonda dur"}</Text>
              </FocusButton>
              <FocusButton focusKey="pv-rotate" onPress={rotate} style={styles.iconBtn}><Ionicons name="refresh" size={22} color="#fff" /></FocusButton>
              <FocusButton focusKey="pv-info" onPress={info} style={styles.iconBtn}><Ionicons name="information-circle-outline" size={24} color="#fff" /></FocusButton>
              <FocusButton focusKey="pv-share" onPress={() => cur && void shareMediaItem(cur)} style={styles.iconBtn}><Ionicons name="share-social-outline" size={22} color="#fff" /></FocusButton>
              <FocusButton focusKey="pv-next" onPress={next} style={styles.iconBtn}><Ionicons name="chevron-forward" size={26} color="#fff" /></FocusButton>
            </View>
            {isTv ? <Text style={styles.hint}>Geri: kontrolleri gizle · Gizliyken ◀ ▶ fotoğraf değiştirir · ⏯ slayt</Text> : null}
          </SafeAreaView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  topRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  iconBtn: { padding: SPACING.sm, borderRadius: RADIUS.pill },
  btn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: "rgba(255,255,255,0.15)" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: "rgba(255,255,255,0.15)" },
  pillText: { color: "#fff", fontWeight: "700", fontSize: FONT.size.sm },
  name: { color: "#fff", fontSize: FONT.size.base, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.75)", fontSize: FONT.size.xs, marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.6)", fontSize: FONT.size.xs, textAlign: "center", paddingBottom: SPACING.sm },
});
