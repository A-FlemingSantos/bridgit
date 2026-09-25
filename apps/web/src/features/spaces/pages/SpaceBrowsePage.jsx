import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FilePen, FolderPlus, PenLine, Stamp, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import {
  ROUTES,
  providerFileUrl,
  providerFolderUrl,
  providerUrl,
} from '../../../shared/config/routes.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import { useFolder, useHubActions, useProviders, useShortcuts } from '../../../shared/hub/index.js'
import { isTempRef } from '../../../shared/hub/hubCache.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { buildProviderBreadcrumbItems, childFolderTrail } from '../buildProviderBreadcrumb.js'
import folderMark from '../assets/folder.svg'
import { fileMenuItems, folderMenuItems } from '../components/entryActions.js'
import styles from './SpaceBrowsePage.module.css'

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
  const folderQuery = useFolder(providerId, folderRef ?? null)
  const uploadRef = useRef(null)
  const [actionError, setActionError] = useState(null)

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
  const folders = folderQuery.items.filter((item) => item.kind === 'folder')
  const files = folderQuery.items.filter((item) => item.kind === 'file')
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

    setActionError(null)
    try {
      await actions.uploadFiles({
        providerId,
        parentRef: folderRef ?? null,
        files: selected,
      })
    } catch (error) {
      setActionError(hubErrorMessage(error))
    }
  }

  function menuContext(item) {
    return {
      openOverlay,
      actions,
      isShortcut,
      providerName: providerMeta?.name ?? '',
      onError: (error) => setActionError(hubErrorMessage(error)),
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
        {empty ? <p className={styles.empty}>Nenhum arquivo aqui ainda</p> : null}

        {folders.length > 0 ? (
          <section className={styles.section}>
            <h2>Pastas</h2>
            <div className={styles.grid}>
              {folders.map((item, index) => (
                <motion.div
                  key={item.uiKey ?? item.ref}
                  className={styles.wrap}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.06 + index * 0.04}
                >
                  <PendingAware
                    pending={item.pending}
                    className={styles.item}
                    render={(props) => (
                      <Link
                        {...props}
                        to={providerFolderUrl(providerId, item.ref)}
                        state={{ folderName: item.name, folderTrail: childFolderTrail(folderQuery.folder) }}
                      />
                    )}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <span
                        className={styles.folderMark}
                        style={{ '--folder-mark': `url("${folderMark}")` }}
                      />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.name}</span>
                      <span className={styles.itemSub}>Pasta · {providerMeta.name}</span>
                    </span>
                  </PendingAware>
                  {item.pending ? null : (
                    <OverflowMenu
                      floating
                      hoverReveal
                      label={`Ações de ${item.name}`}
                      items={folderMenuItems(item, menuContext(item))}
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}

        {files.length > 0 ? (
          <section className={styles.section}>
            <h2>Arquivos</h2>
            <div className={styles.grid}>
              {files.map((item, index) => (
                <motion.div
                  key={item.uiKey ?? item.ref}
                  className={styles.wrap}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.14 + index * 0.03}
                >
                  <PendingAware
                    pending={item.pending}
                    className={styles.item}
                    render={(props) => (
                      <a
                        {...props}
                        href={providerFileUrl(providerId, item.ref)}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <FileSheet />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.name}</span>
                      <span className={styles.itemSub}>
                        {itemKindLabel(item)} · {providerMeta.name}
                      </span>
                    </span>
                  </PendingAware>
                  {item.pending ? null : (
                    <OverflowMenu
                      floating
                      hoverReveal
                      label={`Ações de ${item.name}`}
                      items={fileMenuItems(item, menuContext(item))}
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </section>
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
            items={breadcrumbItems}
            trailing={
              connected ? (
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
          <SpaceViewHeader trailing={null} />
        )
      }
    >
      <main className={styles.main}>
        <input ref={uploadRef} type="file" hidden multiple onChange={(event) => void onUpload(event)} />
        {actionError ? (
          <p className={styles.empty} role="alert">
            {actionError}
          </p>
        ) : null}
        {renderBody()}
      </main>
    </AppShell>
  )
}
