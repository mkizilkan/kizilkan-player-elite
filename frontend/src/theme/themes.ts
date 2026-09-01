export type ThemeName = 'netflix' | 'turkish_flag' | 'modern' | 'vu_iptv';

export interface ThemePalette {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  brandPrimary: string;
  onBrandPrimary: string;
  border: string;
  success: string;
  error: string;
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  netflix: {
    surface: '#000000',
    onSurface: '#FFFFFF',
    surfaceSecondary: '#141414',
    onSurfaceSecondary: '#B3B3B3',
    surfaceTertiary: '#262626',
    onSurfaceTertiary: '#999999',
    surfaceInverse: '#FFFFFF',
    onSurfaceInverse: '#000000',
    brandPrimary: '#E50914',
    onBrandPrimary: '#FFFFFF',
    border: '#262626',
    success: '#2E7D32',
    error: '#D32F2F',
  },
  turkish_flag: {
    surface: '#1A0205',
    onSurface: '#FFFFFF',
    surfaceSecondary: '#2E040C',
    onSurfaceSecondary: '#E0B3B9',
    surfaceTertiary: '#4A0A16',
    onSurfaceTertiary: '#F2D8DC',
    surfaceInverse: '#FFFFFF',
    onSurfaceInverse: '#1A0205',
    brandPrimary: '#E30A17',
    onBrandPrimary: '#FFFFFF',
    border: '#4A0A16',
    success: '#2E7D32',
    error: '#FF4D4D',
  },
  modern: {
    surface: '#121212',
    onSurface: '#F5F5F5',
    surfaceSecondary: '#1E2024',
    onSurfaceSecondary: '#A0AAB5',
    surfaceTertiary: '#2A2E35',
    onSurfaceTertiary: '#C8D0D8',
    surfaceInverse: '#F5F5F5',
    onSurfaceInverse: '#121212',
    brandPrimary: '#0A84FF',
    onBrandPrimary: '#FFFFFF',
    border: '#2A2E35',
    success: '#32D74B',
    error: '#FF453A',
  },
  vu_iptv: {
    surface: '#070D1F',
    onSurface: '#FFFFFF',
    surfaceSecondary: '#0F1934',
    onSurfaceSecondary: '#8E9BB8',
    surfaceTertiary: '#1A2547',
    onSurfaceTertiary: '#B5C1DE',
    surfaceInverse: '#FFFFFF',
    onSurfaceInverse: '#070D1F',
    brandPrimary: '#FF7A00',
    onBrandPrimary: '#FFFFFF',
    border: '#1A2547',
    success: '#00C853',
    error: '#FF3D00',
  },
};

export const THEME_LABELS: Record<ThemeName, string> = {
  netflix: 'Netflix',
  turkish_flag: 'Türk Bayrağı',
  modern: 'Modern',
  vu_iptv: 'Vu IPTV',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const FONT = {
  size: { xs: 11, sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};
