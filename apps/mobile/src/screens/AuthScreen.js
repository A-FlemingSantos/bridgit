import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Eye, EyeOff } from 'lucide-react-native'
import Svg, { Line, SvgXml } from 'react-native-svg'
import { atSign } from '../assets/marks'
import AppText, { fontFamilyFor } from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { easeOut, useNativeDriver } from '../theme/motion'
import { nextSvgPrefix, tintSvg, withSvgIds } from '../components/svgMarkup'

function AuthMark({ size }) {
  const { theme } = useMobileTheme()
  const prefix = useRef(nextSvgPrefix()).current
  const xml = tintSvg(withSvgIds(atSign, prefix), theme.colors.ink)
  if (size < 8) return null
  return <SvgXml xml={xml} width={size} height={size} />
}

function SubmitArrow() {
  const { theme } = useMobileTheme()
  const color = theme.colors.ink
  return (
    <Svg width={36} height={36} viewBox="0 0 48 48">
      <Line x1="8" y1="24" x2="40" y2="24" stroke={color} strokeWidth={2.6} strokeLinecap="square" />
      <Line x1="26" y1="10" x2="40" y2="24" stroke={color} strokeWidth={2.6} strokeLinecap="square" />
      <Line x1="26" y1="38" x2="40" y2="24" stroke={color} strokeWidth={2.6} strokeLinecap="square" />
    </Svg>
  )
}

function Field({
  label,
  value,
  onChangeText,
  secure = false,
  revealed = false,
  onToggleReveal,
  autoComplete,
}) {
  const { theme, isDark, fontsReady } = useMobileTheme()
  const [focused, setFocused] = useState(false)
  const idle = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(10,10,10,0.28)'
  const hidden = secure && !revealed

  return (
    <View style={styles.field}>
      <AppText style={[styles.label, { color: theme.colors.mute }]}>{label}</AppText>
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.colors.mute}
          style={[
            styles.input,
            {
              color: theme.colors.ink,
              borderBottomColor: focused ? theme.colors.ink : idle,
              fontFamily: fontsReady ? fontFamilyFor('400') : undefined,
              fontSize: hidden ? 17 : 15,
              letterSpacing: hidden ? 3.4 : -0.3,
            },
          ]}
        />
        {onToggleReveal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={onToggleReveal}
            hitSlop={8}
            style={styles.reveal}
          >
            {revealed ? (
              <EyeOff size={16} strokeWidth={1.6} color={theme.colors.mute} />
            ) : (
              <Eye size={16} strokeWidth={1.6} color={theme.colors.mute} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export default function AuthScreen({ navigation }) {
  const { theme, isDark } = useMobileTheme()
  const insets = useSafeAreaInsets()
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')
  const [band, setBand] = useState({ width: 0, height: 0 })

  const markOpacity = useRef(new Animated.Value(0)).current
  const markScale = useRef(new Animated.Value(0.86)).current
  const fieldsOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    markOpacity.setValue(0)
    markScale.setValue(0.86)
    fieldsOpacity.setValue(0)
    Animated.parallel([
      Animated.timing(markOpacity, {
        toValue: 1,
        duration: 700,
        easing: easeOut,
        useNativeDriver,
      }),
      Animated.timing(markScale, {
        toValue: 1,
        duration: 700,
        easing: easeOut,
        useNativeDriver,
      }),
      Animated.timing(fieldsOpacity, {
        toValue: 1,
        duration: 400,
        delay: 120,
        easing: easeOut,
        useNativeDriver,
      }),
    ]).start()
  }, [fieldsOpacity, markOpacity, markScale])

  const markSize = Math.min(280, band.width * 0.48, band.height * 0.48)
  const shellColor = isDark ? theme.colors.paper : theme.colors.hero
  const paneColor = isDark ? theme.colors.hero : theme.colors.paper

  function switchMode() {
    setRegister((current) => !current)
    setError('')
    setRevealed(false)
  }

  function submit() {
    if (!username.trim() || !password || (register && !confirm)) {
      setError('Preencha os campos obrigatórios.')
      return
    }
    if (register && password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
  }

  return (
    <View style={[styles.shell, { backgroundColor: shellColor }]}>
      <View
        style={styles.visual}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setBand({ width, height })
        }}
      >
        <Animated.View
          style={[
            styles.figure,
            { opacity: markOpacity, transform: [{ scale: markScale }] },
          ]}
        >
          <AuthMark size={markSize || 0} />
        </Animated.View>
        <AppText weight="500" style={[styles.brand, { top: insets.top + 16 }]}>
          Bridgit
        </AppText>
      </View>

      <View style={[styles.pane, { backgroundColor: paneColor, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={register ? 'Entrar' : 'Criar conta'}
          onPress={switchMode}
          style={styles.switch}
          hitSlop={8}
        >
          <AppText style={[styles.switchLabel, { color: theme.colors.mute }]}>
            {register ? 'Entrar' : 'Criar conta'}
          </AppText>
        </Pressable>

        <View style={styles.form}>
          <AppText weight="500" style={styles.title}>
            {register ? 'Cadastro' : 'Entrar'}
          </AppText>

          {error ? (
            <AppText style={[styles.error, { color: theme.colors.mute }]} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}

          <Animated.View style={{ opacity: fieldsOpacity, gap: 22 }}>
            <Field
              label="Usuário"
              value={username}
              onChangeText={setUsername}
              autoComplete="username"
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secure
              revealed={revealed}
              onToggleReveal={() => setRevealed((current) => !current)}
              autoComplete={register ? 'password-new' : 'password'}
            />
          </Animated.View>

          {register ? (
            <View style={styles.confirm}>
              <Field
                label="Confirmar senha"
                value={confirm}
                onChangeText={setConfirm}
                secure
                revealed={revealed}
                autoComplete="password-new"
              />
            </View>
          ) : (
            <View style={styles.meta}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                onPress={() => setRemember((current) => !current)}
                style={styles.remember}
              >
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: remember ? theme.colors.ink : theme.colors.mute,
                      backgroundColor: remember ? theme.colors.paper : 'transparent',
                    },
                  ]}
                >
                  {remember ? (
                    <View style={[styles.radioDot, { backgroundColor: theme.colors.ink }]} />
                  ) : null}
                </View>
                <AppText style={[styles.metaLabel, { color: theme.colors.mute }]}>Lembrar-me</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8}>
                <AppText style={[styles.metaLabel, { color: theme.colors.mute }]}>Esqueceu?</AppText>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={register ? 'Criar conta' : 'Entrar'}
          onPress={submit}
          style={[styles.submit, { bottom: Math.max(insets.bottom, 16) }]}
        >
          <SubmitArrow />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  visual: {
    flex: 1,
  },
  figure: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    position: 'absolute',
    left: 24,
    fontSize: 15,
    letterSpacing: -0.6,
  },
  pane: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  switch: {
    position: 'absolute',
    top: 28,
    right: 28,
    zIndex: 2,
  },
  switchLabel: {
    fontSize: 13,
    letterSpacing: -0.26,
  },
  form: {
    flex: 1,
    paddingTop: 36,
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -2.16,
    marginBottom: 28,
    paddingRight: 96,
  },
  error: {
    fontSize: 13,
    letterSpacing: -0.2,
    marginBottom: 16,
  },
  confirm: {
    marginTop: 22,
  },
  field: {
    gap: 10,
  },
  label: {
    fontSize: 12,
    letterSpacing: -0.12,
  },
  input: {
    height: 38,
    paddingTop: 6,
    paddingBottom: 12,
    paddingRight: 28,
    borderBottomWidth: 1,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  reveal: {
    position: 'absolute',
    right: 0,
    bottom: 10,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaLabel: {
    fontSize: 12,
    letterSpacing: -0.12,
  },
  submit: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
