import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as NavigationBar from 'expo-navigation-bar'
import { NavigationContainer } from '@react-navigation/native'
import WelcomeScreen from './src/screens/WelcomeScreen'
import { theme } from './src/theme/tokens'
import { MobileThemeProvider, useMobileTheme, useThemedStyles } from './src/theme/ThemeProvider'

function ThemedAppRoot() {
  styles = useThemedStyles(createStyles)
  const { navigationTheme, statusBarStyle, isDark } = useMobileTheme()

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined

    async function syncNavigationBar() {
      try {
        await NavigationBar.setBackgroundColorAsync(isDark ? '#000000' : '#ffffff')
        await NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark')
      } catch {
        // Expo Go / unsupported hosts can ignore navigation bar APIs.
      }
    }

    syncNavigationBar()
  }, [isDark])

  return (
    <View style={[Platform.OS === 'web' ? styles.webFullscreen : styles.nativeRoot, styles.fullscreenAuth]}>
      <View style={[Platform.OS === 'web' ? styles.webFullscreenDevice : styles.nativeRoot, styles.fullscreenAuth]}>
        <SafeAreaProvider>
          <StatusBar style={statusBarStyle} translucent backgroundColor="transparent" />
          <NavigationContainer theme={navigationTheme}>
            <WelcomeScreen />
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </View>
  )
}

export default function App() {
  return (
    <MobileThemeProvider>
      <ThemedAppRoot />
    </MobileThemeProvider>
  )
}

const createStyles = (theme) => StyleSheet.create({
  nativeRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100dvh' } : null),
  },
  fullscreenAuth: {
    backgroundColor: theme.colors.appBg,
  },
  webFullscreen: {
    flex: 1,
    width: '100%',
    height: '100dvh',
    minHeight: '100dvh',
    backgroundColor: theme.colors.appBg,
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }
      : null),
  },
  webFullscreenDevice: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: '100dvh',
    backgroundColor: theme.colors.appBg,
  },
})

let styles = createStyles(theme)
