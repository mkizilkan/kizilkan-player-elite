/**
 * KIZILKAN PLAYER — Hata Sınırı (Error Boundary)
 * Dosya   : frontend/src/components/ErrorBoundary.tsx
 * Sürüm   : v1.0.0
 * Faz     : FAZ A / Madde 4
 *
 * ---------------------------------------------------------------------------
 * NEDEN GEREKLİ?
 * ---------------------------------------------------------------------------
 * React'te bir bileşenin render'ında oluşan hata yakalanmazsa TÜM ağaç
 * söküllür ve kullanıcı bembeyaz/simsiyah bir ekranla kalır — ne olduğuna dair
 * hiçbir bilgi olmadan. 21 rotalı, 5 context'li bu uygulamada tek bir bozuk
 * kanal kaydı ya da beklenmedik bir API yanıtı uygulamayı komple kilitleyebilir.
 *
 * ---------------------------------------------------------------------------
 * NEDEN useTheme KULLANMIYOR?
 * ---------------------------------------------------------------------------
 * Bu bileşen _layout.tsx'te ThemeProvider'ın DIŞINDA, en dışta duruyor. Çünkü
 * hata ThemeProvider'ın kendisinden de gelebilir. Context'e bağımlı bir hata
 * ekranı, hatanın kaynağı context ise çalışmaz. Bu yüzden paleti sabit
 * (varsayılan "netflix" teması ile birebir aynı renkler).
 *
 * ---------------------------------------------------------------------------
 * NELERİ YAKALAR / YAKALAMAZ
 * ---------------------------------------------------------------------------
 * YAKALAR   : render, lifecycle ve constructor içindeki senkron hatalar.
 * YAKALAMAZ : event handler'lar (onPress içi), setTimeout, async/await
 *             reddedilmeleri. Bunlar zaten kodda try/catch ile sarılı.
 * ---------------------------------------------------------------------------
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { router } from 'expo-router';

/** Varsayılan tema ("netflix") ile birebir aynı — themes.ts'e bağımlılık yok. */
const C = {
  surface: '#000000',
  onSurface: '#FFFFFF',
  surfaceSecondary: '#141414',
  onSurfaceSecondary: '#B3B3B3',
  surfaceTertiary: '#262626',
  onSurfaceTertiary: '#999999',
  brandPrimary: '#E50914',
  onBrandPrimary: '#FFFFFF',
  border: '#262626',
  error: '#D32F2F',
} as const;

interface Props {
  children: React.ReactNode;
  /** Hata oluştuğunda dışarıya bildirim (ileride uzak loglama için kanca). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
  showDetails: boolean;
  /** Her sıfırlamada artar; child ağacını tamamen yeniden kurmak için key olarak kullanılır. */
  resetCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
    info: null,
    showDetails: false,
    resetCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info });

    // LogBox.ignoreAllLogs kaldırıldığı için bu çıktı artık gerçekten görünür.
    console.error('[ErrorBoundary] Yakalanan hata:', error);
    if (info?.componentStack) {
      console.error('[ErrorBoundary] Bileşen yığını:', info.componentStack);
    }

    try {
      this.props.onError?.(error, info);
    } catch {
      /* logger'ın kendisi patlarsa hata ekranını bozmasın */
    }
  }

  /** Hatayı temizler ve child ağacını sıfırdan kurar. */
  private handleRetry = () => {
    this.setState((prev) => ({
      error: null,
      info: null,
      showDetails: false,
      resetCount: prev.resetCount + 1,
    }));
  };

  /** Önce ana rotaya döner, sonra ağacı sıfırlar. */
  private handleGoHome = () => {
    try {
      router.replace('/');
    } catch {
      /* router hazır değilse sessizce geç — retry yine de ağacı kurar */
    }
    this.handleRetry();
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    const { error, info, showDetails, resetCount } = this.state;

    if (!error) {
      // key: retry sonrası tüm alt ağacın (context'ler dahil) yeniden
      // mount edilmesini garanti eder — bozuk state taşınmaz.
      return <React.Fragment key={resetCount}>{this.props.children}</React.Fragment>;
    }

    const message = error?.message || 'Bilinmeyen bir hata oluştu.';
    const stack = [error?.stack, info?.componentStack].filter(Boolean).join('\n\n');

    return (
      <View style={styles.container} testID="error-boundary-screen">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>

          <Text style={styles.brand}>KIZILKAN PLAYER ELITE</Text>
          <Text style={styles.title}>Beklenmeyen bir hata oluştu</Text>
          <Text style={styles.subtitle}>
            Uygulama bu ekranı çökmemek için gösterdi. Aşağıdaki butonla devam
            edebilirsin; sorun tekrarlarsa detayları paylaşman yeterli.
          </Text>

          <View style={styles.messageBox}>
            <Text style={styles.messageText} selectable>
              {message}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              testID="error-retry-btn"
              onPress={this.handleRetry}
              activeOpacity={0.8}
              focusable
              hasTVPreferredFocus
              style={[styles.button, styles.buttonPrimary]}
            >
              <Text style={styles.buttonPrimaryText}>Tekrar Dene</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="error-home-btn"
              onPress={this.handleGoHome}
              activeOpacity={0.8}
              focusable
              style={[styles.button, styles.buttonGhost]}
            >
              <Text style={styles.buttonGhostText}>Ana Ekrana Dön</Text>
            </TouchableOpacity>
          </View>

          {stack ? (
            <>
              <TouchableOpacity
                testID="error-details-toggle"
                onPress={this.toggleDetails}
                activeOpacity={0.7}
                focusable
                style={styles.detailsToggle}
              >
                <Text style={styles.detailsToggleText}>
                  {showDetails ? '▲ Teknik detayları gizle' : '▼ Teknik detayları göster'}
                </Text>
              </TouchableOpacity>

              {showDetails && (
                <View style={styles.stackBox}>
                  <Text style={styles.stackText} selectable>
                    {stack}
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const mono = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  badgeText: {
    color: C.onBrandPrimary,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  brand: {
    color: C.brandPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  title: {
    color: C.onSurface,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: C.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageBox: {
    backgroundColor: C.surfaceSecondary,
    borderColor: C.error,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  messageText: {
    color: C.onSurface,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: mono,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: C.brandPrimary,
    borderColor: C.brandPrimary,
  },
  buttonPrimaryText: {
    color: C.onBrandPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonGhost: {
    backgroundColor: C.surfaceSecondary,
    borderColor: C.border,
  },
  buttonGhostText: {
    color: C.onSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  detailsToggle: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  detailsToggleText: {
    color: C.onSurfaceTertiary,
    fontSize: 13,
    fontWeight: '600',
  },
  stackBox: {
    backgroundColor: C.surfaceTertiary,
    borderRadius: 10,
    padding: 12,
    maxHeight: 260,
  },
  stackText: {
    color: C.onSurfaceSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: mono,
  },
});

export default ErrorBoundary;
