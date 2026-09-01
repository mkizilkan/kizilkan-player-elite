/**
 * KIZILKAN PLAYER — Zaman Çubuğu (Seek Bar)
 * Dosya  : frontend/src/components/SeekBar.tsx
 * Sürüm  : v1.0.0 (v5.0.0)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * IPTV Extreme Pro'daki gibi konum/süre gösterimi ve SÜRÜKLEYEREK atlama.
 * ESKİ SORUN: Player'da hiç zaman çubuğu yoktu; filmde istediğin dakikaya
 * atlamak imkânsızdı (sadece çift dokunuşla 10'ar saniye).
 *
 * NOT: Yeni bir paket (slider) EKLENMEDİ — dokunma olayları ve ölçülen genişlik
 * ile kendi çubuğumuzu çiziyoruz. Böylece native risk oluşmuyor.
 *
 * Canlı yayınlarda süre bilinmediği için çubuk yerine "CANLI" rozeti gösterilir.
 * ===========================================================================
 */

import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONT, SPACING } from "@/src/theme/themes";

interface Props {
  /** Mevcut konum (saniye). */
  position: number;
  /** Toplam süre (saniye). 0 veya yoksa canlı kabul edilir. */
  duration: number;
  /** Canlı yayın mı (çubuk yerine rozet gösterilir). */
  isLive?: boolean;
  /** Sürükleme bitince çağrılır (saniye). */
  onSeek: (seconds: number) => void;
}

/** Saniyeyi 1:23:45 / 12:34 biçimine çevirir. */
export function formatTime(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "0:00";
  const s = Math.floor(total % 60);
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

export function SeekBar({ position, duration, isLive, onSeek }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Ölçüm ve sürükleme değerleri ref'te — PanResponder kapanış (closure) sorunu
  // yaşamasın diye. (Bu, eski koddaki "stale closure" hatalarının kaynağıydı.)
  const widthRef = useRef(0);
  const durationRef = useRef(0);
  widthRef.current = width;
  durationRef.current = duration;

  const seekable = !isLive && duration > 0;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (widthRef.current <= 0 || durationRef.current <= 0) return;
        setDragging(true);
        const x = Math.max(0, Math.min(e.nativeEvent.locationX, widthRef.current));
        setDragValue((x / widthRef.current) * durationRef.current);
      },
      onPanResponderMove: (e, gesture) => {
        if (widthRef.current <= 0 || durationRef.current <= 0) return;
        const x = Math.max(0, Math.min(gesture.moveX - (e.nativeEvent.pageX - e.nativeEvent.locationX), widthRef.current));
        setDragValue((x / widthRef.current) * durationRef.current);
      },
      onPanResponderRelease: () => {
        setDragging((wasDragging) => {
          if (wasDragging) {
            setDragValue((v) => { onSeek(v); return v; });
          }
          return false;
        });
      },
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Canlı yayın: çubuk yok, rozet var.
  if (!seekable) {
    return (
      <View style={styles.liveRow}>
        <View style={[styles.liveDot, { backgroundColor: colors.brandPrimary }]} />
        <Text style={[styles.liveText, { color: colors.brandPrimary }]}>CANLI</Text>
        {position > 0 && (
          <Text style={[styles.time, { color: "#fff", marginLeft: SPACING.sm }]}>{formatTime(position)}</Text>
        )}
      </View>
    );
  }

  const shown = dragging ? dragValue : position;
  const pct = duration > 0 ? Math.max(0, Math.min(shown / duration, 1)) : 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.time, { color: "#fff" }]}>{formatTime(shown)}</Text>

      <View style={styles.trackArea} onLayout={onLayout} {...pan.panHandlers}>
        {/* Arka çubuk */}
        <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.28)" }]} />
        {/* Dolu kısım */}
        <View
          style={[
            styles.track,
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: colors.brandPrimary },
          ]}
        />
        {/* Tutamaç */}
        <View
          style={[
            styles.thumb,
            {
              left: `${pct * 100}%`,
              backgroundColor: colors.brandPrimary,
              transform: [{ translateX: -7 }, { scale: dragging ? 1.4 : 1 }],
            },
          ]}
        />
      </View>

      <Text style={[styles.time, { color: "rgba(255,255,255,0.75)" }]}>{formatTime(duration)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  time: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold, minWidth: 46, textAlign: "center" },
  trackArea: { flex: 1, height: 32, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, width: "100%" },
  fill: { position: "absolute", left: 0 },
  thumb: { position: "absolute", width: 14, height: 14, borderRadius: 7 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.lg, height: 32 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1 },
});

export default SeekBar;
