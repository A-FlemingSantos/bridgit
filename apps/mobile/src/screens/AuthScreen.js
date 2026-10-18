import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, Eye, EyeOff } from 'lucide-react-native'
import { useSession } from '../auth/SessionContext'
import { BrandMark } from '../components/PixelIcons'
import AppText, { fontFamilyFor } from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { easeOut, useNativeDriver } from '../theme/motion'
import { errorMessage } from '../api/errorMessage'

// The web login sets labels, links and the button in a monospace face.
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' })

function useRise(delay) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(12)).current
  return {
    style: { opacity, transform: [{ translateY }] },
    play: () => {
      opacity.setValue(0)
      translateY.setValue(12)
      return Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 600, delay, easing: easeOut, useNativeDriver }),
        Animated.timing(translateY, { toValue: 0, duration: 600, delay, easing: easeOut, useNativeDriver }),
      ])
    },
  }
}

function Field({ label, value, onChangeText, secure = false, revealed = false, onToggleReveal, autoComplete, disabled }) {
  const { theme, fontsReady } = useMobileTheme()
  const [focused, setFocused] = useState(false)
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
          editable={!disabled}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              color: theme.colors.ink,
              borderBottomColor: focused ? theme.colors.ink : theme.colors.line,
              fontFamily: fontsReady ? fontFamilyFor('400') : undefined,
              letterSpacing: hidden ? 3 : -0.15,
              paddingRight: onToggleReveal ? 28 : 0,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        />
        {onToggleReveal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={onToggleReveal}
            hitSlop={10}
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

export default function AuthScreen() {
  const { theme } = useMobileTheme()
  const insets = useSafeAreaInsets()
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login: signIn, register: signUp } = useSession()
  const year = new Date().getFullYear()

  const hello = useRise(0)
  const title = useRise(60)
  const lead = useRise(120)
  const fields = useRise(180)

  useEffect(() => {
    Animated.parallel([hello.play(), title.play(), lead.play(), fields.play()]).start()
    // Replays when the mode switches, like the web page entering again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register])

  function switchMode() {
    setRegister((current) => !current)
    setError('')
    setRevealed(false)
  }

  async function submit() {
    if (submitting) return
    if (!username.trim() || !password || (register && !confirm)) {
      setError('Preencha os campos obrigatórios.')
      return
    }
    // Same rules as the API, so the user gets them here in Portuguese instead of a server validation error.
    if (register && !/^[A-Za-z0-9._-]{3,32}$/.test(username.trim())) {
      setError('O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.')
      return
    }
    if (register && password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (register && password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      if (register) await signUp({ username: username.trim(), password })
      else await signIn({ username: username.trim(), password })
    } catch (requestError) {
      setError(errorMessage(requestError, 'Não foi possível entrar. Tente novamente.'))
      setSubmitting(false)
    }
  }

  const submitLabel = register ? 'Criar conta' : 'Entrar'

  return (
    <KeyboardAvoidingView
      // Android leaves the window still too (keyboard mode "resize" with edge to edge).
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      style={[styles.page, { backgroundColor: theme.colors.landBg }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.shell,
          { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
      >
        <View style={styles.bar}>
          <View accessibilityLabel="Bridgit" accessibilityRole="image">
            <BrandMark size={28} color={theme.colors.ink} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={register ? 'Entrar' : 'Criar conta'} onPress={switchMode} hitSlop={10}>
            <AppText style={[styles.mono, styles.switch, { color: theme.colors.mute }]}>
              {register ? 'ENTRAR' : 'CRIAR CONTA'}
            </AppText>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Animated.View style={hello.style}>
            <AppText style={[styles.hello, { color: theme.colors.mute }]}>
              {register ? 'Bem-vindo ao Bridgit.' : 'Bem-vindo de volta.'}
            </AppText>
          </Animated.View>
          <Animated.View style={title.style}>
            <AppText weight="500" style={styles.title}>{register ? 'Cadastro' : 'Entrar'}</AppText>
          </Animated.View>
          <Animated.View style={lead.style}>
            <AppText style={[styles.lead, { color: theme.colors.mute }]}>
              {register
                ? 'Um usuário e uma senha para reunir OneDrive, Google Drive e Dropbox.'
                : 'Suas três nuvens, atrás de um único usuário e senha.'}
            </AppText>
          </Animated.View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={[styles.error, { borderLeftColor: theme.colors.ink, backgroundColor: theme.colors.raise }]}
            >
              <AppText style={styles.errorText}>{error}</AppText>
            </View>
          ) : null}

          <Animated.View style={[styles.fields, fields.style]}>
            <Field label="USUÁRIO" value={username} onChangeText={setUsername} autoComplete="username" disabled={submitting} />
            <Field
              label="SENHA"
              value={password}
              onChangeText={setPassword}
              secure
              revealed={revealed}
              onToggleReveal={() => setRevealed((current) => !current)}
              autoComplete={register ? 'password-new' : 'password'}
              disabled={submitting}
            />
            {register ? (
              <Field
                label="CONFIRMAR SENHA"
                value={confirm}
                onChangeText={setConfirm}
                secure
                revealed={revealed}
                autoComplete="password-new"
                disabled={submitting}
              />
            ) : (
              <View style={styles.meta}>
                <Pressable accessibilityRole="button" hitSlop={8}>
                  <AppText style={[styles.mono, styles.metaLabel, { color: theme.colors.mute }]}>Esqueceu?</AppText>
                </Pressable>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              accessibilityState={{ disabled: submitting }}
              onPress={submit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submit,
                { backgroundColor: theme.colors.ink, opacity: submitting ? 0.6 : pressed ? 0.86 : 1 },
              ]}
            >
              <AppText style={[styles.mono, styles.submitLabel, { color: theme.colors.landBg }]}>
                {submitting ? 'AGUARDE' : submitLabel.toUpperCase()}
              </AppText>
              <ArrowRight size={14} strokeWidth={1.8} color={theme.colors.landBg} />
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.legal, { borderTopColor: theme.colors.line }]}>
          <AppText style={[styles.mono, styles.legalText, { color: theme.colors.mute }]}>© {year} Bridgit</AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  shell: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mono: {
    fontFamily: MONO,
  },
  switch: {
    fontSize: 12,
    letterSpacing: 0.72,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  hello: {
    marginBottom: 10,
    fontSize: 17,
    letterSpacing: -0.34,
  },
  title: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.33,
  },
  lead: {
    marginTop: 16,
    fontSize: 14.5,
    lineHeight: 23,
  },
  error: {
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  fields: {
    marginTop: 36,
    gap: 26,
  },
  field: {
    gap: 8,
  },
  label: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 0.88,
  },
  input: {
    height: 40,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    fontSize: 15,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  reveal: {
    position: 'absolute',
    right: 0,
    bottom: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    marginTop: -6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  metaLabel: {
    fontSize: 11,
    letterSpacing: 0.44,
  },
  submit: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitLabel: {
    fontSize: 12,
    letterSpacing: 0.72,
  },
  legal: {
    paddingTop: 20,
    borderTopWidth: 1,
  },
  legalText: {
    fontSize: 11,
    letterSpacing: 0.44,
  },
})
