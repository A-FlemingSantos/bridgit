import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { FilePen, FolderPlus, PenLine, Stamp, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import StaggerItem from '../../../shared/components/motion/StaggerItem.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import {
  ROUTES,
  providerFileUrl,
  providerFolderUrl,
  providerUrl,
} from '../../../shared/config/routes.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import { useFolder, useHubActions, useProviders, usePublicLinks, useShortcuts } from '../../../shared/hub/index.js'
import { isTempRef } from '../../../shared/hub/hubCache.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import FolderArt from '../components/FolderArt/FolderArt.jsx'
import { folderViewStyles, ItemGrid, TileContent } from '../components/FolderView/FolderView.jsx'
import FolderColorPalette from '../components/FolderColorPalette/FolderColorPalette.jsx'
import { useFolderColors } from '../folderColors.js'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { buildProviderBreadcrumbItems, childFolderTrail } from '../buildProviderBreadcrumb.js'
import { formatItemDate } from '../formatItemDate.js'
import { fileMenuItems, folderMenuItems } from '../components/entryActions.jsx'
import styles from './SpaceBrowsePage.module.css'
import { staleCatalogNotice } from './staleCatalogNotice.js'

// Open pixel folder drawn in the empty-folder state.
const FOLDER_OPEN = 'M3 4h8v2H3zM1 6h2v12H1zM9 6h10v2H9zM19 8h2v2h-2zM7 10h15v2H7zM5 12h2v2H5zM20 12h2v2h-2zM3 14h2v2H3zM18 14h2v2h-2zM16 16h2v2h-2zM3 18h13v2H3z'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
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
  const { folderRef, provider: providerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { openOverlay } = useHub()
  const actions = useHubActions()
  const { providers, status: providersStatus } = useProviders()
  const { isShortcut } = useShortcuts()
  const { isPublic: hasPublicLink } = usePublicLinks()
  const folderColors = useFolderColors()
  const folderQuery = useFolder(providerId, folderRef ?? null)
  const uploadRef = useRef(null)
  const [actionError, setActionError] = useState(null)
  const operationError = actions.getOperationError?.(providerId) ?? null
  useEffect(() => { if (operationError) setActionError(operationError) }, [operationError])
  const [failedUploads, setFailedUploads] = useState([])

  const providerMeta = providers.find((item) => item.id === providerId) ?? null
  const knownProvider = providersStatus === 'ready' ? providerMeta : providersStatus === 'loading' ? true : providerMeta

  if (providersStatus === 'ready' && !providerMeta) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (isTempRef(folderRef)) {
    return <Navigate to={providerUrl(providerId)} replace />
  }

  if (folderRef && folderQuery.status === 'ready' && folderQuery.folder === null && folderQuery.items.length === 0) {
    return <Navigate to={providerUrl(providerId)} replace />
  }

  const connected = providerMeta?.connected ?? false
  // The connection still exists but the provider rejected it; the folder shows the last synced catalog.
  const expired = connected && providerMeta?.lastError === 'RECONEXAO_NECESSARIA'
  const folders = folderQuery.items.filter((item) => item.kind === 'folder')
  const files = folderQuery.items.filter((item) => item.kind === 'file')
  const staleNotice = staleCatalogNotice(folderQuery.catalog, { reconnectShown: expired })
  const empty = folderQuery.status === 'ready' && folders.length === 0 && files.length === 0
  const pendingFolder = folderRef
    ? {
        ref: folderRef,
        name: location.state?.folderName ?? null,
        ancestry: location.state?.folderTrail ?? [],
      }
    : null
  const headerFolder = folderQuery.status === 'ready' ? folderQuery.folder : pendingFolder
  const breadcrumbItems = providerMeta
    ? buildProviderBreadcrumbItems({ provider: providerMeta, folder: headerFolder })
    : null

  function nameOverlay() {
    openOverlay({
      type: 'name',
      kind: 'folder',
      providerId,
      folderRef: folderRef ?? null,
    })
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
        providerId,
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
      providerName: providerMeta?.name ?? '',
      onError: (error) => setActionError(hubErrorMessage(error)),
    }
  }

  function folderMenuContext(item) {
    const color = folderColors.colorOf(providerId, item.ref)
    return {
      ...menuContext(item),
      colorPicker: {
        swatch: color.hex,
        panel: ({ close }) => (
          <FolderColorPalette
            selectedId={color.id}
            onPick={(id) => {
              folderColors.setColor(providerId, item.ref, id)
              close()
            }}
          />
        ),
      },
    }
  }

  function renderBody() {
    if (providersStatus === 'loading' || folderQuery.status === 'loading' || folderQuery.status === 'idle') {
      return <p className={styles.empty}>Carregando…</p>
    }

    if (providersStatus === 'error' || folderQuery.status === 'error') {
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

    if (!connected) {
      return (
        <>
          <p className={styles.empty}>Conecte {providerMeta?.name ?? 'este provedor'} para ver seus arquivos.</p>
          <button
            type="button"
            className={styles.loadMore}
            onClick={() =>
              navigate(ROUTES.settingsProviders, {
                state: settingsNavState({ pathname: window.location.pathname }),
              })
            }
          >
            Conectar
          </button>
        </>
      )
    }

    return (
      <>
        {expired ? (
          <>
            <p className={styles.empty} role="alert">
              O acesso ao {providerMeta?.name ?? 'provedor'} expirou e esta lista pode estar desatualizada.
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

        {folders.length > 0 ? (
          <ItemGrid label="Pastas">
              {folders.map((item, index) => (
                <StaggerItem
                  key={item.uiKey ?? item.ref}
                  index={index}
                  base={0.06}
                  step={0.04}
                  variants={rise}
                  className={folderViewStyles.wrap}
                >
                  <PendingAware
                    pending={item.pending}
                    className={folderViewStyles.tile}
                    render={(props) => (
                      <Link
                        {...props}
                        to={providerFolderUrl(providerId, item.ref)}
                        state={{ folderName: item.name, folderTrail: childFolderTrail(folderQuery.folder) }}
                      />
                    )}
                  >
                    <TileContent
                      art={<FolderArt color={folderColors.colorOf(providerId, item.ref).hex} />}
                      title={item.name}
                      subtitle={formatItemDate(item.modifiedAt) || 'Pasta'}
                    />
                  </PendingAware>
                  {item.pending ? null : (
                    <OverflowMenu
                      floating
                      hoverReveal
                      label={`Ações de ${item.name}`}
                      title={item.name}
                      items={folderMenuItems(item, folderMenuContext(item))}
                    />
                  )}
                </StaggerItem>
              ))}
          </ItemGrid>
        ) : null}

        {files.length > 0 ? (
          <ItemGrid label="Arquivos">
              {files.map((item, index) => (
                <StaggerItem
                  key={item.uiKey ?? item.ref}
                  index={index}
                  base={0.14}
                  step={0.03}
                  variants={rise}
                  className={folderViewStyles.wrap}
                >
                  <PendingAware
                    pending={item.pending}
                    className={folderViewStyles.tile}
                    render={(props) => (
                      <a
                        {...props}
                        href={providerFileUrl(providerId, item.ref)}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                  >
                    <TileContent
                      art={<FileSheet file={item} />}
                      title={item.name}
                      subtitle={formatItemDate(item.modifiedAt) || itemKindLabel(item)}
                    />
                  </PendingAware>
                  {item.pending ? null : (
                    <OverflowMenu
                      floating
                      hoverReveal
                      label={`Ações de ${item.name}`}
                      title={item.name}
                      items={fileMenuItems(item, menuContext(item))}
                    />
                  )}
                </StaggerItem>
              ))}
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

  if (!knownProvider && providersStatus === 'idle') {
    return <p className={styles.empty}>Carregando…</p>
  }

  return (
    <AppShell
      refreshKey={`${providerId}-${folderRef ?? 'root'}`}
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
                      onSelect: nameOverlay,
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
