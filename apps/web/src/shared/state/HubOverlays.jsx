import { useEffect, useRef, useState } from 'react'
import AppOverlay, { overlayStyles as styles } from '../components/AppOverlay/AppOverlay.jsx'
import ProviderMark from '../../features/spaces/components/ProviderMark.jsx'
import { useLocationPicker } from '../../features/spaces/components/LocationPicker/useLocationPicker.jsx'
import { getSpace } from './hubStore.js'
import { hubErrorMessage } from './hubErrorMessage.js'
import { useHub } from './HubState.jsx'
import { useHubActions, useProviders } from '../hub/index.js'
import SpaceComposer from '../../features/spaces/components/SpaceComposer/SpaceComposer.jsx'

export default function HubOverlays() {
  const { state, dispatch, closeOverlay } = useHub()
  const overlay = state.overlay
  if (!overlay) return null

  if (overlay.type === 'composer') {
    return <SpaceComposer overlay={overlay} />
  }

  if (overlay.type === 'name') {
    return <NameOverlay overlay={overlay} />
  }

  if (overlay.type === 'move') {
    return <MoveOverlay overlay={overlay} />
  }

  if (overlay.type === 'confirm-delete-space') {
    const space = getSpace(state, overlay.spaceId)
    if (!space) return null
    return (
      <AppOverlay title="Excluir space" onClose={closeOverlay} compact>
        <p className={styles.lead}>
          {space.name} deixa de existir neste hub. As cópias permanecem nos provedores.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeOverlay}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => dispatch({ type: 'deleteSpace', spaceId: space.space_id })}
          >
            Excluir
          </button>
        </div>
      </AppOverlay>
    )
  }

  if (overlay.type === 'confirm-delete-entry') {
    return <ConfirmDeleteEntryOverlay overlay={overlay} />
  }

  if (overlay.type === 'public-link') {
    return <PublicLinkOverlay overlay={overlay} />
  }

  return null
}

function splitExtension(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

function NameOverlay({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const actions = useHubActions()
  const { providers } = useProviders()
  const space = overlay.spaceId ? getSpace(state, overlay.spaceId) : null
  const renaming = overlay.mode === 'rename'
  const renamingFile = renaming && overlay.kind === 'file'
  const { stem: fileStem, extension: fileExtension } = renamingFile
    ? splitExtension(overlay.name ?? '')
    : { stem: overlay.name ?? '', extension: '' }
  const initial =
    overlay.kind === 'space'
      ? space?.name ?? ''
      : renaming
        ? fileStem
        : overlay.kind === 'file'
          ? 'Documento'
          : 'Pasta sem título'
  const [value, setValue] = useState(initial)
  const [providerId, setProviderId] = useState(overlay.providerId ?? null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const activeRef = useRef(true)

  useEffect(() => () => {
    activeRef.current = false
  }, [])
  const needsProvider =
    !renaming && (overlay.kind === 'folder' || overlay.kind === 'file') && !overlay.providerId

  const title =
    overlay.kind === 'space' || renaming ? 'Renomear' : overlay.kind === 'file' ? 'Criar' : 'Nova pasta'
  const label = overlay.kind === 'file' ? 'Nome do arquivo' : 'Nome'
  const submitLabel = overlay.kind === 'space' || renaming ? 'Salvar' : 'Criar'
  const provider = providerId ? providers.find((item) => item.id === providerId) : null
  const connectedProviders = providers.filter((item) => item.connected)

  async function submit() {
    const name = value.trim()
    if (!name || pending) return

    if (overlay.kind === 'space') {
      dispatch({ type: 'renameSpace', spaceId: overlay.spaceId, name })
      return
    }

    if (!providerId && needsProvider) return

    setPending(true)
    setError(null)

    try {
      if (renamingFile) {
        await actions.renameItem({
          providerId: overlay.providerId,
          ref: overlay.ref,
          name: name.toLowerCase().endsWith(fileExtension.toLowerCase()) ? name : `${name}${fileExtension}`,
        })
      } else if (renaming && overlay.kind === 'folder') {
        await actions.renameItem({ providerId: overlay.providerId, ref: overlay.ref, name })
      } else if (overlay.kind === 'folder') {
        await actions.createFolder({
          providerId,
          parentRef: overlay.folderRef ?? null,
          name,
        })
      }
      closeOverlay()
    } catch (submitError) {
      if (activeRef.current) setError(hubErrorMessage(submitError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  return (
    <AppOverlay
      title={!provider && needsProvider ? 'Provedor' : title}
      onClose={closeOverlay}
      compact
      trailing={
        !provider && needsProvider ? null : (
          <button
            type="button"
            className={styles.choose}
            disabled={!value.trim() || (needsProvider && !providerId) || pending}
            onClick={() => void submit()}
          >
            {submitLabel}
          </button>
        )
      }
    >
      {needsProvider && !provider ? (
        <div className={styles.stack} role="listbox" aria-label="Provedores">
          {connectedProviders.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.pick}
              role="option"
              onClick={() => setProviderId(item.id)}
            >
              <ProviderMark id={item.id} size={22} />
              <span className={styles.pickTitle}>{item.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor="hub-name">{label}</label>
          {fileExtension ? (
            <div className={styles.nameRow}>
              <input
                id="hub-name"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
              <span className={styles.nameExtension} aria-label={`Extensão ${fileExtension}`}>
                {fileExtension}
              </span>
            </div>
          ) : (
            <input
              id="hub-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              disabled={pending}
            />
          )}
        </div>
      )}
      {error ? (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      ) : null}
    </AppOverlay>
  )
}

function MoveOverlay({ overlay }) {
  const { closeOverlay } = useHub()
  const actions = useHubActions()
  const { providers } = useProviders()
  const provider = providers.find((item) => item.id === overlay.providerId)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const activeRef = useRef(true)

  useEffect(() => () => {
    activeRef.current = false
  }, [])

  const blockedRefs = overlay.kind === 'folder' ? [overlay.ref] : [overlay.parentRef].filter(Boolean)

  const picker = useLocationPicker({
    source: 'api',
    initialProviderId: overlay.providerId ?? null,
    foldersOnly: true,
    allowRoot: true,
    disabledFolderRefs: blockedRefs,
    blockedHint: 'Não dá para mover para cá',
    resetKey: `${overlay.kind}-${overlay.ref}`,
    onChoose: (location) => {
      void handleMove(location)
    },
  })

  async function handleMove(location) {
    if (pending) return
    if (!picker.validated) return
    const parentRef = location?.kind === 'folder' ? location.ref : null
    setPending(true)
    setError(null)

    try {
      await actions.moveItem({
        providerId: overlay.providerId,
        ref: overlay.ref,
        fromParentRef: overlay.parentRef ?? undefined,
        parentRef,
      })
      closeOverlay()
    } catch (moveError) {
      if (activeRef.current) setError(hubErrorMessage(moveError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  if (!provider) return null

  return (
    <AppOverlay
      title="Mover"
      onClose={closeOverlay}
      compact
      trailing={picker.trailing}
      refreshKey={picker.refreshKey}
    >
      {picker.body}
      {error ? (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      ) : null}
    </AppOverlay>
  )
}

function ConfirmDeleteEntryOverlay({ overlay }) {
  const { closeOverlay } = useHub()
  const actions = useHubActions()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const activeRef = useRef(true)

  useEffect(() => () => {
    activeRef.current = false
  }, [])
  const name = overlay.name ?? 'este item'
  const deleteLead =
    overlay.kind === 'folder'
      ? `${name} será excluída do provedor e deixará de existir neste hub.`
      : `${name} será excluído do provedor e deixará de existir neste hub.`

  async function confirmDelete() {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      await actions.deleteItem({
        providerId: overlay.providerId,
        ref: overlay.ref,
        parentRef: overlay.parentRef ?? undefined,
      })
      closeOverlay()
    } catch (deleteError) {
      if (activeRef.current) setError(hubErrorMessage(deleteError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  return (
    <AppOverlay
      title={overlay.kind === 'folder' ? 'Excluir pasta' : 'Excluir arquivo'}
      onClose={closeOverlay}
      compact
    >
      <p className={styles.lead}>
        {deleteLead}
      </p>
      {error ? (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={closeOverlay} disabled={pending}>
          Cancelar
        </button>
        <button type="button" className={styles.primary} onClick={() => void confirmDelete()} disabled={pending}>
          Excluir
        </button>
      </div>
    </AppOverlay>
  )
}

function PublicLinkOverlay({ overlay }) {
  const { closeOverlay } = useHub()
  const actions = useHubActions()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void actions
      .getPublicLink({ providerId: overlay.providerId, ref: overlay.ref })
      .then((data) => {
        if (!active) return
        setEnabled(Boolean(data?.url || data?.suffix))
        setUrl(data?.url ?? '')
      })
      .catch((loadError) => {
        if (!active) return
        setError(hubErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [actions, overlay.providerId, overlay.ref])

  async function enableLink() {
    setPending(true)
    setError(null)
    try {
      const data = await actions.enablePublicLink({ providerId: overlay.providerId, ref: overlay.ref })
      setEnabled(true)
      setUrl(data?.url ?? '')
    } catch (enableError) {
      setError(hubErrorMessage(enableError))
    } finally {
      setPending(false)
    }
  }

  async function disableLink() {
    setPending(true)
    setError(null)
    try {
      await actions.disablePublicLink({ providerId: overlay.providerId, ref: overlay.ref })
      setEnabled(false)
      setUrl('')
    } catch (disableError) {
      setError(hubErrorMessage(disableError))
    } finally {
      setPending(false)
    }
  }

  return (
    <AppOverlay title="Link público" onClose={closeOverlay} compact>
      <p className={styles.lead}>
        {overlay.name}. Sem login, só quem tem o endereço. Não é indexado.
      </p>
      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : enabled ? (
        <div className={styles.field}>
          <label htmlFor="public-url">Endereço</label>
          <input id="public-url" value={url} readOnly />
        </div>
      ) : (
        <p className={styles.hint}>O link ainda não existe.</p>
      )}
      {error ? (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        {enabled ? (
          <>
            <button
              type="button"
              className={styles.secondary}
              disabled={pending}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard && url) {
                  navigator.clipboard.writeText(url).catch(() => {})
                }
              }}
            >
              Copiar
            </button>
            <button type="button" className={styles.primary} disabled={pending} onClick={() => void disableLink()}>
              Revogar
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.primary}
            disabled={pending || loading}
            onClick={() => void enableLink()}
          >
            Criar link
          </button>
        )}
      </div>
    </AppOverlay>
  )
}
