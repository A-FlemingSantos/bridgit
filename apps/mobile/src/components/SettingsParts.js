import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import AppText, { fontFamilyFor } from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

export function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <AppText weight="500" style={styles.sectionTitle}>{title}</AppText>
      {children}
    </View>
  )
}

export function Hint({ children }) {
  const { theme } = useMobileTheme()
  return <AppText style={[styles.hint, { color: theme.colors.mute }]}>{children}</AppText>
}

// Botão de texto; variant: 'solid' | 'outline' | 'danger'.
export function Button({ label, onPress, variant = 'outline', disabled = false }) {
  const { theme } = useMobileTheme()
  const solid = variant === 'solid'
  const danger = variant === 'danger'
  const border = danger ? theme.colors.red : theme.colors.line
  const textColor = solid ? theme.colors.paper : danger ? theme.colors.red : theme.colors.ink

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        solid ? { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink } : { borderColor: border },
        disabled ? styles.disabled : null,
      ]}
    >
      <AppText weight="500" style={[styles.buttonLabel, { color: textColor }]}>{label}</AppText>
    </Pressable>
  )
}

// Confirmação inline (Alert não funciona no web).
export function ConfirmPanel({ prompt, confirmLabel, onConfirm, onCancel }) {
  const { theme } = useMobileTheme()

  return (
    <View style={[styles.confirm, { borderColor: theme.colors.line }]}>
      <AppText style={styles.confirmText}>{prompt}</AppText>
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={onCancel} />
        <Button label={confirmLabel} variant="danger" onPress={onConfirm} />
      </View>
    </View>
  )
}

// Botão que se troca pelo painel de confirmação ao ser tocado.
export function ConfirmButton({ label, prompt, confirmLabel, onConfirm, variant = 'outline' }) {
  const [asking, setAsking] = useState(false)

  if (!asking) return <Button label={label} variant={variant} onPress={() => setAsking(true)} />

  return (
    <ConfirmPanel
      prompt={prompt}
      confirmLabel={confirmLabel}
      onCancel={() => setAsking(false)}
      onConfirm={() => {
        setAsking(false)
        onConfirm()
      }}
    />
  )
}

// Linha com título, dica e um controle à direita.
export function PrefRow({ title, hint, children }) {
  return (
    <View style={styles.pref}>
      <View style={styles.prefBody}>
        <AppText weight="500" style={styles.prefTitle}>{title}</AppText>
        {hint ? <Hint>{hint}</Hint> : null}
      </View>
      {children}
    </View>
  )
}

export function Switch({ label, value, onChange }) {
  const { theme } = useMobileTheme()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, { backgroundColor: value ? theme.colors.ink : theme.colors.line }]}
    >
      <View style={[styles.thumb, { backgroundColor: theme.colors.paper }, value ? styles.thumbOn : null]} />
    </Pressable>
  )
}

export function TextField({ label, value, onChangeText, secure = false, autoComplete, autoFocus = false }) {
  const { theme, fontsReady } = useMobileTheme()
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.field}>
      <AppText style={[styles.hint, { color: theme.colors.mute }]}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: theme.colors.ink,
            borderBottomColor: focused ? theme.colors.ink : theme.colors.line,
            fontFamily: fontsReady ? fontFamilyFor('400') : undefined,
          },
        ]}
      />
    </View>
  )
}

export function Divider() {
  const { theme } = useMobileTheme()
  return <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: -0.42,
  },
  hint: {
    fontSize: 12,
    letterSpacing: -0.12,
  },
  button: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  buttonLabel: {
    fontSize: 13,
    letterSpacing: -0.26,
  },
  disabled: {
    opacity: 0.4,
  },
  confirm: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  confirmText: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  pref: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prefBody: {
    flex: 1,
    gap: 2,
  },
  prefTitle: {
    fontSize: 13,
    letterSpacing: -0.39,
  },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  field: {
    gap: 6,
  },
  input: {
    height: 38,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    fontSize: 15,
    letterSpacing: -0.3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
})
