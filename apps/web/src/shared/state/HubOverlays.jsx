import { useEffect, useRef, useState } from 'react'
import { MAX_LINK_ALIAS_LENGTH, isValidLinkAlias, normalizeLinkAlias } from '@bridgit/shared-client'
import AppOverlay, { overlayStyles as styles } from '../components/AppOverlay/AppOverlay.jsx'
import { PixelClose, PixelSave } from '../components/PixelIcons/PixelIcons.jsx'
import ProviderStrip from '../../features/spaces/components/ProviderStrip/ProviderStrip.jsx'
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
            className={styles.danger}
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
  // The form may close as soon as the server accepts the change; it must close only once.
  const closedRef = useRef(false)
  const closeOnce = () => {
    if (closedRef.current) return
    closedRef.current = true
    closeOverlay()
  }

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  const needsProvider =
    !renaming && (overlay.kind === 'folder' || overlay.kind === 'file') && !overlay.providerId

  const title =
    overlay.kind === 'space' || renaming ? 'Renomear' : overlay.kind === 'file' ? 'Novo arquivo' : 'Nova pasta'
  const label = overlay.kind === 'file' ? 'Nome do arquivo' : 'Nome'
  const submitLabel = overlay.kind === 'space' || renaming ? 'Salvar' : 'Criar'
  const provider = providerId ? providers.find((item) => item.id === providerId) : null
  const connectedProviders = providers.filter((item) => item.connected)
  const thing = overlay.kind === 'file' ? 'o arquivo' : 'a pasta'

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
          onAccepted: closeOnce,
        })
      } else if (overlay.kind === 'file') {
        // A new file is an empty upload: the providers have no separate "create" call.
        await actions.uploadFiles({
          providerId,
          parentRef: overlay.folderRef ?? null,
          files: [new File([], name)],
        })
      }
      closeOnce()
    } catch (submitError) {
      if (activeRef.current) setError(hubErrorMessage(submitError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  return (
    <AppOverlay
      title={!provider && needsProvider ? `Onde criar ${thing}?` : title}
      onClose={closeOverlay}
      compact
    >
      {needsProvider && !provider ? (
        <ProviderStrip providers={connectedProviders} onPick={setProviderId} />
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
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
                autoFocus
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
              autoFocus
            />
          )}
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeOverlay} disabled={pending}>
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={!value.trim() || (needsProvider && !providerId) || pending}
          >
            {submitLabel}
          </button>
        </div>
        </form>
      )}
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

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
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
      explorer
      refreshKey={picker.refreshKey}
      footer={
        <>
          <button type="button" className={styles.ghost} onClick={closeOverlay} disabled={pending}>
            <PixelClose size={20} />
            Cancelar
          </button>
          <button
            type="button"
            className={styles.ghost}
            disabled={pending || picker.chooseDisabled}
            title={picker.blockedReason ?? undefined}
            onClick={picker.choose}
          >
            <PixelSave size={20} />
            {pending ? 'Movendo…' : 'Salvar'}
          </button>
        </>
      }
    >
      {picker.body}
      {error ? (
        <p className={styles.error} role="alert">
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
  // The form may close as soon as the server accepts the change; it must close only once.
  const closedRef = useRef(false)
  const closeOnce = () => {
    if (closedRef.current) return
    closedRef.current = true
    closeOverlay()
  }

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  const name = overlay.name ? `"${overlay.name}"` : 'este item'
  const deleteLead =
    overlay.kind === 'folder'
      ? `${name} e tudo o que está dentro dela vão para a lixeira do provedor.`
      : `${name} vai para a lixeira do provedor.`

  async function confirmDelete() {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      await actions.deleteItem({
        providerId: overlay.providerId,
        ref: overlay.ref,
        onAccepted: closeOnce,
      })
      closeOnce()
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
        <button type="button" className={styles.danger} onClick={() => void confirmDelete()} disabled={pending}>
          Excluir
        </button>
      </div>
    </AppOverlay>
  )
}

const ALIAS_INVALID_MESSAGE = 'Apelido inválido. Use letras, números e hífens.'
const ALIAS_TAKEN_MESSAGE = 'Esse apelido já está em uso. Escolha outro.'

function aliasValidationMessage(raw, normalized) {
  if (!raw.trim()) return null
  if (!normalized) return ALIAS_INVALID_MESSAGE
  if (normalized.length > MAX_LINK_ALIAS_LENGTH) return `Use no máximo ${MAX_LINK_ALIAS_LENGTH} caracteres.`
  if (!isValidLinkAlias(normalized)) return ALIAS_INVALID_MESSAGE
  return null
}

function PublicLinkOverlay({ overlay }) {
  const { closeOverlay } = useHub()
  const actions = useHubActions()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [loadedKind, setLoadedKind] = useState(null)
  const [code, setCode] = useState('')
  const [savedAlias, setSavedAlias] = useState('')
  const [aliasValue, setAliasValue] = useState('')
  const [aliasSaving, setAliasSaving] = useState(false)
  const [aliasError, setAliasError] = useState(null)
  const activeRef = useRef(true)

  const kind = overlay.kind ?? loadedKind ?? 'file'
  const isFolder = kind === 'folder'

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  function applyLink(data) {
    setUrl(data?.url ?? '')
    setCode(data?.code ?? '')
    setSavedAlias(data?.alias ?? '')
    setAliasValue(data?.alias ?? '')
    setAliasError(null)
    if (data?.kind) setLoadedKind(data.kind)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void actions
      .getPublicLink({ providerId: overlay.providerId, ref: overlay.ref })
      .then((data) => {
        if (!active) return
        setEnabled(Boolean(data?.url || data?.suffix))
        applyLink(data)
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
      if (!activeRef.current) return
      setEnabled(true)
      applyLink(data)
    } catch (enableError) {
      if (activeRef.current) setError(hubErrorMessage(enableError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  async function disableLink() {
    setPending(true)
    setError(null)
    try {
      await actions.disablePublicLink({ providerId: overlay.providerId, ref: overlay.ref })
      if (!activeRef.current) return
      setEnabled(false)
      applyLink(null)
    } catch (disableError) {
      if (activeRef.current) setError(hubErrorMessage(disableError))
    } finally {
      if (activeRef.current) setPending(false)
    }
  }

  const normalizedAlias = normalizeLinkAlias(aliasValue)
  const localAliasError = aliasValidationMessage(aliasValue, normalizedAlias)
  const aliasChanged = normalizedAlias !== savedAlias
  const canSaveAlias = Boolean(normalizedAlias) && !localAliasError && aliasChanged && !aliasSaving && !pending
  const shownAliasError = localAliasError ?? aliasError

  async function saveAlias() {
    if (!canSaveAlias) return
    setAliasSaving(true)
    setAliasError(null)
    setError(null)
    try {
      const data = await actions.updatePublicLink({
        providerId: overlay.providerId,
        ref: overlay.ref,
        alias: normalizedAlias,
      })
      if (!activeRef.current) return
      applyLink(data)
    } catch (saveError) {
      if (!activeRef.current) return
      if (saveError?.code === 'APELIDO_INDISPONIVEL') setAliasError(ALIAS_TAKEN_MESSAGE)
      else if (saveError?.code === 'APELIDO_INVALIDO') setAliasError(ALIAS_INVALID_MESSAGE)
      else setError(hubErrorMessage(saveError))
    } finally {
      if (activeRef.current) setAliasSaving(false)
    }
  }

  return (
    <AppOverlay title={isFolder ? 'Pasta pública' : 'Link público'} onClose={closeOverlay} compact>
      <p className={styles.lead}>
        {overlay.name}. Sem login, só quem tem o endereço. Não é indexado.
      </p>
      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : enabled ? (
        <>
          <div className={styles.field}>
            <label htmlFor="public-url">Endereço</label>
            <input id="public-url" value={url} readOnly />
          </div>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void saveAlias()
            }}
          >
            <div className={styles.field}>
              <label htmlFor="public-alias">Apelido</label>
              <div className={styles.nameRow}>
                <span className={styles.nameExtension}>…/p/</span>
                <input
                  id="public-alias"
                  value={aliasValue}
                  onChange={(event) => {
                    setAliasValue(event.target.value)
                    setAliasError(null)
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={aliasSaving}
                  aria-invalid={shownAliasError ? 'true' : undefined}
                />
                {code ? <span className={styles.nameExtension}>{`-${code}`}</span> : null}
              </div>
              {normalizedAlias && normalizedAlias !== aliasValue ? (
                <p className={styles.hint}>
                  Ficará assim: {`…/p/${normalizedAlias}${code ? `-${code}` : ''}`}
                </p>
              ) : null}
            </div>
            {shownAliasError ? (
              <p className={styles.error} role="alert">
                {shownAliasError}
              </p>
            ) : null}
            <p className={styles.hint}>
              O código no fim é fixo. Ao salvar um novo apelido, o endereço antigo deixa de funcionar.
            </p>
            <button
              type="submit"
              className={styles.choose}
              style={{ alignSelf: 'flex-start' }}
              disabled={!canSaveAlias}
            >
              Salvar
            </button>
          </form>
        </>
      ) : (
        <p className={styles.hint}>
          {isFolder
            ? 'O link ainda não existe. Quem abrir poderá navegar pela pasta e pelas subpastas, só para leitura.'
            : 'O link ainda não existe.'}
        </p>
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
            <button type="button" className={styles.danger} disabled={pending} onClick={() => void disableLink()}>
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
