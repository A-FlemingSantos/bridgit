import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import FileReader from '../../../shared/components/FileReader/FileReader.jsx'
import Spinner from '../../../shared/components/Spinner/Spinner.jsx'
import FileOverlay from '../components/FileOverlay/FileOverlay.jsx'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import {
  ROUTES,
  driveFolderUrl,
  driveUrl,
} from '../../../shared/config/routes.js'
import { useConnections, useHubActions, useItem, usePublicLinks, useShortcuts } from '../../../shared/hub/index.js'
import { isTempRef } from '../../../shared/hub/hubCache.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { isMarkdownExtension } from '../../../shared/components/FileReader/codeLanguages.js'
import { formatFileMeta } from '../../../shared/components/FileReader/formatFileMeta.js'
import { resolveFileBackground } from '../../../shared/utils/fileOverlay.js'
import { formatFileSize } from '../../../shared/utils/formatFileSize.js'
import { fileMenuItems } from '../components/entryActions.jsx'
import styles from './SpaceFilePage.module.css'

// `overlay`: the file opens above the page it was opened from, as the settings panel does.
export default function SpaceFilePage({ overlay = false }) {
  const { fileRef, connectionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const backgroundRef = useRef(null)
  backgroundRef.current = resolveFileBackground(location) ?? ROUTES.home
  const { openOverlay } = useHub()
  const actions = useHubActions()
  const { connections, status: connectionsStatus } = useConnections()
  const { isShortcut } = useShortcuts()
  const { isPublic: hasPublicLink } = usePublicLinks()
  const itemQuery = useItem(connectionId, fileRef)
  const recordedRef = useRef(null)
  const renewedExpiredSourceRef = useRef(null)
  const sourceRecoveryRef = useRef(null)
  const [source, setSource] = useState(null)
  // The file the source was read for: a save goes there even if the page has already moved on to another file.
  const [sourceTarget, setSourceTarget] = useState(null)
  const [readError, setReadError] = useState(null)
  const [downloadPending, setDownloadPending] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const operationError = actions.getOperationError?.(connectionId) ?? null
  useEffect(() => { if (operationError) setActionError(operationError) }, [operationError])

  const connection = connections.find((entry) => entry.connectionId === connectionId) ?? null
  const item = itemQuery.item
  const readableRef = item && item.kind !== 'folder' ? item.ref : null
  // Hub actions are recreated on every cache update; reading must only restart when the file changes.
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  // Identity of the latest read-source request; stale responses must not touch a newer file.
  const sourceRequestRef = useRef(0)
  const readableRefRef = useRef(readableRef)
  readableRefRef.current = readableRef
  const connectionRef = useRef(connectionId)
  connectionRef.current = connectionId
  const sourceRef = useRef(source)
  sourceRef.current = source
  // The reader switches on the kind of provider (the OneDrive proxy fallback), never on the account.
  const provider = item?.provider ?? connection?.provider ?? null
  const readerSource = useMemo(
    () => (source ? { ...source, providerId: source.providerId ?? provider } : null),
    [provider, source],
  )
  // The code editor saves on its own; the header shows how that is going, and closing waits for it.
  const [saveStatus, setSaveStatus] = useState(null)
  const saveControllerRef = useRef(null)
  const saveContent = useCallback(
    (attempt) => actionsRef.current.saveFileContent({ ...sourceTarget, ...attempt }),
    [sourceTarget],
  )
  const handleSaveController = useCallback((controller) => {
    saveControllerRef.current = controller
  }, [])

  // Markdown opens rendered; the header toggle shows the source instead, and a new file starts rendered again.
  const [sourceView, setSourceView] = useState(false)
  const toggleSourceView = useCallback(() => setSourceView((current) => !current), [])

  useEffect(() => {
    setSaveStatus(null)
    setSourceView(false)
  }, [connectionId, readableRef])

  useEffect(() => {
    if (item?.name) {
      document.title = item.name
    }
    return () => {
      document.title = 'Bridgit'
    }
  }, [item?.name])

  useEffect(() => {
    if (!readableRef) return
    if (recordedRef.current === readableRef) return
    recordedRef.current = readableRef
    void actionsRef.current.recordRecent({ connectionId, ref: readableRef }).catch(() => {})
  }, [connectionId, readableRef])

  useEffect(() => {
    if (!readableRef) return undefined
    const requestId = (sourceRequestRef.current += 1)
    const capturedRef = readableRef
    const capturedConnection = connectionId

    let active = true
    renewedExpiredSourceRef.current = null
    sourceRecoveryRef.current = null
    setSource(null)
    setSourceTarget(null)
    setReadError(null)

    void actionsRef.current
      .getReadSource({ connectionId: capturedConnection, ref: capturedRef })
      .then((nextSource) => {
        if (!active || sourceRequestRef.current !== requestId) return
        if (readableRefRef.current !== capturedRef || connectionRef.current !== capturedConnection) return
        setSource(nextSource)
        setSourceTarget({ connectionId: capturedConnection, ref: capturedRef })
      })
      .catch((error) => {
        if (!active || sourceRequestRef.current !== requestId) return
        if (readableRefRef.current !== capturedRef || connectionRef.current !== capturedConnection) return
        setReadError(hubErrorMessage(error))
      })

    return () => {
      active = false
      sourceRequestRef.current += 1
    }
  }, [connectionId, readableRef])

  async function refreshSource({ preserveRevision = false } = {}) {
    if (!readableRef) return false
    const requestId = (sourceRequestRef.current += 1)
    const capturedRef = readableRef
    const capturedConnection = connectionId
    setReadError(null)
    try {
      const nextSource = await actionsRef.current.getReadSource({ connectionId: capturedConnection, ref: capturedRef, refresh: true })
      if (sourceRequestRef.current !== requestId) return false
      if (readableRefRef.current !== capturedRef || connectionRef.current !== capturedConnection) return false
      if (
        preserveRevision &&
        sourceRef.current?.revision &&
        nextSource?.revision &&
        sourceRef.current.revision !== nextSource.revision
      ) {
        return false
      }
      if (preserveRevision && nextSource?.url === sourceRef.current?.url) return false
      if (preserveRevision && Date.parse(nextSource?.expiresAt) <= Date.now()) return false
      setSource(nextSource)
      return true
    } catch (error) {
      if (sourceRequestRef.current !== requestId) return
      if (readableRefRef.current !== capturedRef || connectionRef.current !== capturedConnection) return
      setReadError(hubErrorMessage(error))
      return false
    }
  }

  function handleContentError() {
    const current = sourceRef.current
    const expiresAt = current?.expiresAt ? Date.parse(current.expiresAt) : NaN
    if (sourceRecoveryRef.current && sourceRecoveryRef.current.url === current?.url) return sourceRecoveryRef.current.promise
    if (!current?.url || renewedExpiredSourceRef.current === current.url || !(expiresAt <= Date.now() + 5000)) return false
    // One recovery per ticket, rather than one for the entire time the file is open.
    renewedExpiredSourceRef.current = current.url
    const recovery = { url: current.url, promise: null }
    recovery.promise = refreshSource({ preserveRevision: true }).finally(() => {
      if (sourceRecoveryRef.current === recovery) sourceRecoveryRef.current = null
    })
    sourceRecoveryRef.current = recovery
    return recovery.promise
  }

  async function handleDownload() {
    if (!item || downloadPending) return
    setDownloadPending(true)
    setDownloadError(null)
    try {
      const url = await actionsRef.current.getDownloadUrl({ connectionId, ref: item.ref })
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.name ?? ''
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      setDownloadError(hubErrorMessage(error))
    } finally {
      setDownloadPending(false)
    }
  }

  if (connectionsStatus === 'ready' && !connection) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (isTempRef(fileRef)) {
    return <Navigate to={driveUrl(connectionId)} replace />
  }

  if (itemQuery.status === 'gone') {
    const to = itemQuery.parentRef ? driveFolderUrl(connectionId, itemQuery.parentRef) : driveUrl(connectionId)
    return <Navigate to={to} replace state={{ notice: 'Esse arquivo não existe mais.' }} />
  }

  if (itemQuery.status === 'ready' && !item) {
    return <Navigate to={connection ? driveUrl(connection.connectionId) : ROUTES.home} replace />
  }

  if (itemQuery.status === 'ready' && item?.kind === 'folder') {
    return <Navigate to={driveFolderUrl(connectionId, item.ref)} replace />
  }

  // No breadcrumb while reading: the subheader shows only the file name, with its meta below.
  const titleItems = connection && item ? [{ label: item.name, current: true }] : null
  const metaLine = item
    ? [
        formatFileMeta({ extension: item.extension, providerName: connection?.providerName ?? '' }),
        formatFileSize(item.size),
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const menuContext = {
    openOverlay,
    actions,
    isShortcut,
    hasPublicLink,
    navigate,
    location,
    providerName: connection?.providerName ?? '',
    onError: (error) => setActionError(hubErrorMessage(error)),
  }

  const stage = (
    <div className={[styles.stage, overlay ? styles.stageWide : ''].filter(Boolean).join(' ')}>
      {itemQuery.status === 'loading' || itemQuery.status === 'idle' ? (
        <>
          <FileSheet large />
          <Spinner label="Carregando arquivo" />
        </>
      ) : itemQuery.status === 'error' ? (
        <>
          <p className={styles.status} role="alert" data-overlay-surface="">
            {hubErrorMessage(itemQuery.error)}
          </p>
          <button type="button" className={styles.retry} onClick={() => itemQuery.reload()} data-overlay-surface="">
            Tentar novamente
          </button>
        </>
      ) : item ? (
        <>
          {actionError ? (
            <p className={styles.status} role="alert" data-overlay-surface="">
              {actionError}
            </p>
          ) : null}
          {downloadError ? (
            <p className={styles.status} role="alert" data-overlay-surface="">
              {downloadError}
            </p>
          ) : null}
          <FileReader
            file={{
              name: item.name,
              extension: item.extension,
              mimeType: item.mimeType,
              providerName: connection?.providerName ?? '',
            }}
            variant="editorial"
            viewer={overlay}
            source={readerSource}
            error={readError}
            downloadUrl={null}
            onDownload={() => void handleDownload()}
            onRetry={() => void refreshSource()}
            onContentError={handleContentError}
            onSaveContent={saveContent}
            onSaveStatusChange={setSaveStatus}
            onSaveController={handleSaveController}
            sourceView={sourceView}
            onToggleSourceView={toggleSourceView}
          />
        </>
      ) : null}
    </div>
  )

  const headerActions = item ? (
    <div className={styles.headerActions}>
      {saveStatus?.label ? (
        <span className={styles.saveStatus} role="status" aria-live="polite" title={saveStatus.error ?? undefined}>
          {saveStatus.label}
        </span>
      ) : null}
      {isMarkdownExtension(item.extension) && readerSource?.mode === 'text' ? (
        <button
          type="button"
          className={styles.download}
          aria-pressed={sourceView}
          onClick={toggleSourceView}
        >
          Visualizar código fonte
        </button>
      ) : null}
      <button
        type="button"
        className={styles.download}
        disabled={downloadPending}
        onClick={() => void handleDownload()}
      >
        {downloadPending ? 'Baixando…' : 'Baixar'}
      </button>
      <OverflowMenu
        ghost
        label={`Ações de ${item.name}`}
        title={item.name}
        items={fileMenuItems(item, menuContext)}
      />
    </div>
  ) : null

  if (overlay) {
    return (
      <FileOverlay
        title={item?.name ?? 'Arquivo'}
        meta={metaLine}
        actions={headerActions}
        refreshKey={fileRef}
        onBeforeClose={() => saveControllerRef.current?.flushForClose() ?? true}
        onClose={() => navigate(backgroundRef.current)}
      >
        {stage}
      </FileOverlay>
    )
  }

  return (
    <AppShell
      refreshKey={fileRef}
      subheader={
        titleItems && item ? (
          <SpaceViewHeader
            className={styles.subheader}
            items={titleItems}
            subtitle={metaLine || null}
            trailing={headerActions}
          />
        ) : (
          <SpaceViewHeader className={styles.subheader} items={[]} trailing={null} />
        )
      }
    >
      <main className={styles.main}>{stage}</main>
    </AppShell>
  )
}
