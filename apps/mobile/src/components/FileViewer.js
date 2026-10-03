import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { createContentTicket } from '@bridgit/shared-client'
import { API_BASE_URL } from '../api/config'
import { useSession } from '../auth/SessionContext'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { Button, Hint } from './SettingsParts'

const MAX_TEXT_CHARS = 200000

function absoluteUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url}`
}

function TextBody({ url }) {
  const { theme } = useMobileTheme()
  const [state, setState] = useState({ status: 'loading', text: '' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', text: '' })

    fetch(absoluteUrl(url))
      .then((response) => {
        if (!response.ok) throw new Error('falha')
        return response.text()
      })
      .then((text) => active && setState({ status: 'ready', text: text.slice(0, MAX_TEXT_CHARS) }))
      .catch(() => active && setState({ status: 'error', text: '' }))

    return () => {
      active = false
    }
  }, [url])

  if (state.status === 'loading') return <ActivityIndicator color={theme.colors.mute} />
  if (state.status === 'error') return <Hint>Não foi possível carregar o texto.</Hint>

  return (
    <ScrollView style={[styles.text, { borderColor: theme.colors.line }]} nestedScrollEnabled>
      <AppText style={styles.textBody}>{state.text}</AppText>
    </ScrollView>
  )
}

// Shows the file by read mode. Images and text render in the app; PDF, video, audio and files without
// a preview open in the system through the same content URL, or a download ticket when there is none.
export default function FileViewer({ providerId, file, source }) {
  const { token } = useSession()
  const { theme } = useMobileTheme()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const mode = source?.mode ?? 'none'
  const url = source?.url ?? null

  async function openExternally() {
    setOpening(true)
    setError('')
    try {
      let target = url
      if (!target) {
        const ticket = await createContentTicket(token, providerId, file.ref, 'attachment')
        target = ticket?.url
      }
      if (!target) throw new Error('Arquivo indisponível.')
      await Linking.openURL(absoluteUrl(target))
    } catch (openError) {
      setError(openError?.message || 'Não foi possível abrir o arquivo.')
    } finally {
      setOpening(false)
    }
  }

  if (mode === 'image' && url) {
    return (
      <Image
        accessibilityLabel={file.name}
        source={{ uri: absoluteUrl(url) }}
        resizeMode="contain"
        style={[styles.image, { backgroundColor: theme.colors.wash }]}
      />
    )
  }

  if (mode === 'text' && url) return <TextBody url={url} />

  const label = mode === 'none' ? 'Baixar' : 'Abrir'
  return (
    <View style={styles.external}>
      {mode === 'none' ? <Hint>Sem pré-visualização para este tipo de arquivo.</Hint> : null}
      {error ? <Hint>{error}</Hint> : null}
      <Button label={opening ? 'Aguarde…' : label} variant="solid" disabled={opening} onPress={openExternally} />
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 420,
    borderRadius: 8,
  },
  text: {
    alignSelf: 'stretch',
    maxHeight: 460,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  textBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  external: {
    alignItems: 'center',
    gap: 12,
  },
})
