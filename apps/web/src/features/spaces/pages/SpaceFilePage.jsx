import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import FileReader from '../../../shared/components/FileReader/FileReader.jsx'
import Spinner from '../../../shared/components/Spinner/Spinner.jsx'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import {
  ROUTES,
  providerFolderUrl,
  providerUrl,
} from '../../../shared/config/routes.js'
import { useHubActions, useItem, useProviders, useShortcuts } from '../../../shared/hub/index.js'
import { isTempRef } from '../../../shared/hub/hubCache.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { buildProviderBreadcrumbItems } from '../buildProviderBreadcrumb.js'
import { fileMenuItems } from '../components/entryActions.js'
import styles from './SpaceFilePage.module.css'

export default function SpaceFilePage() {
  const { fileRef, provider: providerId } = useParams()
  const { openOverlay } = useHub()
  const actions = useHubActions()
  const { providers, status: providersStatus } = useProviders()
  const { isShortcut } = useShortcuts()
  const itemQuery = useItem(providerId, fileRef)
  const recordedRef = useRef(null)
  const [source, setSource] = useState(null)
  const [readError, setReadError] = useState(null)
  const [sourceKey, setSourceKey] = useState(0)
  const [downloadPending, setDownloadPending] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const providerMeta = providers.find((item) => item.id === providerId) ?? null
  const item = itemQuery.item
  const readableRef = item && item.kind !== 'folder' ? item.ref : null
  // Hub actions are recreated on every cache update; reading must only restart when the file changes.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

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
    void actionsRef.current.recordRecent({ providerId, ref: readableRef }).catch(() => {})
  }, [providerId, readableRef])

  useEffect(() => {
    if (!readableRef) return undefined

    let active = true
    setSource(null)
    setReadError(null)

    void actionsRef.current
      .getReadSource({ providerId, ref: readableRef })
      .then((nextSource) => {
        if (!active) return
        setSource(nextSource)
      })
      .catch((error) => {
        if (!active) return
        setReadError(hubErrorMessage(error))
      })

    return () => {
      active = false
    }
  }, [providerId, readableRef])

  async function refreshSource() {
    if (!readableRef) return
    setReadError(null)
    try {
      const nextSource = await actionsRef.current.getReadSource({ providerId, ref: readableRef })
      setSource(nextSource)
      setSourceKey((key) => key + 1)
    } catch (error) {
      setReadError(hubErrorMessage(error))
    }
  }

  async function handleDownload() {
    if (!item || downloadPending) return
    setDownloadPending(true)
    setDownloadError(null)
    try {
      const url = await actionsRef.current.getDownloadUrl({ providerId, ref: item.ref })
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

  if (providersStatus === 'ready' && !providerMeta) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (isTempRef(fileRef)) {
    return <Navigate to={providerUrl(providerId)} replace />
  }

  if (itemQuery.status === 'ready' && !item) {
    return <Navigate to={providerMeta ? providerUrl(providerMeta.id) : ROUTES.home} replace />
  }

  if (itemQuery.status === 'ready' && item?.kind === 'folder') {
    return <Navigate to={providerFolderUrl(providerId, item.ref)} replace />
  }

  const breadcrumbItems =
    providerMeta && item
      ? buildProviderBreadcrumbItems({
          provider: providerMeta,
          folder: item.ancestry ? { ancestry: item.ancestry } : null,
          fileName: item.name,
        })
      : null

  const menuContext = {
    openOverlay,
    actions,
    isShortcut,
    providerName: providerMeta?.name ?? '',
    onError: (error) => setActionError(hubErrorMessage(error)),
  }

  return (
    <AppShell
      refreshKey={fileRef}
      subheader={
        breadcrumbItems && item ? (
          <SpaceViewHeader
            items={breadcrumbItems}
            trailing={
              <div className={styles.headerActions}>
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
                  items={fileMenuItems(item, menuContext)}
                />
              </div>
            }
          />
        ) : (
          <SpaceViewHeader trailing={null} />
        )
      }
    >
      <main className={styles.main}>
        <div className={styles.stage}>
          {itemQuery.status === 'loading' || itemQuery.status === 'idle' ? (
            <>
              <FileSheet large />
              <Spinner />
            </>
          ) : itemQuery.status === 'error' ? (
            <>
              <p className={styles.status} role="alert">
                {hubErrorMessage(itemQuery.error)}
              </p>
              <button type="button" className={styles.retry} onClick={() => itemQuery.reload()}>
                Tentar novamente
              </button>
            </>
          ) : item ? (
            <>
              {actionError ? (
                <p className={styles.status} role="alert">
                  {actionError}
                </p>
              ) : null}
              {downloadError ? (
                <p className={styles.status} role="alert">
                  {downloadError}
                </p>
              ) : null}
              <FileReader
                key={sourceKey}
                file={{
                  name: item.name,
                  extension: item.extension,
                  mimeType: item.mimeType,
                  providerName: providerMeta?.name ?? '',
                }}
                source={source}
                error={readError}
                downloadUrl={null}
                onDownload={() => void handleDownload()}
                onRetry={() => void refreshSource()}
              />
            </>
          ) : null}
        </div>
      </main>
    </AppShell>
  )
}
