export const colors = {
  white: '#ffffff',
  black: '#000000',
  green: '#0f703a',
  purple: '#d4aef1',
  blue: '#4290da',
  red: '#ff6766',
  amber: '#f5a623',
  gray50: '#fafafa',
  gray100: '#f4f4f4',
  gray200: '#e8e8e8',
  gray300: '#d0d0d0',
  gray400: '#a0a0a0',
  gray600: '#555555',
  gray700: '#333333',
  gray800: '#222222',
}

const baseTheme = {
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 22,
    card: 18,
    pill: 999,
  },
  spacing: {
    screenX: 20,
    section: 26,
    gutter: 14,
  },
  type: {
    display: { fontSize: 29, lineHeight: 34, fontWeight: '600', letterSpacing: -0.6 },
    title: { fontSize: 21, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4 },
    heading: { fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.2 },
    section: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: -0.1 },
    body: { fontSize: 15, lineHeight: 21, fontWeight: '400', letterSpacing: -0.1 },
    meta: { fontSize: 12.5, lineHeight: 17, fontWeight: '400', letterSpacing: 0 },
    eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.2 },
  },
}

export const lightTheme = {
  name: 'light',
  isDark: false,
  colors: {
    ...colors,
    appBg: colors.white,
    surface1: colors.white,
    surface2: colors.gray50,
    surface3: colors.gray100,
    text1: colors.black,
    text2: colors.gray600,
    text3: colors.gray400,
    border1: colors.gray200,
    border2: colors.gray300,
    focus: colors.blue,
    textInverse: colors.white,
    dangerBg: '#fff0f0',
    dangerBgSoft: '#fff5f5',
    dangerBgSubtle: '#fffafa',
    dangerBorder: '#ffd3d3',
    warningText: '#7c4a03',
    warningBg: '#fff6e5',
    warningBorder: '#f0d7a1',
  },
  ...baseTheme,
}

export const darkTheme = {
  name: 'dark',
  isDark: true,
  colors: {
    ...colors,
    appBg: colors.black,
    surface1: '#0d0d0d',
    surface2: '#121212',
    surface3: '#1a1a1a',
    text1: colors.white,
    text2: colors.gray300,
    text3: colors.gray400,
    border1: colors.gray800,
    border2: '#2a2a2a',
    focus: colors.blue,
    textInverse: colors.black,
    dangerBg: 'rgba(255,103,102,.14)',
    dangerBgSoft: 'rgba(255,103,102,.14)',
    dangerBgSubtle: 'rgba(255,103,102,.10)',
    dangerBorder: 'rgba(255,103,102,.26)',
    warningText: colors.amber,
    warningBg: 'rgba(245,166,35,.14)',
    warningBorder: 'rgba(245,166,35,.30)',
  },
  ...baseTheme,
}

export const theme = {
  ...lightTheme,
  colors: { ...lightTheme.colors },
}

export function applyTheme(nextTheme) {
  theme.name = nextTheme.name
  theme.isDark = nextTheme.isDark
  theme.colors = nextTheme.colors
  theme.radius = nextTheme.radius
  theme.spacing = nextTheme.spacing
}

export function normalizeThemePreference(value) {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system'
}
