import { useEffect, useRef, useState } from 'react'
import { Share, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { errorMessage } from '../api/errorMessage'
import { useHub } from '../hub/HubContext'
import {
  ADDRESS_PREFIX,
  addressSuffix,
  aliasPreview,
  checkAliasDraft,
  linkErrorMessage,
  linkExplanation,
  linkTitle,
} from '../hub/publicLinkSheet'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import ActionSheet from './ActionSheet'
import { NameField, SheetButton } from './SheetControls'
import Spinner from './Spinner'

const COPIED_MS = 2000

// The link of a file or folder: creates it, shows its address to copy or share, edits its apelido
// and turns it off. `dialog` is { providerId, ref, name, kind }; a new object loads that item's link.
export default function PublicLinkSheet({ dialog, onClose }) {
  const { theme } = useMobileTheme()
  const hub = useHub()
  const hubRef = useRef(hub)
  hubRef.current = hub
  // The sheet slides away after `dialog` is cleared, so it keeps drawing the last one meanwhile.
  const [shown, setShown] = useState(dialog)
  // 'loading' | 'ready' | 'error'; `link` is null while the item has none.
  const [status, setStatus] = useState('loading')
  const [link, setLink] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const copiedTimer = useRef(null)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  useEffect(() => {
    if (dialog) setShown(dialog)
  }, [dialog])

  const providerId = dialog?.providerId
  const ref = dialog?.ref

  // Every opening is a new `dialog` object, so reopening the same item loads its link again.
  useEffect(() => {
    if (!dialog) return undefined
    let cancelled = false
    setStatus('loading')
    setLink(null)
    setDraft('')
    setBusy(null)
    setConfirming(false)
    setCopied(false)
    setError('')
    hubRef.current.getPublicLink(dialog.providerId, dialog.ref).then(
      (loaded) => {
        if (cancelled) return
        const found = loaded?.url ? loaded : null
        setLink(found)
        setDraft(found?.alias ?? '')
        setStatus('ready')
      },
      (loadError) => {
        if (cancelled) return
        // An item without a link answers 404: it is not a failure.
        if (loadError?.code === 'LINK_NAO_ENCONTRADO') {
          setStatus('ready')
          return
        }
        setError(errorMessage(loadError))
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [dialog, attempt])

  const current = dialog ?? shown
  const kind = current?.kind === 'folder' ? 'folder' : 'file'
  const check = checkAliasDraft(draft, link?.alias)
  // The error of an untouched draft is not worth showing.
  const draftError = check.changed ? check.error : null
  const close = busy ? () => {} : onClose

  async function run(name, action) {
    if (busy) return
    setBusy(name)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(linkErrorMessage(actionError) ?? errorMessage(actionError))
    } finally {
      setBusy(null)
    }
  }

  const create = () => run('create', async () => {
    const created = await hub.publicLink(providerId, ref)
    setLink(created)
    setDraft(created?.alias ?? '')
  })

  const save = () => run('save', async () => {
    const updated = await hub.updatePublicLinkAlias(providerId, ref, check.alias)
    setLink(updated)
    setDraft(updated?.alias ?? check.alias)
  })

  const disable = () => run('disable', async () => {
    await hub.disablePublicLink(providerId, ref)
    setLink(null)
    setDraft('')
    setConfirming(false)
  })

  async function copy() {
    try {
      await Clipboard.setStringAsync(link.url)
    } catch (copyError) {
      setError(errorMessage(copyError))
      return
    }
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  async function share() {
    try {
      await Share.share({ message: link.url })
    } catch (shareError) {
      setError(errorMessage(shareError))
    }
  }

  function renderBody() {
    if (status === 'loading') {
      return (
        <View style={styles.center}>
          <Spinner />
        </View>
      )
    }

    if (status === 'error') {
      return (
        <>
          <AppText style={[styles.message, { color: theme.colors.danger }]}>{error}</AppText>
          <View style={styles.actions}>
            <SheetButton label="Fechar" onPress={onClose} />
            <SheetButton label="Tentar de novo" variant="solid" onPress={() => setAttempt((count) => count + 1)} />
          </View>
        </>
      )
    }

    if (!link) {
      return (
        <>
          <AppText style={[styles.message, { color: theme.colors.mute }]}>{linkExplanation(kind)}</AppText>
          {error ? <AppText style={[styles.message, { color: theme.colors.danger }]}>{error}</AppText> : null}
          <View style={styles.actions}>
            <SheetButton label="Cancelar" onPress={onClose} disabled={busy === 'create'} />
            <SheetButton
              label={busy === 'create' ? 'Aguarde…' : 'Criar link'}
              variant="solid"
              disabled={Boolean(busy)}
              onPress={create}
            />
          </View>
        </>
      )
    }

    if (confirming) {
      return (
        <>
          <AppText style={[styles.message, { color: theme.colors.mute }]}>
            O endereço atual deixa de funcionar para quem já o recebeu. Você pode criar um link novo depois.
          </AppText>
          {error ? <AppText style={[styles.message, { color: theme.colors.danger }]}>{error}</AppText> : null}
          <View style={styles.actions}>
            <SheetButton label="Cancelar" onPress={() => setConfirming(false)} disabled={busy === 'disable'} />
            <SheetButton
              label={busy === 'disable' ? 'Aguarde…' : 'Desativar'}
              variant="danger"
              disabled={Boolean(busy)}
              onPress={disable}
            />
          </View>
        </>
      )
    }

    return (
      <>
        <View style={[styles.url, { backgroundColor: theme.colors.raise }]}>
          <AppText selectable style={[styles.urlText, { color: theme.colors.ink }]}>{link.url}</AppText>
        </View>
        <View style={styles.actions}>
          <SheetButton label={copied ? 'Copiado' : 'Copiar'} variant="solid" onPress={copy} />
          <SheetButton label="Compartilhar" onPress={share} />
        </View>

        <View style={styles.alias}>
          <View style={styles.aliasRow}>
            <AppText style={[styles.affix, { color: theme.colors.mute }]}>{ADDRESS_PREFIX}</AppText>
            <View style={styles.aliasField}>
              <NameField label="Apelido" value={draft} onChangeText={setDraft} />
            </View>
            <AppText style={[styles.affix, { color: theme.colors.mute }]}>{addressSuffix(link.code)}</AppText>
          </View>
          {draftError ? (
            <AppText style={[styles.note, { color: theme.colors.danger }]}>{draftError}</AppText>
          ) : (
            <AppText style={[styles.note, { color: theme.colors.mute }]}>
              {check.changed
                ? `Novo endereço: ${ADDRESS_PREFIX}${aliasPreview(draft)}${addressSuffix(link.code)}. O endereço atual deixa de funcionar assim que você salvar.`
                : 'Trocar o apelido muda o endereço, e o atual deixa de funcionar. O código no fim não muda.'}
            </AppText>
          )}
        </View>
        {error ? <AppText style={[styles.note, { color: theme.colors.danger }]}>{error}</AppText> : null}
        <View style={styles.actions}>
          <SheetButton label="Desativar link" destructive onPress={() => { setError(''); setConfirming(true) }} disabled={Boolean(busy)} />
          <SheetButton
            label={busy === 'save' ? 'Aguarde…' : 'Salvar'}
            variant="solid"
            disabled={!check.canSave || Boolean(busy)}
            onPress={save}
          />
        </View>
      </>
    )
  }

  return (
    <ActionSheet open={Boolean(dialog)} onClose={close}>
      {current ? (
        <View style={styles.body}>
          <View style={styles.text}>
            <AppText weight="500" style={styles.title}>{linkTitle(kind)}</AppText>
            {current.name ? (
              <AppText numberOfLines={1} style={[styles.note, { color: theme.colors.mute }]}>{current.name}</AppText>
            ) : null}
          </View>
          {renderBody()}
        </View>
      ) : null}
    </ActionSheet>
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
  note: {
    fontSize: 12.5,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  center: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  url: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  urlText: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  alias: {
    gap: 8,
  },
  aliasRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  aliasField: {
    flex: 1,
  },
  affix: {
    fontSize: 15,
    paddingBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
})
