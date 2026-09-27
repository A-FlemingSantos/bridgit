import { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { applyTheme, darkTheme, lightTheme } from './tokens'

const MobileThemeContext = createContext(null)

function buildNavigationTheme(activeTheme) {
  return {
    dark: activeTheme.isDark,
    colors: {
      primary: activeTheme.colors.text1,
      background: activeTheme.colors.appBg,
      card: activeTheme.colors.surface1,
      text: activeTheme.colors.text1,
      border: activeTheme.colors.border1,
      notification: activeTheme.colors.red,
    },
    fonts: {
      regular: { fontFamily: undefined, fontWeight: '400' },
      medium: { fontFamily: undefined, fontWeight: '500' },
      bold: { fontFamily: undefined, fontWeight: '700' },
      heavy: { fontFamily: undefined, fontWeight: '800' },
    },
  }
}

export function MobileThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const activeTheme = systemScheme === 'dark' ? darkTheme : lightTheme
  applyTheme(activeTheme)

  const value = useMemo(() => ({
    theme: activeTheme,
    isDark: activeTheme.isDark,
    navigationTheme: buildNavigationTheme(activeTheme),
    statusBarStyle: activeTheme.isDark ? 'light' : 'dark',
  }), [activeTheme])

  return (
    <MobileThemeContext.Provider value={value}>
      {children}
    </MobileThemeContext.Provider>
  )
}

export function useMobileTheme() {
  const context = useContext(MobileThemeContext)
  if (!context) {
    throw new Error('useMobileTheme must be used within MobileThemeProvider')
  }
  return context
}

export function useThemedStyles(createStyles) {
  const activeTheme = useMobileTheme().theme
  return useMemo(() => createStyles(activeTheme), [activeTheme, createStyles])
}
