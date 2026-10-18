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

// Same palette as the web app (apps/web globals.css): warm paper, one ink, a raised wash.
export const lightTheme = {
  name: 'light',
  isDark: false,
  colors: {
    ...colors,
    appBg: '#ffffff',
    paper: '#ffffff',
    hero: '#f7f6f3',
    wash: '#f7f6f3',
    raise: '#efede8',
    line: '#e6e3dd',
    soft: '#3d3d3d',
    mute: '#6b6b6b',
    ink: '#141414',
    overlay: '#ffffff',
    danger: '#c43d3d',
    ok: '#2f9e6b',
    warn: '#c98a1b',
    // Auth screen, like the web login: a touch off-white.
    landBg: '#fafaf9',
    surface1: colors.white,
    surface2: '#f7f6f3',
    surface3: '#efede8',
    text1: '#141414',
    text2: '#6b6b6b',
    text3: colors.gray400,
    border1: '#e6e3dd',
    border2: '#e6e3dd',
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
    appBg: '#161616',
    paper: '#161616',
    hero: '#1c1c1c',
    wash: '#1c1c1c',
    raise: '#242424',
    line: '#2a2a2a',
    soft: '#c4c4c4',
    mute: '#929292',
    ink: '#ededed',
    overlay: '#1f1f1f',
    danger: '#f07a7a',
    ok: '#4cc38a',
    warn: '#e3a944',
    landBg: '#121212',
    surface1: '#161616',
    surface2: '#1c1c1c',
    surface3: '#242424',
    text1: '#ededed',
    text2: '#929292',
    text3: colors.gray400,
    border1: '#2a2a2a',
    border2: '#2a2a2a',
    focus: colors.blue,
    textInverse: colors.black,
    dangerBg: 'rgba(240,122,122,.14)',
    dangerBgSoft: 'rgba(240,122,122,.14)',
    dangerBgSubtle: 'rgba(240,122,122,.10)',
    dangerBorder: 'rgba(240,122,122,.26)',
    warningText: '#e3a944',
    warningBg: 'rgba(227,169,68,.14)',
    warningBorder: 'rgba(227,169,68,.30)',
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
  theme.type = nextTheme.type
}

// A background colour with zero alpha: transparent, while Android still reads its RGB to pick light
// or dark navigation bar buttons.
export function clearColor(hex) {
  return `${hex.slice(0, 7)}00`
}
