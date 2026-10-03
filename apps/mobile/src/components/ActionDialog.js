import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { Button, TextField } from './SettingsParts'

// dialog: { type: 'name' | 'confirm', title, message?, initial?, confirmLabel, danger?, onSubmit(value) }
// onSubmit may return a promise; the dialog stays open and shows the error message if it rejects.
export default function ActionDialog({ dialog, onClose }) {
  const { theme } = useMobileTheme()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setValue(dialog?.initial ?? '')
    setBusy(false)
    setError('')
  }, [dialog])

  if (!dialog) return null

  const needsName = dialog.type === 'name'
  const invalid = needsName && !value.trim()

  async function submit() {
    if (busy || invalid) return
    setBusy(true)
    setError('')
    try {
      await dialog.onSubmit(needsName ? value.trim() : undefined)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível concluir. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Fechar">
        <Pressable
          onPress={() => {}}
          style={[styles.card, { backgroundColor: theme.colors.paper, borderColor: theme.colors.line }]}
        >
          <AppText weight="500" style={styles.title}>{dialog.title}</AppText>
          {dialog.message ? (
            <AppText style={[styles.message, { color: theme.colors.mute }]}>{dialog.message}</AppText>
          ) : null}
          {needsName ? (
            <TextField label="Nome" value={value} onChangeText={setValue} autoFocus />
          ) : null}
          {error ? <AppText style={[styles.message, { color: theme.colors.red }]}>{error}</AppText> : null}
          <View style={styles.actions}>
            <Button label="Cancelar" onPress={onClose} disabled={busy} />
            <Button
              label={busy ? 'Aguarde…' : dialog.confirmLabel}
              variant={dialog.danger ? 'danger' : 'solid'}
              disabled={busy || invalid}
              onPress={submit}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// Short message pinned above the bottom edge; the owner clears it after a few seconds.
export function Notice({ message }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  if (!message) return null

  return (
    <View pointerEvents="none" style={[styles.noticeWrap, { bottom: Math.max(insets.bottom, 16) + 76 }]}>
      <View style={[styles.notice, { backgroundColor: theme.colors.ink }]}>
        <AppText style={[styles.noticeText, { color: theme.colors.paper }]}>{message}</AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.4,
  },
  message: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  noticeWrap: {
    position: 'absolute',
    left: 20,
    right: 96,
    zIndex: 30,
  },
  notice: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
})
