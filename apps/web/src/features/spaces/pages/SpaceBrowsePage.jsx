import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { FilePen, FolderPlus, PenLine, Stamp, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import StaggerItem from '../../../shared/components/motion/StaggerItem.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import {
  ROUTES,
  driveFileUrl,
  driveFolderUrl,
  driveUrl,
} from '../../../shared/config/routes.js'
import { fileNavState, usePageLocation } from '../../../shared/utils/fileOverlay.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import { useConnections, useFolder, useHubActions, usePublicLinks, useShortcuts } from '../../../shared/hub/index.js'
import { isTempRef } from '../../../shared/hub/hubCache.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileThumb from '../components/FileThumb/FileThumb.jsx'
import FolderArt from '../components/FolderArt/FolderArt.jsx'
import { folderViewStyles, ItemGrid, TileContent, useTileSelection } from '../components/FolderView/FolderView.jsx'
import FolderColorPalette from '../components/FolderColorPalette/FolderColorPalette.jsx'
import { useFolderColors } from '../folderColors.js'
import SelectionActions from '../components/SelectionActions/SelectionActions.jsx'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { buildProviderBreadcrumbItems, childFolderTrail } from '../buildProviderBreadcrumb.js'
import { connectionLabel } from '../connectionLabel.js'
import { formatItemDate } from '../formatItemDate.js'
import { fileMenuItems, folderMenuItems } from '../components/entryActions.jsx'
import styles from './SpaceBrowsePage.module.css'
import { staleCatalogNotice } from './staleCatalogNotice.js'

// Open pixel folder drawn in the empty-folder state.
const FOLDER_OPEN = 'M3 4h8v2H3zM1 6h2v12H1zM9 6h10v2H9zM19 8h2v2h-2zM7 10h15v2H7zM5 12h2v2H5zM20 12h2v2h-2zM3 14h2v2H3zM18 14h2v2h-2zM16 16h2v2h-2zM3 18h13v2H3z'

const EXIT_SECONDS = 0.2

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, scale: 0.9, transition: { duration: EXIT_SECONDS, ease: [0.22, 1, 0.36, 1] } },
}

// The name field that replaces a tile's title while a name is typed. Enter confirms and Escape cancels.
// Leaving the field confirms a rename but drops a new item: only Enter creates it.
// `suffix` is a fixed ending (a file's extension) kept out of the field.
function InlineName({ initial, label, suffix = '', creating = false, onCommit, onCancel }) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef(null)
  const doneRef = useRef(false)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function finish(commit) {
    if (doneRef.current) return
    const name = value.trim()
    doneRef.current = true
    // Renaming to the same name changes nothing; a new item keeps its suggested name.
    if (commit && name && (creating || name !== initial)) onCommit(name)
    else onCancel()
  }

  return (
    <span className={styles.nameRow}>
      {/* The hidden copy sizes the field to its text, so the extension stays right behind the name. */}
      <span className={styles.nameSizer}>
        <span className={styles.nameMirror} aria-hidden="true">{value}</span>
        <input
          ref={inputRef}
          className={styles.nameInput}
          value={value}
          aria-label={label}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              finish(true)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              finish(false)
            }
          }}
          onBlur={() => finish(!creating)}
        />
      </span>
      {suffix ? <span className={styles.nameSuffix}>{suffix}</span> : null}
    </span>
  )
}

// Splits "report.pdf" into the editable "report" and the fixed ".pdf".
function splitExtension(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

function itemKindLabel(item) {
  if (item.extension) return item.extension.toUpperCase()
  if (item.mimeType) return item.mimeType.split('/').pop()?.toUpperCase() ?? 'Arquivo'
  return 'Arquivo'
}

// Items still waiting for the provider have a temporary ref, so they must not link anywhere yet.
function PendingAware({ pending, className, render, children }) {
  if (pending) {
    return (
      <span className={className} aria-disabled="true" aria-busy="true">
        {children}
      </span>
    )
  }
  return render({ className, children })
}

export default function SpaceBrowsePage() {
  const { folderRef, connectionId } = useParams()
  const location = useLocation()
  const pageLocation = usePageLocation()
  const navigate = useNavigate()
  const { openOverlay } = useHub()
  const actions = useHubActions()
  const { connections, status: connectionsStatus } = useConnections()
  const { isShortcut } = useShortcuts()
  const { isPublic: hasPublicLink } = usePublicLinks()
  const folderColors = useFolderColors()
  const folderQuery = useFolder(connectionId, folderRef ?? null)
  const uploadRef = useRef(null)
  const [actionError, setActionError] = useState(null)
  const operationError = actions.getOperationError?.(connectionId) ?? null
  useEffect(() => { if (operationError) setActionError(operationError) }, [operationError])
  const [failedUploads, setFailedUploads] = useState([])
  // The folder being named. Its key is the one its pending entry will carry, so the same row goes
  // from name field to pending to created without being remounted.
  const [draftKey, setDraftKey] = useState(null)
  // A dropped draft fades out in place first; only once it is gone do the other folders close the gap,
  // the creation animation played backwards.
  const [leavingDraftKey, setLeavingDraftKey] = useState(null)
  const [renamingRef, setRenamingRef] = useState(null)
  // Folders are shown before files, so a Shift range follows that order.
  const tileOrder = ['folder', 'file'].flatMap((kind) =>
    folderQuery.items.filter((item) => item.kind === kind && !item.pending).map((item) => item.ref),
  )
  const selection = useTileSelection(`${connectionId}:${folderRef ?? ''}`, tileOrder)
  // A draft belongs to the folder it was opened in; moving to another folder drops it.
  useEffect(() => { setDraftKey(null) }, [connectionId, folderRef])

  // The account in the address; the provider is only how it is shown.
  const connection = connections.find((item) => item.connectionId === connectionId) ?? null
  const knownConnection = connectionsStatus === 'ready' ? connection : connectionsStatus === 'loading' ? true : connection

  // An account that is not (or no longer) connected has nothing to browse.
  if (connectionsStatus === 'ready' && !connection) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (isTempRef(folderRef)) {
    return <Navigate to={driveUrl(connectionId)} replace />
  }

  if (folderRef && folderQuery.status === 'gone') {
    const to = folderQuery.parentRef ? driveFolderUrl(connectionId, folderQuery.parentRef) : driveUrl(connectionId)
    return <Navigate to={to} replace state={{ notice: 'Essa pasta não existe mais.' }} />
  }

  if (folderRef && folderQuery.status === 'ready' && folderQuery.folder === null && folderQuery.items.length === 0) {
    return <Navigate to={driveUrl(connectionId)} replace />
  }

  const connected = Boolean(connection)
  const accountName = connectionLabel(connection, connections)
  // The connection still exists but the provider rejected it; the folder shows the last synced catalog.
  const expired = connected && connection?.lastError === 'RECONEXAO_NECESSARIA'
  const folders = folderQuery.items.filter((item) => item.kind === 'folder')
  const files = folderQuery.items.filter((item) => item.kind === 'file')
  const folderRows = draftKey
    ? [{ draft: true, uiKey: `operation-${draftKey}` }, ...folders]
    : folders
  const staleNotice = staleCatalogNotice(folderQuery.catalog, { reconnectShown: expired })
  const empty =
    folderQuery.status === 'ready' && folders.length === 0 && files.length === 0 && !draftKey
  const pendingFolder = folderRef
    ? {
        ref: folderRef,
        name: pageLocation.state?.folderName ?? null,
        ancestry: pageLocation.state?.folderTrail ?? [],
      }
    : null
  const headerFolder = folderQuery.status === 'ready' ? folderQuery.folder : pendingFolder
  const breadcrumbItems = connection
    ? buildProviderBreadcrumbItems({ connection, rootLabel: accountName, folder: headerFolder })
    : null

  async function renameEntry(item, name) {
    setRenamingRef(null)
    setActionError(null)
    const { extension } = item.kind === 'file' ? splitExtension(item.name) : { extension: '' }
    const finalName = extension && !name.toLowerCase().endsWith(extension.toLowerCase()) ? `${name}${extension}` : name
    try {
      await actions.renameItem({ connectionId, ref: item.ref, name: finalName })
    } catch (error) {
      setActionError(hubErrorMessage(error))
    }
  }

  function dropDraft() {
    const key = draftKey
    setLeavingDraftKey(key)
    setTimeout(() => {
      setDraftKey((current) => (current === key ? null : current))
      setLeavingDraftKey((current) => (current === key ? null : current))
    }, EXIT_SECONDS * 1000)
  }

  async function createFolder(name) {
    const clientKey = draftKey
    setDraftKey(null)
    setActionError(null)
    try {
      await actions.createFolder({ connectionId, parentRef: folderRef ?? null, name, clientKey })
    } catch (error) {
      setActionError(hubErrorMessage(error))
    }
  }

  async function onUpload(event) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    await sendUpload(selected)
  }

  async function sendUpload(files) {
    setActionError(null)
    setFailedUploads([])
    try {
      await actions.uploadFiles({
        connectionId,
        parentRef: folderRef ?? null,
        files,
      })
    } catch (error) {
      setActionError(hubErrorMessage(error))
      const failed = Array.isArray(error?.failed) ? error.failed.filter(Boolean) : []
      setFailedUploads(failed)
    }
  }

  const retryableUploads = failedUploads.filter((entry) => entry?.ambiguous !== true)
  const pendingVerificationUploads = failedUploads.filter((entry) => entry?.ambiguous === true)

  async function retryRejectedUploads() {
    const files = retryableUploads.map((entry) => entry?.file ?? entry).filter(Boolean)
    if (files.length === 0) return
    await sendUpload(files)
  }

  function menuContext(item) {
    return {
      openOverlay,
      actions,
      isShortcut,
      hasPublicLink,
      navigate,
      location,
      providerName: connection?.providerName ?? '',
      onError: (error) => setActionError(hubErrorMessage(error)),
      onRename: (target) => setRenamingRef(target.ref),
    }
  }

  function folderMenuContext(item) {
    const color = folderColors.colorOf(connectionId, item.ref)
    return {
      ...menuContext(item),
      colorPicker: {
        swatch: color.hex,
        panel: ({ close }) => (
          <FolderColorPalette
            selectedId={color.id}
            onPick={(id) => {
              folderColors.setColor(connectionId, item.ref, id)
              close()
            }}
          />
        ),
      },
    }
  }

  function renderBody() {
    // While the folder loads the page stays empty: no loading text.
    if (connectionsStatus === 'loading' || folderQuery.status === 'loading' || folderQuery.status === 'idle') {
      return null
    }

    if (connectionsStatus === 'error' || folderQuery.status === 'error') {
      return (
        <>
          <p className={styles.empty} role="alert">
            Não foi possível carregar o conteúdo.
          </p>
          <button type="button" className={styles.loadMore} onClick={() => folderQuery.reload()}>
            Tentar novamente
          </button>
        </>
      )
    }

    return (
      <>
        {expired ? (
          <>
            <p className={styles.empty} role="alert">
              O acesso ao {accountName || 'provedor'} expirou e esta lista pode estar desatualizada.
            </p>
            <button
              type="button"
              className={styles.loadMore}
              onClick={() =>
                navigate(ROUTES.settingsProviders, {
                  state: settingsNavState({ pathname: window.location.pathname }),
                })
              }
            >
              Reconectar
            </button>
          </>
        ) : null}
        {pageLocation.state?.notice ? <p className={styles.empty} role="status">{pageLocation.state.notice}</p> : null}
        {staleNotice ? <p className={styles.empty} role="status">{staleNotice}</p> : null}
        {empty && !expired && !staleNotice ? (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d={FOLDER_OPEN} />
            </svg>
            <p className={styles.emptyTitle}>Pasta vazia</p>
            <p className={styles.empty}>Envie arquivos ou crie uma pasta.</p>
          </div>
        ) : null}

        {folderRows.length > 0 ? (
          <ItemGrid label="Pastas">
              <AnimatePresence mode="popLayout">
              {folderRows.map((item, index) => (
                <StaggerItem
                  key={item.uiKey ?? item.ref}
                  index={index}
                  base={item.draft ? 0.3 : 0.06}
                  step={0.04}
                  variants={rise}
                  layout
                  leaving={item.draft && leavingDraftKey === draftKey}
                  className={folderViewStyles.wrap}
                >
                  {item.draft ? (
                    <div className={folderViewStyles.tile}>
                      <TileContent
                        art={<FolderArt color={folderColors.colorOf(connectionId, null).hex} />}
                        title={
                          <InlineName
                            initial="Nova pasta"
                            label="Nome da nova pasta"
                            creating
                            onCommit={(name) => void createFolder(name)}
                            onCancel={dropDraft}
                          />
                        }
                        subtitle="Pasta"
                      />
                    </div>
                  ) : (
                  <>
                  <PendingAware
                    pending={item.pending}
                    className={folderViewStyles.tile}
                    render={(props) =>
                      renamingRef === item.ref ? (
                        <div {...props} />
                      ) : (
                        <Link
                          {...props}
                          {...selection.tileProps(item.ref)}
                          to={driveFolderUrl(connectionId, item.ref)}
                          state={{ folderName: item.name, folderTrail: childFolderTrail(folderQuery.folder) }}
                        />
                      )
                    }
                  >
                    <TileContent
                      art={<FolderArt color={folderColors.colorOf(connectionId, item.ref).hex} />}
                      title={
                        renamingRef === item.ref ? (
                          <InlineName
                            initial={item.name}
                            label={`Novo nome de ${item.name}`}
                            onCommit={(name) => void renameEntry(item, name)}
                            onCancel={() => setRenamingRef(null)}
                          />
                        ) : (
                          item.name
                        )
                      }
                      subtitle={formatItemDate(item.modifiedAt) || 'Pasta'}
                    />
                  </PendingAware>
                  {item.pending || renamingRef === item.ref ? null : (
                    <OverflowMenu
                      contextual
                      label={`Ações de ${item.name}`}
                      title={item.name}
                      items={folderMenuItems(item, folderMenuContext(item))}
                    />
                  )}
                  </>
                  )}
                </StaggerItem>
              ))}
              </AnimatePresence>
          </ItemGrid>
        ) : null}

        {files.length > 0 ? (
          <ItemGrid label="Arquivos">
              <AnimatePresence mode="popLayout">
              {files.map((item, index) => (
                <StaggerItem
                  key={item.uiKey ?? item.ref}
                  index={index}
                  base={0.14}
                  step={0.03}
                  variants={rise}
                  layout
                  className={folderViewStyles.wrap}
                >
                  <PendingAware
                    pending={item.pending}
                    className={folderViewStyles.tile}
                    render={(props) =>
                      renamingRef === item.ref ? (
                        <div {...props} />
                      ) : (
                        <Link
                          {...props}
                          {...selection.tileProps(item.ref)}
                          to={driveFileUrl(connectionId, item.ref)}
                          state={fileNavState(location)}
                        />
                      )
                    }
                  >
                    <TileContent
                      art={<FileThumb file={item} connectionId={connectionId} showTypeIcon />}
                      title={
                        renamingRef === item.ref ? (
                          <InlineName
                            initial={splitExtension(item.name).stem}
                            suffix={splitExtension(item.name).extension}
                            label={`Novo nome de ${item.name}`}
                            onCommit={(name) => void renameEntry(item, name)}
                            onCancel={() => setRenamingRef(null)}
                          />
                        ) : (
                          item.name
                        )
                      }
                      subtitle={formatItemDate(item.modifiedAt) || itemKindLabel(item)}
                    />
                  </PendingAware>
                  {item.pending || renamingRef === item.ref ? null : (
                    <OverflowMenu
                      contextual
                      label={`Ações de ${item.name}`}
                      title={item.name}
                      items={fileMenuItems(item, menuContext(item))}
                    />
                  )}
                </StaggerItem>
              ))}
              </AnimatePresence>
          </ItemGrid>
        ) : null}

        {folderQuery.nextCursor ? (
          <button type="button" className={styles.loadMore} onClick={() => folderQuery.loadMore()}>
            Carregar mais
          </button>
        ) : null}
      </>
    )
  }

  if (!knownConnection && connectionsStatus === 'idle') {
    return null
  }

  return (
    <AppShell
      refreshKey={`${connectionId}-${folderRef ?? 'root'}`}
      subheader={
        breadcrumbItems ? (
          <SpaceViewHeader
            trail
            items={breadcrumbItems}
            trailing={
              connected && !expired ? (
                <SpaceViewActions
                  onCreate={() => uploadRef.current?.click()}
                  extras={[
                    {
                      id: 'upload',
                      label: 'Enviar',
                      icon: Upload,
                      onSelect: () => uploadRef.current?.click(),
                    },
                    {
                      id: 'folder',
                      label: 'Nova pasta',
                      icon: FolderPlus,
                      onSelect: () => setDraftKey(crypto.randomUUID()),
                    },
                    { id: 'edit', label: 'Editar PDF', icon: FilePen },
                    { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp },
                    { id: 'sign', label: 'Assinar', icon: PenLine },
                  ]}
                />
              ) : null
            }
          />
        ) : (
          <SpaceViewHeader trail trailing={null} />
        )
      }
    >
      <main className={styles.main}>
        {connected && !expired ? (
          <SelectionActions
            entries={folderQuery.items.filter((item) => !item.pending && selection.selected.has(item.ref))}
            connectionId={connectionId}
            gap={40}
            openOverlay={openOverlay}
            actions={actions}
            isShortcut={isShortcut}
            colorOf={folderColors.colorOf}
            setColor={folderColors.setColor}
            onError={(error) => setActionError(hubErrorMessage(error))}
          />
        ) : null}
        <input ref={uploadRef} type="file" hidden multiple onChange={(event) => void onUpload(event)} />
        {actionError ? (
          <>
            <p className={styles.empty} role="alert">
              {actionError}
            </p>
            {pendingVerificationUploads.length > 0 ? (
              <p className={styles.empty} role="status">
                O envio pode ter sido concluído; a pasta está sendo atualizada.
              </p>
            ) : null}
            {retryableUploads.length > 0 ? (
              <button
                type="button"
                className={styles.loadMore}
                onClick={() => void retryRejectedUploads()}
              >
                Tentar novamente
              </button>
            ) : null}
          </>
        ) : null}
        {renderBody()}
      </main>
    </AppShell>
  )
}
