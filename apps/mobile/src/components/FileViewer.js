import { useEffect, useState } from 'react'
import { Image, ScrollView, StyleSheet, View } from 'react-native'
import { createContentTicket } from '@bridgit/shared-client'
import { API_BASE_URL } from '../api/config'
import { useSession } from '../auth/SessionContext'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { Button, Hint } from './SettingsParts'
import Spinner from './Spinner'
import { errorMessage } from '../api/errorMessage'
import { openWith } from '../hub/openWith'

const MAX_TEXT_CHARS = 200000

function absoluteUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url}`
}

// Very long text is cut so the phone stays responsive; the full file can still open in another app.
function TextBody({ url, onOpenExternally, opening }) {
  const { theme } = useMobileTheme()
  const [state, setState] = useState({ status: 'loading', text: '', truncated: false })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', text: '', truncated: false })

    fetch(absoluteUrl(url))
      .then((response) => {
        if (!response.ok) throw new Error('falha')
        return response.text()
      })
      .then((text) => active && setState({
        status: 'ready',
        text: text.slice(0, MAX_TEXT_CHARS),
        truncated: text.length > MAX_TEXT_CHARS,
      }))
      .catch(() => active && setState({ status: 'error', text: '', truncated: false }))

    return () => {
      active = false
    }
  }, [url])

  if (state.status === 'loading') {
    return (
      <View style={styles.loading}>
        <Spinner />
      </View>
    )
  }
  if (state.status === 'error') return <Hint>Não foi possível carregar o texto.</Hint>

  return (
    <View style={styles.textBlock}>
      {state.truncated ? (
        <View style={styles.truncated}>
          <Hint>Mostrando só o início do arquivo. Abra em outro app para ver tudo.</Hint>
          <Button label={opening ? 'Aguarde…' : 'Abrir em outro app'} disabled={opening} onPress={onOpenExternally} />
        </View>
      ) : null}
      {/* Padding goes on the content, not the ScrollView itself, or Android clips the last line. */}
      <ScrollView
        style={[styles.text, { borderColor: theme.colors.line }]}
        contentContainerStyle={styles.textContent}
        nestedScrollEnabled
      >
        <AppText style={styles.textBody}>{state.text}</AppText>
      </ScrollView>
    </View>
  )
}

// The image itself downloads after the file details arrive, so it needs its own loading and error state.
function ImageBody({ url, name }) {
  const { theme } = useMobileTheme()
  const [state, setState] = useState('loading')

  useEffect(() => {
    setState('loading')
  }, [url])

  return (
    <View style={[styles.frame, { backgroundColor: theme.colors.wash }]}>
      <Image
        accessibilityLabel={name}
        source={{ uri: absoluteUrl(url) }}
        resizeMode="contain"
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        style={styles.imageFill}
      />
      {state !== 'ready' ? (
        <View pointerEvents="none" style={styles.overlay}>
          {state === 'loading' ? <Spinner /> : <Hint>Não foi possível carregar a imagem.</Hint>}
        </View>
      ) : null}
    </View>
  )
}

// Shows the file by read mode. Images and text render in the app; PDF, video, audio and files without
// a preview are downloaded and handed to another app through the system "Abrir com…".
export default function FileViewer({ providerId, file, source }) {
  const { token } = useSession()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const mode = source?.mode ?? 'none'
  const url = source?.url ?? null

  async function openExternally() {
    setOpening(true)
    setError('')
    try {
      // A fresh ticket: the one in `source` may have expired (5 min) while the screen stayed open.
      const ticket = await createContentTicket(token, providerId, file.ref, 'attachment')
      if (!ticket?.url) throw new Error('Arquivo indisponível.')
      await openWith({ url: absoluteUrl(ticket.url), name: file.name, mimeType: file.mimeType })
    } catch (openError) {
      setError(errorMessage(openError, 'Não foi possível abrir o arquivo.'))
    } finally {
      setOpening(false)
    }
  }

  if (mode === 'image' && url) return <ImageBody url={url} name={file.name} />


  if (mode === 'text' && url) {
    return (
      <>
        <TextBody url={url} onOpenExternally={openExternally} opening={opening} />
        {error ? <Hint>{error}</Hint> : null}
      </>
    )
  }

  const label = 'Abrir com…'
  return (
    <View style={styles.external}>
      {mode === 'none' ? <Hint>Sem pré-visualização para este tipo de arquivo.</Hint> : null}
      {error ? <Hint>{error}</Hint> : null}
      <Button label={opening ? 'Aguarde…' : label} variant="solid" disabled={opening} onPress={openExternally} />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: 420,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  textBlock: {
    alignSelf: 'stretch',
    gap: 12,
  },
  truncated: {
    alignItems: 'flex-start',
    gap: 8,
  },
  text: {
    alignSelf: 'stretch',
    maxHeight: 460,
    borderWidth: 1,
    borderRadius: 8,
  },
  textContent: {
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
