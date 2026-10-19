import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { easeOut, useNativeDriver } from '../theme/motion'
import ActionSheet, { useSheetKeyboard } from './ActionSheet'
import { Overlay } from './OverlayHost'
import { TextField } from './SettingsParts'
import { errorMessage } from '../api/errorMessage'

// The name field grows the sheet before its keyboard opens (see ActionSheet `prepare`). A tap counts
// too: after Android's back button hides the keyboard the field keeps its focus, so tapping it
// again brings the keyboard back without a new focus event.
export function NameField(props) {
  const sheetKeyboard = useSheetKeyboard()
  return <TextField {...props} onFocus={sheetKeyboard?.prepare} onPressIn={sheetKeyboard?.prepare} />
}

export function SheetButton({ label, onPress, variant = 'plain', disabled = false }) {
  const { theme } = useMobileTheme()
  const background = variant === 'solid'
    ? theme.colors.ink
    : variant === 'danger'
      ? theme.colors.danger
      : theme.colors.raise
  const color = variant === 'plain' ? theme.colors.ink : theme.colors.paper
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 },
      ]}
    >
      <AppText weight="500" style={[styles.buttonLabel, { color }]}>{label}</AppText>
    </Pressable>
  )
}

// Name and confirm prompts, as bottom sheets like the rest of the app.
// dialog: { type: 'name' | 'confirm', title, message?, label?, initial?, suffix?, confirmLabel, danger?, onSubmit(value) }
// `suffix` (a file extension) is shown after the field and is not part of the value.
// onSubmit may return a promise; the sheet stays open and shows the error message if it rejects.
export default function ActionDialog({ dialog, onClose }) {
  const { theme } = useMobileTheme()
  // The sheet slides away after `dialog` is cleared, so it keeps drawing the last one meanwhile.
  const [shown, setShown] = useState(dialog)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dialog) return
    setShown(dialog)
    setValue(dialog.initial ?? '')
    setBusy(false)
    setError('')
  }, [dialog])

  const current = dialog ?? shown
  const needsName = current?.type === 'name'
  const invalid = needsName && !value.trim()
  const close = busy ? () => {} : onClose

  async function submit() {
    if (!dialog || busy || invalid) return
    setBusy(true)
    setError('')
    try {
      await dialog.onSubmit(needsName ? value.trim() : undefined)
      setBusy(false)
      onClose()
    } catch (submitError) {
      setError(errorMessage(submitError))
      setBusy(false)
    }
  }

  return (
    <ActionSheet open={Boolean(dialog)} onClose={close}>
      {current ? (
        <View style={styles.body}>
          <View style={styles.text}>
            <AppText weight="500" style={styles.title}>{current.title}</AppText>
            {current.message ? (
              <AppText style={[styles.message, { color: theme.colors.mute }]}>{current.message}</AppText>
            ) : null}
          </View>
          {needsName ? (
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <NameField label={current.label ?? 'Nome'} value={value} onChangeText={setValue} autoFocus />
              </View>
              {current.suffix ? (
                <AppText style={[styles.suffix, { color: theme.colors.mute }]}>{current.suffix}</AppText>
              ) : null}
            </View>
          ) : null}
          {error ? <AppText style={[styles.message, { color: theme.colors.danger }]}>{error}</AppText> : null}
          <View style={styles.actions}>
            <SheetButton label="Cancelar" onPress={onClose} disabled={busy} />
            <SheetButton
              label={busy ? 'Aguarde…' : current.confirmLabel}
              variant={current.danger ? 'danger' : 'solid'}
              disabled={busy || invalid}
              onPress={submit}
            />
          </View>
        </View>
      ) : null}
    </ActionSheet>
  )
}

const NOTICE_MS = 220

// Short message that drops in under the status bar, above every screen and sheet, in the theme's
// raised surface; the owner clears it after a few seconds.
export function Notice({ message }) {
  const insets = useSafeAreaInsets()
  const { theme, isDark } = useMobileTheme()
  // Keeps the last text while it slides out.
  const [shown, setShown] = useState(message)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (message) {
      setShown(message)
      Animated.timing(progress, { toValue: 1, duration: NOTICE_MS, easing: easeOut, useNativeDriver }).start()
      return
    }
    Animated.timing(progress, { toValue: 0, duration: NOTICE_MS, easing: easeOut, useNativeDriver }).start(({ finished }) => {
      if (finished) setShown('')
    })
  }, [message, progress])

  if (!shown) return null

  return (
    <Overlay>
      <Animated.View
        pointerEvents="none"
        accessibilityLiveRegion="polite"
        style={[
          styles.noticeWrap,
          {
            top: insets.top + 8,
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          },
        ]}
      >
        <View
          style={[
            styles.notice,
            {
              backgroundColor: theme.colors.overlay,
              borderColor: theme.colors.line,
              shadowOpacity: isDark ? 0.4 : 0.12,
            },
          ]}
        >
          <AppText style={[styles.noticeText, { color: theme.colors.ink }]}>{shown}</AppText>
        </View>
      </Animated.View>
    </Overlay>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 20,
    paddingHorizontal: 4,
  },
  text: {
    gap: 6,
  },
  title: {
    fontSize: 18,
    letterSpacing: -0.54,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  nameField: {
    flex: 1,
  },
  suffix: {
    fontSize: 15,
    paddingBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
  noticeWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  notice: {
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  noticeText: {
    fontSize: 13.5,
    lineHeight: 19,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
})
