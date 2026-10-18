import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import AppText, { fontFamilyFor } from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

export function Hint({ children }) {
  const { theme } = useMobileTheme()
  return <AppText style={[styles.hint, { color: theme.colors.mute }]}>{children}</AppText>
}

// Botão de texto; variant: 'solid' | 'outline' | 'danger'.
export function Button({ label, onPress, variant = 'outline', disabled = false }) {
  const { theme } = useMobileTheme()
  const solid = variant === 'solid'
  const danger = variant === 'danger'
  const border = danger ? theme.colors.danger : theme.colors.line
  const textColor = solid ? theme.colors.paper : danger ? theme.colors.danger : theme.colors.ink

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

export function TextField({ label, value, onChangeText, secure = false, autoComplete, autoFocus = false, onFocus, onPressIn }) {
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
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onPressIn={onPressIn}
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

const styles = StyleSheet.create({
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
})
