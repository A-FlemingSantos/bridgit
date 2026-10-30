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

// Graphite: cool neutrals, one ink as the only accent, colour kept for status.
export const lightTheme = {
  name: 'light',
  isDark: false,
  colors: {
    ...colors,
    appBg: '#ffffff',
    paper: '#ffffff',
    hero: '#f5f5f6',
    wash: '#f5f5f6',
    raise: '#efeff1',
    line: '#e4e4e7',
    soft: '#3f3f46',
    mute: '#6b6b73',
    ink: '#18181b',
    // Layers, bottom to top. Canvas: paper, with wash (pressed) and raise (cards, press when pressed).
    press: '#e7e7ea',
    // Modal surfaces: bottom sheets and the side panel, with their own fills, pressed state and dividers.
    sheet: '#ffffff',
    sheetRaise: '#efeff1',
    sheetPress: '#e4e4e7',
    sheetLine: '#e4e4e7',
    // Popovers above everything: anchored menus and notices.
    overlay: '#ffffff',
    overlayPress: '#f1f1f3',
    overlayLine: '#e4e4e7',
    // Veil behind sheets and the side panel.
    scrim: 'rgba(9,9,11,0.40)',
    danger: '#b42318',
    ok: '#1f7a4d',
    warn: '#a15c07',
    // Auth screen: a touch off-white.
    landBg: '#fafafa',
    surface1: colors.white,
    surface2: '#f5f5f6',
    surface3: '#efeff1',
    text1: '#18181b',
    text2: '#6b6b73',
    text3: '#a1a1aa',
    border1: '#e4e4e7',
    border2: '#e4e4e7',
    focus: '#18181b',
    textInverse: colors.white,
    dangerBg: '#fdf3f2',
    dangerBgSoft: '#fef7f6',
    dangerBgSubtle: '#fffbfa',
    dangerBorder: '#f4d3cf',
    warningText: '#7a4505',
    warningBg: '#fdf6e7',
    warningBorder: '#f1ddb0',
  },
  ...baseTheme,
}

// Pure black is only the canvas; every layer above it is a lighter gray, sheets and popovers included.
export const darkTheme = {
  name: 'dark',
  isDark: true,
  colors: {
    ...colors,
    appBg: '#000000',
    paper: '#000000',
    hero: '#0f0f11',
    wash: '#0f0f11',
    raise: '#141416',
    line: '#222225',
    soft: '#c2c2c8',
    mute: '#8a8a92',
    ink: '#ededef',
    press: '#1f1f23',
    sheet: '#1c1c1f',
    sheetRaise: '#2a2a2e',
    sheetPress: '#35353a',
    sheetLine: '#2e2e33',
    overlay: '#26262a',
    overlayPress: '#313136',
    overlayLine: '#36363b',
    scrim: 'rgba(0,0,0,0.60)',
    danger: '#f2867b',
    ok: '#5cc08c',
    warn: '#e0a94a',
    landBg: '#000000',
    surface1: '#000000',
    surface2: '#0f0f11',
    surface3: '#141416',
    text1: '#ededef',
    text2: '#8a8a92',
    text3: '#5a5a62',
    border1: '#222225',
    border2: '#2a2a2e',
    focus: '#ededef',
    textInverse: colors.black,
    dangerBg: 'rgba(242,134,123,.12)',
    dangerBgSoft: 'rgba(242,134,123,.12)',
    dangerBgSubtle: 'rgba(242,134,123,.08)',
    dangerBorder: 'rgba(242,134,123,.24)',
    warningText: '#e0a94a',
    warningBg: 'rgba(224,169,74,.12)',
    warningBorder: 'rgba(224,169,74,.26)',
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
