import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/src/theme/ThemeContext';
import { FONT, RADIUS, SPACING } from '@/src/theme/themes';
import { FocusButton } from '@/src/components/FocusButton';
import { CatalogProgressCards } from '@/src/components/CatalogProgressCards';
import type { RefreshProgress } from '@/src/utils/refreshPlaylist';

export function formatCatalogElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
type Props = {
  visible: boolean; title: string; message: string; progress: RefreshProgress | null;
  startedAt: number; lastProgressAt?: number; pausedAt?: number | null; pausedTotalMs?: number;
  paused?: boolean; onCancel?: () => void; presentation?: 'overlay' | 'modal' | 'inline';
  interactive?: boolean; testID?: string;
};
/** Üç giriş noktası aynı sunumu kullanır; iş/iptal sahipliği çağıranda kalır. */
export function CatalogPreparationModal({ visible, title, message, progress, startedAt, lastProgressAt, pausedAt, pausedTotalMs = 0, paused, onCancel, presentation = 'overlay', interactive = true, testID }: Props) {
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!visible) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [visible, startedAt]);
  if (!visible) return null;
  const currentPaused = pausedAt ? Math.max(0, now - pausedAt) : 0;
  const elapsed = Math.max(0, now - startedAt - pausedTotalMs - currentPaused);
  const isPaused = paused || !!pausedAt;
  const silentFor = now - (lastProgressAt || startedAt);
  const waitMessage = isPaused ? 'Uygulama arka planda; hazırlama işlemi bekletiliyor.' : silentFor >= 30000 ? 'Yanıt normalden uzun sürüyor; işlem devam ediyor.' : silentFor >= 15000 ? 'Sunucudan yanıt bekleniyor…' : '';
  const card = <View testID={testID || 'catalog-preparation-modal'} style={{ width: '100%', maxWidth: 640, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: SPACING.lg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md }}>
      <ActivityIndicator size="large" color={colors.brandPrimary}/>
      <Text style={{ flexShrink: 1, color: colors.onSurface, fontSize: FONT.size.xl, fontWeight: '900', textAlign: 'center' }}>{title}</Text>
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.onSurfaceSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 }}>{message}</Text>
    <CatalogProgressCards testID={testID === 'playlist-repair-overlay' ? 'playlist-repair-catalog-progress' : undefined} progress={progress ? { ...progress, message: '' } : null}/>
    <Text style={{ color: colors.onSurfaceTertiary, textAlign: 'center', marginTop: SPACING.md }}>Geçen süre: {formatCatalogElapsed(elapsed)} · {isPaused ? 'Bekletiliyor' : 'Aktif işlem'}{pausedTotalMs + currentPaused > 0 ? ` · Arka plan: ${formatCatalogElapsed(pausedTotalMs + currentPaused)}` : ''}</Text>
    {!!waitMessage && <Text style={{ color: colors.brandPrimary, textAlign: 'center', marginTop: SPACING.sm }}>{waitMessage}</Text>}
    <Text style={{ color: colors.onSurfaceSecondary, textAlign: 'center', marginTop: SPACING.md, lineHeight: 20 }}>{isPaused ? 'Uygulamaya dönünce tamamlanan kataloglar korunur; yarım kalan aşamadan devam edilir.' : 'Canlı, Film ve Dizi aşamaları tamamlandıkça burada güncellenir.'}</Text>
    {onCancel && <FocusButton testID="catalog-preparation-cancel" onPress={onCancel} style={{ marginTop: SPACING.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md }}><Text style={{ color: colors.onSurface, textAlign: 'center', fontWeight: '700' }}>İptal</Text></FocusButton>}
  </View>;
  if (presentation === 'inline') return card;
  const overlay = <View pointerEvents={interactive ? 'auto' : 'none'} style={{ position: presentation === 'modal' ? 'relative' : 'absolute', flex: 1, top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, backgroundColor: interactive ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.55)' }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}>{card}</ScrollView>
  </View>;
  return presentation === 'modal' ? <Modal transparent visible onRequestClose={onCancel}>{overlay}</Modal> : overlay;
}
