import { useEffect, useRef } from 'react'
import {
  Alert,
  Animated,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { theme } from '../theme/tokens'
import { useMobileTheme, useThemedStyles } from '../theme/ThemeProvider'

const WELCOME_BACKGROUND = require('../../assets/images/welcome-background.jpg')
const WELCOME_SUBTITLE = 'Acompanhe tarefas e conversas sem perder o ritmo.'

function notify(message) {
  if (Platform.OS === 'web') {
    window.alert(message)
    return
  }
  Alert.alert('Bridgit', message)
}

function GoogleGlyph({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92Z"
      />
      <Path
        fill="#FF3D00"
        d="m6.3 14.69 6.57 4.82C14.65 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.3 14.69Z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.1 26.71 36 24 36c-5.2 0-9.62-3.31-11.29-7.94l-6.52 5.02C9.51 39.56 16.24 44 24 44Z"
      />
      <Path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92Z"
      />
    </Svg>
  )
}

function WelcomeFadeBand({ isDark }) {
  const channel = isDark ? '0, 0, 0' : '255, 255, 255'
  return (
    <View style={styles.welcomeFade} pointerEvents="none">
      {Array.from({ length: 18 }, (_, index) => (
        <View
          key={`welcome-fade-${index}`}
          style={[styles.welcomeFadeStep, { backgroundColor: `rgba(${channel}, ${index / 17})` }]}
        />
      ))}
    </View>
  )
}

function SocialRow({ onGoogle, onSoon, iconColor }) {
  return (
    <View style={styles.socialRow}>
      <Pressable
        style={styles.welcomeSocialButton}
        onPress={onGoogle}
        accessibilityRole="button"
        accessibilityLabel="Continuar com o Google"
      >
        <GoogleGlyph size={22} />
      </Pressable>

      <Pressable
        style={styles.welcomeSocialButton}
        onPress={onSoon}
        accessibilityRole="button"
        accessibilityLabel="Continuar com a Apple"
      >
        <Svg width={22} height={22} viewBox="0 0 16 16">
          <Path
            fill={iconColor}
            d="M11.18.01c-.03-.04-1.26.02-2.32 1.17-1.07 1.16-.9 2.48-.88 2.52.02.03 1.52.09 2.47-1.26.96-1.35.76-2.39.73-2.43Zm3.32 11.73c-.05-.1-2.33-1.23-2.11-3.42.21-2.19 1.67-2.79 1.69-2.86.03-.06-.59-.79-1.25-1.15a3.7 3.7 0 0 0-1.56-.44c-.11 0-.48-.09-1.25.12-.51.14-1.65.59-1.97.61-.32.02-1.26-.52-2.27-.67-.64-.12-1.33.13-1.82.33-.49.19-1.42.75-2.07 2.23-.66 1.49-.31 3.83-.07 4.56.24.73.62 1.93 1.27 2.8.58.98 1.34 1.67 1.66 1.9.32.23 1.22.39 1.84.07.5-.31 1.41-.49 1.77-.47.36.01 1.06.15 1.78.54.57.19 1.11.11 1.65-.11.55-.22 1.33-1.06 2.24-2.76.35-.79.51-1.22.47-1.28Z"
          />
        </Svg>
      </Pressable>

      <Pressable
        style={styles.welcomeSocialButton}
        onPress={onSoon}
        accessibilityRole="button"
        accessibilityLabel="Continuar com o telefone"
      >
        <Svg width={20} height={20} viewBox="0 0 16 16">
          <Path
            fill={iconColor}
            d="M3.65 1.33a.68.68 0 0 0-1.01-.06L1.61 2.3C1.12 2.78.94 3.47 1.15 4.07a17.6 17.6 0 0 0 4.17 6.61 17.6 17.6 0 0 0 6.61 4.17c.6.21 1.29.03 1.77-.45l1.03-1.04a.68.68 0 0 0-.06-1.01l-2.3-1.8a.68.68 0 0 0-.58-.12l-2.2.55a1.75 1.75 0 0 1-1.65-.46L5.48 8.06a1.75 1.75 0 0 1-.46-1.65l.55-2.2a.68.68 0 0 0-.12-.58L3.65 1.33Z"
          />
        </Svg>
      </Pressable>
    </View>
  )
}

export default function WelcomeScreen() {
  styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { isDark, theme: activeTheme } = useMobileTheme()

  const panelOpacity = useRef(new Animated.Value(0)).current
  const panelTranslateY = useRef(new Animated.Value(28)).current
  const brandOpacity = useRef(new Animated.Value(0)).current
  const actionsOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    panelOpacity.setValue(0)
    panelTranslateY.setValue(28)
    brandOpacity.setValue(0)
    actionsOpacity.setValue(0)

    Animated.sequence([
      Animated.parallel([
        Animated.timing(panelOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(panelTranslateY, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]),
      Animated.timing(brandOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(actionsOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start()
  }, [actionsOpacity, brandOpacity, panelOpacity, panelTranslateY])

  const soon = () => {
    notify('Em breve')
  }

  const bottomPad = Math.max(insets.bottom, 20)

  return (
    <View style={styles.welcomeRoot}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ImageBackground
        source={WELCOME_BACKGROUND}
        style={styles.welcomeScreen}
        imageStyle={styles.welcomeBackgroundImage}
        resizeMode="cover"
      >
        <View style={styles.welcomeImageSpacer} />

        <Animated.View
          style={[
            styles.welcomeBottom,
            {
              opacity: panelOpacity,
              transform: [{ translateY: panelTranslateY }],
            },
          ]}
        >
          <WelcomeFadeBand isDark={isDark} />
          <View style={[styles.welcomePanel, { paddingBottom: bottomPad }]}>
            <Animated.View
              collapsable={false}
              style={[styles.welcomeBrand, { opacity: brandOpacity }]}
            >
              <Text
                style={styles.welcomeTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                Bridgit
              </Text>
              <Text style={styles.welcomeSubtitle}>{WELCOME_SUBTITLE}</Text>
            </Animated.View>

            <Animated.View style={[styles.welcomeActions, { opacity: actionsOpacity }]}>
              <Pressable
                style={styles.welcomePrimaryButton}
                onPress={soon}
                accessibilityRole="button"
                accessibilityLabel="Cadastrar-se"
              >
                <Text style={styles.welcomePrimaryButtonText}>Cadastrar-se</Text>
              </Pressable>

              <View style={styles.welcomeDividerRow}>
                <View style={styles.welcomeDividerLine} />
                <Text style={styles.welcomeDividerText}>ou</Text>
                <View style={styles.welcomeDividerLine} />
              </View>

              <SocialRow
                onGoogle={soon}
                onSoon={soon}
                iconColor={activeTheme.colors.text1}
              />

              <Text style={styles.welcomeLegal}>
                Ao continuar, você concorda com os{' '}
                <Text style={styles.welcomeLegalLink} onPress={soon}>
                  Termos de uso
                </Text>
                {' '}e a{' '}
                <Text style={styles.welcomeLegalLink} onPress={soon}>
                  Política de privacidade
                </Text>
                .
              </Text>
            </Animated.View>
          </View>
        </Animated.View>
      </ImageBackground>
    </View>
  )
}

const createStyles = (theme) => StyleSheet.create({
  welcomeRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { minHeight: '100dvh' } : null),
  },
  welcomeScreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { minHeight: '100dvh' } : null),
  },
  welcomeBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  welcomeImageSpacer: {
    flex: 1,
  },
  welcomeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
  },
  welcomeFade: {
    height: 72,
    width: '100%',
  },
  welcomeFadeStep: {
    flex: 1,
    width: '100%',
  },
  welcomePanel: {
    backgroundColor: theme.colors.appBg,
    paddingHorizontal: 28,
    paddingTop: 8,
    width: '100%',
  },
  welcomeBrand: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    marginBottom: 36,
    gap: 10,
  },
  welcomeTitle: {
    alignSelf: 'stretch',
    color: theme.colors.text1,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  welcomeSubtitle: {
    color: theme.colors.text2,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    maxWidth: 300,
  },
  welcomeActions: {
    gap: 22,
  },
  welcomePrimaryButton: {
    width: '100%',
    height: 54,
    borderRadius: 999,
    backgroundColor: theme.colors.text1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomePrimaryButtonDisabled: {
    opacity: 0.7,
  },
  welcomePrimaryButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  continueAccountButton: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
  },
  continueAvatarWrap: {
    width: 36,
    height: 36,
  },
  continueAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.textInverse,
  },
  continueAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.textInverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueAvatarInitials: {
    color: theme.colors.text1,
    fontSize: 12,
    fontWeight: '700',
  },
  continueGoogleBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.text1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.text1,
  },
  continueAccountText: {
    flex: 1,
    gap: 1,
    paddingRight: 4,
  },
  continueAccountTitle: {
    color: theme.colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  continueAccountEmail: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.72,
  },
  welcomeDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  welcomeDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border2,
  },
  welcomeDividerText: {
    color: theme.colors.text2,
    fontSize: 14,
    fontWeight: '500',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeSocialButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeLegal: {
    color: theme.colors.text3,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  welcomeLegalLink: {
    color: theme.colors.text1,
    textDecorationLine: 'underline',
  },
  oauthError: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
    borderRadius: 18,
    backgroundColor: theme.colors.dangerBgSoft,
  },
  oauthErrorText: {
    color: theme.colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  oauthErrorDismiss: {
    color: theme.colors.text1,
    fontSize: 12,
    fontWeight: '700',
  },
})

let styles = createStyles(theme)
