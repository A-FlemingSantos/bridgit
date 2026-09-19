import { useState } from 'react'
import AppOverlay, { overlayStyles as styles } from '../components/AppOverlay/AppOverlay.jsx'
import ProviderMark from '../../features/spaces/components/ProviderMark.jsx'
import { useLocationPicker } from '../../features/spaces/components/LocationPicker/useLocationPicker.jsx'
import {
  collectDescendantFolderRefs,
  getFile,
  getFolder,
  getProvider,
  getSpace,
  publicLinkFor,
} from './hubStore.js'
import { useHub } from './HubState.jsx'
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
    return <PublicLinkOverlay fileRef={overlay.fileRef} />
  }

  return null
}

function NameOverlay({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const space = overlay.spaceId ? getSpace(state, overlay.spaceId) : null
  const file = overlay.fileRef ? getFile(state, overlay.fileRef) : null
  const folder = overlay.folderRef ? getFolder(state, overlay.folderRef) : null
  const renaming = overlay.mode === 'rename'
  const initial =
    overlay.kind === 'space'
      ? space?.name ?? ''
      : renaming && overlay.kind === 'file'
        ? file?.title ?? ''
        : renaming && overlay.kind === 'folder'
          ? folder?.name ?? ''
          : overlay.kind === 'file'
            ? 'Documento'
            : 'Pasta sem título'
  const [value, setValue] = useState(initial)
  const [providerId, setProviderId] = useState(overlay.providerId ?? null)
  const needsProvider = !renaming && (overlay.kind === 'folder' || overlay.kind === 'file') && !overlay.providerId

  const title =
    overlay.kind === 'space' || renaming ? 'Renomear' : overlay.kind === 'file' ? 'Criar' : 'Nova pasta'
  const label = overlay.kind === 'file' ? 'Nome do arquivo' : 'Nome'
  const submitLabel = overlay.kind === 'space' || renaming ? 'Salvar' : 'Criar'
  const provider = providerId ? getProvider(state, providerId) : null

  function submit() {
    const name = value.trim()
    if (!name) return

    if (overlay.kind === 'space') {
      dispatch({ type: 'renameSpace', spaceId: overlay.spaceId, name })
      return
    }

    if (renaming && overlay.kind === 'file') {
      dispatch({ type: 'renameFile', fileRef: overlay.fileRef, title: name })
      return
    }

    if (renaming && overlay.kind === 'folder') {
      dispatch({ type: 'renameFolder', folderRef: overlay.folderRef, name })
      return
    }

    if (!providerId) return

    if (overlay.kind === 'folder') {
      dispatch({
        type: 'createFolder',
        name,
        providerId,
        parentFolderRef: overlay.folderRef ?? null,
      })
      return
    }

    dispatch({
      type: 'createFile',
      title: name,
      providerId,
      parentFolderRef: overlay.folderRef ?? null,
      kind: 'PDF',
    })
  }

  return (
    <AppOverlay
      title={!provider && needsProvider ? 'Provedor' : title}
      onClose={closeOverlay}
      compact
      trailing={
        !provider && needsProvider ? null : (
          <button type="button" className={styles.choose} disabled={!value.trim() || (needsProvider && !providerId)} onClick={submit}>
            {submitLabel}
          </button>
        )
      }
    >
      {needsProvider && !provider ? (
        <div className={styles.stack} role="listbox" aria-label="Provedores">
          {state.providers.map((item) => (
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
          <input
            id="hub-name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
          />
        </div>
      )}
    </AppOverlay>
  )
}

function MoveOverlay({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const entry =
    overlay.kind === 'folder' ? getFolder(state, overlay.folderRef) : getFile(state, overlay.fileRef)
  const currentFolderRef =
    overlay.kind === 'folder' ? entry?.parentFolderRef ?? null : entry?.folderRef ?? null
  const blocked =
    overlay.kind === 'folder'
      ? [overlay.folderRef, ...collectDescendantFolderRefs(state, overlay.folderRef)]
      : currentFolderRef
        ? [currentFolderRef]
        : []

  const picker = useLocationPicker({
    initialProviderId: entry?.providerId ?? null,
    foldersOnly: true,
    allowRoot: true,
    disabledFolderRefs: blocked,
    blockedHint: 'Não dá para mover para cá',
    resetKey: overlay.kind === 'folder' ? overlay.folderRef : overlay.fileRef,
    onChoose: (location) => {
      const parentFolderRef = location?.kind === 'folder' ? location.ref : null
      if (overlay.kind === 'folder') {
        dispatch({ type: 'moveFolder', folderRef: overlay.folderRef, parentFolderRef })
        return
      }
      dispatch({ type: 'moveFile', fileRef: overlay.fileRef, parentFolderRef })
    },
  })

  if (!entry) return null

  return (
    <AppOverlay
      title="Mover"
      onClose={closeOverlay}
      compact
      trailing={picker.trailing}
      refreshKey={picker.refreshKey}
    >
      {picker.body}
    </AppOverlay>
  )
}

function ConfirmDeleteEntryOverlay({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const file = overlay.kind === 'file' ? getFile(state, overlay.fileRef) : null
  const folder = overlay.kind === 'folder' ? getFolder(state, overlay.folderRef) : null
  const name = file?.title ?? folder?.name
  if (!name) return null

  return (
    <AppOverlay title={overlay.kind === 'folder' ? 'Excluir pasta' : 'Excluir arquivo'} onClose={closeOverlay} compact>
      <p className={styles.lead}>
        {name} deixa de existir neste hub. A cópia no provedor permanece.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={closeOverlay}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() =>
            overlay.kind === 'folder'
              ? dispatch({ type: 'deleteFolder', folderRef: overlay.folderRef })
              : dispatch({ type: 'deleteFile', fileRef: overlay.fileRef })
          }
        >
          Excluir
        </button>
      </div>
    </AppOverlay>
  )
}

function PublicLinkOverlay({ fileRef }) {
  const { state, dispatch, closeOverlay } = useHub()
  const file = getFile(state, fileRef)
  const suffix = state.publicLinks[fileRef]
  const enabled = Boolean(suffix)
  const url = enabled ? publicLinkFor(fileRef, suffix) : ''

  if (!file) return null

  return (
    <AppOverlay title="Link público" onClose={closeOverlay} compact>
      <p className={styles.lead}>
        {file.title}. Sem login, só quem tem o endereço. Não é indexado.
      </p>
      {enabled ? (
        <div className={styles.field}>
          <label htmlFor="public-url">Endereço</label>
          <input id="public-url" value={url} readOnly />
        </div>
      ) : (
        <p className={styles.hint}>O link ainda não existe.</p>
      )}
      <div className={styles.actions}>
        {enabled ? (
          <>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(url).catch(() => {})
                }
              }}
            >
              Copiar
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => dispatch({ type: 'setPublicLink', fileRef, enabled: false })}
            >
              Revogar
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => dispatch({ type: 'setPublicLink', fileRef, enabled: true })}
          >
            Criar link
          </button>
        )}
      </div>
    </AppOverlay>
  )
}
