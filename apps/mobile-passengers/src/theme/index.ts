/**
 * Lifty passenger theme — brand SoT = Pencil + design-tokens.
 * Aligned with driver kit (A+B+C): radii, shadows, Inter.
 */
const brand = {
  primary: '#00C2B3',
  deepBlue: '#0D2B45',
  lightGray: '#F1F4F6',
  mediumGray: '#A8B1BA',
  white: '#FFFFFF',
  background: '#EEF7F6',
  surface: '#FFFFFF',
  surfaceMuted: '#E3F0EE',
  black: '#000000',
  dangerRed: '#E53935',
  amber: '#FFB020',
  success: '#34C759',
  warning: '#FFB020',
} as const;

export const theme = {
  colors: {
    /** @deprecated prefer `primary` */
    turquoise: brand.primary,
    primary: brand.primary,
    deepBlue: brand.deepBlue,
    lightGray: brand.lightGray,
    mediumGray: brand.mediumGray,
    white: brand.white,
    background: brand.background,
    surface: brand.surface,
    surfaceMuted: brand.surfaceMuted,
    black: brand.black,
    dangerRed: brand.dangerRed,
    amber: brand.amber,
    success: brand.success,
    warning: brand.warning,
  },
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    full: 9999,
    inputRadius: 14,
    pill: 9999,
    buttonRadius: 16,
  },
  dimensions: {
    buttonHeight: 52,
    buttonCTAHeight: 56,
    inputHeight: 52,
    navbarHeight: 56,
    statusBarHeight: 44,
    screenWidth: 390,
    tabBarHeight: 72,
  },
  shadows: {
    card: {
      shadowColor: '#0D2B45',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 3,
    },
    button: {
      shadowColor: brand.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 4,
    },
  },
  fontStyles: {
    heading: {
      fontSize: 32,
      fontWeight: '700' as const,
      color: brand.deepBlue,
      letterSpacing: -0.5,
    },
    subheading: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: brand.deepBlue,
      letterSpacing: -0.2,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      color: brand.deepBlue,
    },
    label: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: brand.mediumGray,
      letterSpacing: 0.2,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      color: brand.mediumGray,
    },
    amount: {
      fontSize: 40,
      fontWeight: '700' as const,
      color: brand.deepBlue,
      letterSpacing: -1,
    },
  },
};

export type Theme = typeof theme;
