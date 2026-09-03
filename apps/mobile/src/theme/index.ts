export const theme = {
  colors: {
    turquoise: '#1BBFAE',
    deepBlue: '#0F2A44',
    lightGray: '#EDF1F5',
    mediumGray: '#8A93A0',
    white: '#FFFFFF',
    /** App chrome / full-screen fill (soft blue-tinted, not cold Win98 gray). */
    background: '#EEF3F7',
    /** Cards and elevated panels on top of background. */
    surface: '#FFFFFF',
    /** Soft section plates, chips, empty wells. */
    surfaceMuted: '#E2EAF0',
    dangerRed: '#FF6B6B',
    amber: '#FFB020',
    success: '#34C759',
    warning: '#FFB020',
  },
  fontFamily: {
    regular: 'Nunito_400Regular',
    medium: 'Nunito_500Medium',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
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
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
    inputRadius: 8,
    pill: 24,
    buttonRadius: 12,
  },
  dimensions: {
    buttonHeight: 48,
    buttonCTAHeight: 56,
    inputHeight: 48,
    navbarHeight: 64,
    screenWidth: 375,
    tabBarHeight: 68,
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    button: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 5,
      elevation: 1,
    },
  },
  fontStyles: {
    heading: {
      fontSize: 32,
      fontWeight: '700' as const,
      color: '#0F2A44',
    },
    subheading: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: '#0F2A44',
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      color: '#0F2A44',
    },
    label: {
      fontSize: 12,
      fontWeight: '500' as const,
      color: '#8A93A0',
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      color: '#8A93A0',
    },
    amount: {
      fontSize: 40,
      fontWeight: '700' as const,
      color: '#0F2A44',
    },
  },
};

export type Theme = typeof theme;
