import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Clock, FolderPlus, Layers } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import StaggerItem from '../../../shared/components/motion/StaggerItem.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import AnchoredSuspendedMenu from '../../../shared/components/SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import { providerFileUrl, providerFolderUrl, ROUTES } from '../../../shared/config/routes.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import {
  useHubActions,
  useProviders,
  usePublicLinks,
  useRecents,
  useSearch,
  useShortcuts,
} from '../../../shared/hub/index.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileSheet from '../../spaces/components/FileSheet/FileSheet.jsx'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { fileMenuItems } from '../../spaces/components/entryActions.jsx'
import HomeSidebar from '../components/HomeSidebar/HomeSidebar.jsx'
import { formatRelativeTime } from '../formatRelativeTime.js'
import styles from './HomePage.module.css'

const rise = {
  hidden: { opacity: 0, y: 8 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

const PROVIDER_LABELS = {
  onedrive: 'OneDrive',
  'google-drive': 'Google Drive',
  dropbox: 'Dropbox',
}

const ALL_PROVIDERS = 'all'

function itemKindLabel(item) {
  if (item.extension) return item.extension.toUpperCase()
  if (item.mimeType) return item.mimeType.split('/').pop()?.toUpperCase() ?? 'Arquivo'
  return 'Arquivo'
}

function providerLabel(id) {
  return PROVIDER_LABELS[id] ?? id
}

function entryMenuFile(file) {
  return {
    provider: file.provider,
    ref: file.ref,
    name: file.name,
    parentRef: undefined,
    mimeType: file.mimeType,
    extension: file.extension,
  }
}

export default function HomePage() {
  const { openOverlay } = useHub()
  const navigate = useNavigate()
  const actions = useHubActions()
  const recentsQuery = useRecents()
  const shortcutsQuery = useShortcuts()
  const publicLinksQuery = usePublicLinks()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [recentsView, setRecentsView] = useState('grid')
  const [providerFilter, setProviderFilter] = useState(ALL_PROVIDERS)
  const [actionError, setActionError] = useState(null)
  const operationError = actions.getOperationError?.() ?? null
  useEffect(() => { if (operationError) setActionError(operationError) }, [operationError])
  const [failedUploads, setFailedUploads] = useState([])
  const [uploadProviderId, setUploadProviderId] = useState(null)
  const search = useSearch(query)
  const location = useLocation()
  const searchRef = useRef(null)

  // The rail's search button lands here asking for the field to be focused.
  useEffect(() => {
    if (location.state?.focusSearch) searchRef.current?.focus()
  }, [location.key, location.state])

  const recents = recentsQuery.entries
  const normalized = query.trim().toLowerCase()
  const searching = normalized.length >= 2

  const recentProviders = useMemo(
    () => [...new Set(recents.map((file) => file.provider))],
    [recents],
  )
  const activeFilter = recentProviders.includes(providerFilter) ? providerFilter : ALL_PROVIDERS
  const visibleRecents = activeFilter === ALL_PROVIDERS
    ? recents
    : recents.filter((file) => file.provider === activeFilter)

  const searchGroups = useMemo(() => {
    if (!searching || search.status !== 'ready') return []
    const groups = new Map()
    ;(search.results ?? []).forEach((item) => {
      const key = item.provider
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    })
    const queried = Array.isArray(search.providers) ? search.providers : []
    if (queried.length === 0) return [...groups.entries()].map(([id, items]) => ({ id, ok: true, error: null, items }))
    return queried.map((entry) => ({
      id: entry.id,
      ok: entry.ok !== false,
      error: entry.error ?? null,
      items: groups.get(entry.id) ?? [],
    }))
  }, [search.results, search.providers, search.status, searching])

  const failedProviders = searchGroups.filter((group) => !group.ok)
  const succeededGroups = searchGroups.filter((group) => group.ok)
  const foundCount = succeededGroups.reduce((total, group) => total + group.items.length, 0)
  const allFailed = searchGroups.length > 0 && failedProviders.length === searchGroups.length
  const someFailed = failedProviders.length > 0 && !allFailed

  function retrySearch() {
    const current = query
    setQuery('')
    window.setTimeout(() => setQuery(current), 0)
  }

  function menuContext(item) {
    return {
      openOverlay,
      actions,
      isShortcut: shortcutsQuery.isShortcut,
      hasPublicLink: publicLinksQuery.isPublic,
      navigate,
      providerName: providerLabel(item.provider),
      onError: (error) => setActionError(hubErrorMessage(error)),
    }
  }

  function handleUploadError(providerId, files, error) {
    setActionError(hubErrorMessage(error))
    const failed = Array.isArray(error?.failed) ? error.failed.filter(Boolean) : []
    setFailedUploads(failed)
    setUploadProviderId(providerId)
  }

  const retryableUploads = failedUploads.filter((entry) => entry?.ambiguous !== true)
  const pendingVerificationUploads = failedUploads.filter((entry) => entry?.ambiguous === true)

  async function retryFailedUploads() {
    if (!uploadProviderId || retryableUploads.length === 0) return
    const providerId = uploadProviderId
    const files = retryableUploads.map((entry) => entry?.file ?? entry).filter(Boolean)
    setActionError(null)
    setFailedUploads([])
    try {
      await actions.uploadFiles({ providerId, parentRef: null, files })
    } catch (error) {
      handleUploadError(providerId, files, error)
    }
  }

  function openSettingsProviders() {
    navigate(ROUTES.settingsProviders, { state: settingsNavState({ pathname: ROUTES.home }) })
  }

  return (
    <AppShell
      refreshKey="home"
      sidebar={(
        <HomeSidebar
          menuContext={menuContext}
          onConnect={openSettingsProviders}
          onError={(error) => setActionError(hubErrorMessage(error))}
        />
      )}
    >
      <main className={styles.main}>
        <div className={styles.search}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="currentColor"
            viewBox="0 0 24 24"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <path d="M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z" />
          </svg>
          <input
            id={searchId}
            ref={searchRef}
            name="search"
            type="search"
            placeholder="Buscar em todas as nuvens"
            aria-label="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <CreateAction />
          <UploadAction onUploadError={handleUploadError} />
          <button
            type="button"
            className={styles.card}
            onClick={() => openOverlay({ type: 'name', kind: 'folder' })}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="currentColor"
              viewBox="0 0 24 24"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d="M20 18h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2Zm-6 2H4v-2h10v2ZM4 18H2V6h2v12Zm18-4h-2V8h2v6ZM12 6h8v2H10V6H4V4h8v2Z" />
            </svg>
            <span className={styles.cardLabel}>Nova pasta</span>
          </button>
          <button type="button" className={styles.card} onClick={openSettingsProviders}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="currentColor"
              viewBox="0 0 24 24"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d="M10 4h6v2h-6zM8 6h2v2H8zm8 0h2v2h-2zM4 8h4v2H4zm14 0h2v2h-2zM2 10h2v2H2zm6 0h2v2H8zm10 0h4v2h-4zM0 12h2v6H0zm16 0h2v2h-2zm6 0h2v2h-2zm-2 4h2v2h-2zM2 18h14v2H2zm16 0h6v2h-6zm2 2h2v2h-2z" />
            </svg>
            <span className={styles.cardLabel}>Conectar nuvem</span>
          </button>
        </div>

        {actionError ? (
          <div className={styles.notice}>
            <p className={styles.empty} role="alert">
              {actionError}
            </p>
            {pendingVerificationUploads.length > 0 ? (
              <p className={styles.empty} role="status">
                O envio pode ter sido concluído; a pasta está sendo atualizada.
              </p>
            ) : null}
            {retryableUploads.length > 0 && uploadProviderId ? (
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() => void retryFailedUploads()}
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

        {searching ? (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.heading}>Resultados</h2>
            </header>
            {search.status === 'loading' || search.status === 'idle' ? (
              <p className={styles.empty}>Buscando…</p>
            ) : search.status === 'error' ? (
              <>
                <p className={styles.empty} role="alert">
                  {hubErrorMessage(search.error)}
                </p>
                <button type="button" className={styles.inlineAction} onClick={retrySearch}>
                  Tentar novamente
                </button>
              </>
            ) : allFailed ? (
              <>
                <p className={styles.empty} role="alert">
                  Não foi possível buscar.
                </p>
                <button type="button" className={styles.inlineAction} onClick={retrySearch}>
                  Tentar novamente
                </button>
              </>
            ) : foundCount === 0 && !someFailed ? (
              <p className={styles.empty}>Nada encontrado.</p>
            ) : (
              <>
                {someFailed ? (
                  <p className={styles.empty} role="status">
                    Alguns provedores não responderam. Mostrando resultados parciais.
                  </p>
                ) : null}
                {searchGroups.map((group) => (
                  <div key={group.id} className={styles.searchGroup}>
                    <h3>{providerLabel(group.id)}</h3>
                    {!group.ok ? (
                      <p className={styles.empty} role="alert">
                        {`Não foi possível buscar em ${providerLabel(group.id)}.`}
                      </p>
                    ) : group.items.length === 0 ? (
                      <p className={styles.empty}>Nenhum resultado</p>
                    ) : (
                      <div className={styles.list}>
                        {group.items.map((item) =>
                          item.kind === 'folder' ? (
                            <Link
                              key={item.uiKey ?? item.ref}
                              to={providerFolderUrl(group.id, item.ref)}
                              className={styles.row}
                            >
                              <span className={styles.rowTitle}>{item.name}</span>
                            </Link>
                          ) : (
                            <a
                              key={item.uiKey ?? item.ref}
                              href={providerFileUrl(group.id, item.ref)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.row}
                            >
                              <span className={styles.rowTitle}>{item.name}</span>
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>
        ) : (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h1 className={styles.heading}>Recentes</h1>
            </header>

            <div className={styles.toolbar}>
              {recentProviders.length > 1 ? (
                <div className={styles.chips} role="group" aria-label="Filtrar recentes por provedor">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={activeFilter === ALL_PROVIDERS}
                    onClick={() => setProviderFilter(ALL_PROVIDERS)}
                  >
                    Todos
                  </button>
                  {recentProviders.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={styles.chip}
                      aria-pressed={activeFilter === id}
                      onClick={() => setProviderFilter(id)}
                    >
                      {providerLabel(id)}
                    </button>
                  ))}
                </div>
              ) : <span />}
              <div className={styles.viewToggle} role="group" aria-label="Visualização dos recentes">
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-pressed={recentsView === 'grid'}
                  aria-label="Grade"
                  onClick={() => setRecentsView('grid')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    shapeRendering="crispEdges"
                    aria-hidden="true"
                  >
                    <path d="M20 4h-7v7h7V4h2v16h-2v-7h-7v7h7v2H4v-2h7v-7H4v7H2V4h2v7h7V4H4V2h16v2Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-pressed={recentsView === 'list'}
                  aria-label="Lista"
                  onClick={() => setRecentsView('list')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    shapeRendering="crispEdges"
                    aria-hidden="true"
                  >
                    <path d="M10 5h12v2H10zm0 4h8v2h-8zm0 4h12v2H10zm0 4h8v2h-8zM4 7v2h2V7H4Zm4 4H2V5h6v6Zm-6 2h6v2H2zm0 4h6v2H2zm0 0v-2h2v2zm4 0v-2h2v2z" />
                  </svg>
                </button>
              </div>
            </div>

            {recentsQuery.status === 'loading' ? (
              <p className={styles.empty}>Carregando…</p>
            ) : recentsQuery.status === 'error' ? (
              <p className={styles.empty} role="alert">
                {hubErrorMessage(recentsQuery.error)}
              </p>
            ) : visibleRecents.length === 0 ? (
              <div className={styles.emptyState}>
                <Clock size={20} strokeWidth={1.6} aria-hidden="true" />
                <p className={styles.emptyTitle}>Nada encontrado.</p>
                <p className={styles.empty}>Os arquivos que você abrir em qualquer nuvem aparecem aqui.</p>
              </div>
            ) : recentsView === 'list' ? (
              <div className={styles.list}>
                {visibleRecents.map((file, index) => (
                  <StaggerItem
                    key={`${file.provider}-${file.ref}`}
                    index={index}
                    base={0.04}
                    step={0.025}
                    variants={rise}
                    className={styles.rowWrap}
                  >
                    <a
                      href={providerFileUrl(file.provider, file.ref)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.row}
                      aria-label={file.name}
                    >
                      <span className={styles.rowFace} aria-hidden="true">
                        <FileSheet compact file={file} />
                      </span>
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle}>{file.name}</span>
                        <span className={styles.rowSub}>
                          {itemKindLabel(file)} · {providerLabel(file.provider)}
                        </span>
                      </span>
                      <span className={styles.rowWhen}>{formatRelativeTime(file.openedAt)}</span>
                      <span className={styles.rowMark}>
                        <ProviderMark id={file.provider} size={16} />
                      </span>
                    </a>
                    <OverflowMenu
                      ghost
                      hoverReveal
                      label={`Ações de ${file.name}`}
                      title={file.name}
                      items={fileMenuItems(entryMenuFile(file), menuContext(file))}
                    />
                  </StaggerItem>
                ))}
              </div>
            ) : (
              <div className={styles.grid}>
                {visibleRecents.map((file, index) => (
                  <StaggerItem
                    key={`${file.provider}-${file.ref}`}
                    index={index}
                    base={0.04}
                    step={0.025}
                    variants={rise}
                    className={styles.cardWrap}
                  >
                    <a
                      href={providerFileUrl(file.provider, file.ref)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.tile}
                      aria-label={file.name}
                    >
                      <span className={styles.tileFace} aria-hidden="true">
                        <FileSheet file={file} />
                        <span className={styles.tileMark}>
                          <ProviderMark id={file.provider} size={14} />
                        </span>
                      </span>
                      <span className={styles.tileMeta}>
                        <span className={styles.tileTitle}>{file.name}</span>
                        <span className={styles.rowSub}>
                          {itemKindLabel(file)} · {formatRelativeTime(file.openedAt)}
                        </span>
                      </span>
                    </a>
                    <OverflowMenu
                      floating
                      hoverReveal
                      label={`Ações de ${file.name}`}
                      title={file.name}
                      items={fileMenuItems(entryMenuFile(file), menuContext(file))}
                    />
                  </StaggerItem>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </AppShell>
  )
}

function UploadAction({ onUploadError }) {
  const actions = useHubActions()
  const { providers } = useProviders()
  const extrasId = useId()
  const triggerId = useId()
  const inputRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  // An expired connection cannot receive uploads until it is reconnected.
  const connectedProviders = providers.filter(
    (provider) => provider.connected && provider.lastError !== 'RECONEXAO_NECESSARIA',
  )
  const providerRef = useRef(connectedProviders[0]?.id ?? null)
  const menu = useSuspendedMenu(connectedProviders.length, { menuRef })
  const items = connectedProviders.map((provider) => ({
    id: provider.id,
    label: provider.name,
    onSelect: () => {
      menu.closeMenu()
      providerRef.current = provider.id
      inputRef.current?.click()
    },
  }))

  return (
    <div className={styles.actionDock} ref={menu.dockRef}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={[styles.card, styles.cardOutline].join(' ')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={extrasId}
        onClick={menu.toggleMenu}
        disabled={connectedProviders.length === 0}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="currentColor"
          viewBox="0 0 24 24"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path d="M19 21H5v-2h14v2ZM5 19H3v-4h2v4Zm16 0h-2v-4h2v4ZM13 5h2v2h2v2h-4v8h-2V9H7V7h2V5h2V3h2v2Z" />
        </svg>
        <span className={styles.cardLabel}>Enviar</span>
      </button>
      <AnchoredSuspendedMenu
        id={extrasId}
        labelledBy={triggerId}
        open={menu.open}
        closing={menu.closing}
        items={items}
        triggerRef={triggerRef}
        hostRef={triggerRef}
        panelRef={menuRef}
        prefer="below"
      />
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          const providerId = providerRef.current
          if (!providerId || !files.length) return
          void actions
            .uploadFiles({ providerId, parentRef: null, files })
            .catch((error) => onUploadError?.(providerId, files, error))
        }}
      />
    </div>
  )
}

function CreateAction() {
  const { openOverlay } = useHub()
  const extrasId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menu = useSuspendedMenu(2, { menuRef })
  const items = [
    {
      id: 'space',
      label: 'Novo space',
      icon: Layers,
      onSelect: () => {
        menu.closeMenu()
        openOverlay({ type: 'composer', mode: 'create' })
      },
    },
    {
      id: 'folder',
      label: 'Nova pasta',
      icon: FolderPlus,
      onSelect: () => {
        menu.closeMenu()
        openOverlay({ type: 'name', kind: 'folder' })
      },
    },
  ]

  return (
    <div className={styles.actionDock} ref={menu.dockRef}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={[styles.card, styles.cardPrimary].join(' ')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={extrasId}
        onClick={menu.toggleMenu}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="currentColor"
          viewBox="0 0 24 24"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path d="M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z" />
        </svg>
        <span className={styles.cardLabel}>Criar</span>
      </button>
      <AnchoredSuspendedMenu
        id={extrasId}
        labelledBy={triggerId}
        open={menu.open}
        closing={menu.closing}
        items={items}
        triggerRef={triggerRef}
        hostRef={triggerRef}
        panelRef={menuRef}
        prefer="below"
      />
    </div>
  )
}
