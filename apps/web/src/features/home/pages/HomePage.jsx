import { useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Cloud, FolderPlus, LayoutGrid, LayoutList, Layers, Plus, RefreshCw, Search, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import AnchoredSuspendedMenu from '../../../shared/components/SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import { providerFileUrl, providerFolderUrl, providerUrl, ROUTES } from '../../../shared/config/routes.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import {
  useHubActions,
  useProviders,
  useRecents,
  useSearch,
  useShortcuts,
} from '../../../shared/hub/index.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileSheet from '../../spaces/components/FileSheet/FileSheet.jsx'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { fileMenuItems } from '../../spaces/components/entryActions.js'
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

function itemKindLabel(item) {
  if (item.extension) return item.extension.toUpperCase()
  if (item.mimeType) return item.mimeType.split('/').pop()?.toUpperCase() ?? 'Arquivo'
  return 'Arquivo'
}

function providerLabel(id) {
  return PROVIDER_LABELS[id] ?? id
}

export default function HomePage() {
  const { openOverlay } = useHub()
  const navigate = useNavigate()
  const actions = useHubActions()
  const { providers, status: providersStatus } = useProviders()
  const recentsQuery = useRecents()
  const shortcutsQuery = useShortcuts()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [recentsView, setRecentsView] = useState('list')
  const [actionError, setActionError] = useState(null)
  const search = useSearch(query)

  const shortcuts = shortcutsQuery.entries
  const recents = recentsQuery.entries
  const normalized = query.trim().toLowerCase()
  const searching = normalized.length >= 2

  const visibleShortcuts = useMemo(
    () =>
      searching
        ? shortcuts.filter((file) => file.name.toLowerCase().includes(normalized))
        : shortcuts,
    [shortcuts, normalized, searching],
  )
  const visibleRecents = useMemo(
    () =>
      searching
        ? recents.filter((file) => file.name.toLowerCase().includes(normalized))
        : recents,
    [recents, normalized, searching],
  )

  const searchGroups = useMemo(() => {
    if (!searching || search.status !== 'ready') return []
    const groups = new Map()
    search.results.forEach((item) => {
      const key = item.provider
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    })
    return [...groups.entries()]
  }, [search.results, search.status, searching])

  function menuContext(item) {
    return {
      openOverlay,
      actions,
      isShortcut: shortcutsQuery.isShortcut,
      providerName: providerLabel(item.provider),
      onError: (error) => setActionError(hubErrorMessage(error)),
    }
  }

  function openSettingsProviders() {
    navigate(ROUTES.settingsProviders, { state: settingsNavState({ pathname: ROUTES.home }) })
  }

  return (
    <AppShell refreshKey="home">
      <main className={styles.main}>
        <div className={styles.command}>
          <div className={styles.search}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <input
              id={searchId}
              name="search"
              type="search"
              placeholder="Buscar"
              aria-label="Buscar"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={styles.actions}>
            <UploadAction onError={setActionError} />
            <CreateAction />
            <button type="button" className={styles.action} onClick={openSettingsProviders}>
              <Cloud size={15} strokeWidth={1.6} aria-hidden="true" />
              Conectar
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => openOverlay({ type: 'composer', mode: 'create' })}
            >
              <RefreshCw size={15} strokeWidth={1.6} aria-hidden="true" />
              Espelhar
            </button>
          </div>
        </div>

        {actionError ? (
          <p className={styles.empty} role="alert">
            {actionError}
          </p>
        ) : null}

        {searching && (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2>Resultados</h2>
            </header>
            {search.status === 'loading' ? (
              <p className={styles.empty}>Buscando…</p>
            ) : search.status === 'error' ? (
              <p className={styles.empty} role="alert">
                {hubErrorMessage(search.error)}
              </p>
            ) : searchGroups.length === 0 ? (
              <p className={styles.empty}>Nada encontrado.</p>
            ) : (
              searchGroups.map(([providerId, items]) => {
                const providerResult = search.providers.find((entry) => entry.id === providerId)
                return (
                  <div key={providerId} className={styles.searchGroup}>
                    <h3>{providerLabel(providerId)}</h3>
                    {providerResult && !providerResult.ok ? (
                      <p className={styles.empty} role="alert">
                        {providerResult.error ?? 'Não foi possível buscar neste provedor.'}
                      </p>
                    ) : null}
                    <div className={styles.list}>
                      {items.map((item) =>
                        item.kind === 'folder' ? (
                          <Link
                            key={item.uiKey ?? item.ref}
                            to={providerFolderUrl(providerId, item.ref)}
                            className={styles.row}
                          >
                            <span className={styles.rowTitle}>{item.name}</span>
                          </Link>
                        ) : (
                          <a
                            key={item.uiKey ?? item.ref}
                            href={providerFileUrl(providerId, item.ref)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.row}
                          >
                            <span className={styles.rowTitle}>{item.name}</span>
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {!searching ? (
        <div className={styles.body}>
          <aside className={styles.rail}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Provedores</h2>
              </header>
              {providersStatus === 'loading' || providersStatus === 'idle' ? (
                <p className={styles.empty}>Carregando…</p>
              ) : providersStatus === 'error' ? (
                <>
                  <p className={styles.empty} role="alert">
                    Não foi possível carregar os provedores.
                  </p>
                  <button type="button" className={styles.inlineAction} onClick={openSettingsProviders}>
                    Conectar
                  </button>
                </>
              ) : (
                <nav className={styles.providers} aria-label="Provedores">
                  {providers.map((provider, index) => (
                    <motion.div
                      key={provider.id}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.04 + index * 0.04}
                    >
                      {provider.connected ? (
                        <Link
                          to={providerUrl(provider.id)}
                          className={styles.provider}
                          aria-label={`${provider.name} Conectado`}
                        >
                          <ProviderMark id={provider.id} size={22} />
                          <span className={styles.providerMeta}>
                            <span className={styles.providerName}>{provider.name}</span>
                            <span className={styles.providerSub}>
                              {provider.account?.email ?? 'Conectado'}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <Link
                          to={ROUTES.settingsProviders}
                          state={settingsNavState({ pathname: ROUTES.home })}
                          className={styles.provider}
                          aria-label={`${provider.name} Desconectado`}
                        >
                          <ProviderMark id={provider.id} size={22} />
                          <span className={styles.providerMeta}>
                            <span className={styles.providerName}>{provider.name}</span>
                            <span className={styles.providerSub}>Conectar</span>
                          </span>
                        </Link>
                      )}
                    </motion.div>
                  ))}
                </nav>
              )}
            </section>
          </aside>

          <div className={styles.workspace}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Atalhos</h2>
              </header>
              {shortcutsQuery.status === 'loading' ? (
                <p className={styles.empty}>Carregando…</p>
              ) : shortcutsQuery.status === 'error' ? (
                <p className={styles.empty} role="alert">
                  {hubErrorMessage(shortcutsQuery.error)}
                </p>
              ) : visibleShortcuts.length === 0 ? (
                <p className={styles.empty}>Nenhum atalho.</p>
              ) : (
                <div className={styles.pins}>
                  {visibleShortcuts.map((file, index) => (
                    <motion.div
                      key={`${file.provider}-${file.ref}`}
                      className={styles.cardWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.08 + index * 0.04}
                    >
                      <a
                        href={providerFileUrl(file.provider, file.ref)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.pin}
                        aria-label={file.name}
                      >
                        <span className={styles.pinFace} aria-hidden="true">
                          <FileSheet />
                        </span>
                        <span className={styles.pinMeta}>
                          <span className={styles.pinTitle}>{file.name}</span>
                          <span className={styles.pinSub}>{providerLabel(file.provider)}</span>
                        </span>
                      </a>
                      <OverflowMenu
                        floating
                        hoverReveal
                        label={`Ações de ${file.name}`}
                        items={fileMenuItems(
                          {
                            provider: file.provider,
                            ref: file.ref,
                            name: file.name,
                            parentRef: null,
                            mimeType: file.mimeType,
                            extension: file.extension,
                          },
                          menuContext(file),
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h1>Recentes</h1>
                <div className={styles.viewToggle} role="group" aria-label="Visualização dos recentes">
                  <button
                    type="button"
                    className={styles.viewButton}
                    aria-pressed={recentsView === 'list'}
                    aria-label="Lista"
                    onClick={() => setRecentsView('list')}
                  >
                    <LayoutList size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.viewButton}
                    aria-pressed={recentsView === 'grid'}
                    aria-label="Grade"
                    onClick={() => setRecentsView('grid')}
                  >
                    <LayoutGrid size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
              </header>

              {recentsQuery.status === 'loading' ? (
                <p className={styles.empty}>Carregando…</p>
              ) : recentsQuery.status === 'error' ? (
                <p className={styles.empty} role="alert">
                  {hubErrorMessage(recentsQuery.error)}
                </p>
              ) : visibleRecents.length === 0 ? (
                <p className={styles.empty}>Nada encontrado.</p>
              ) : recentsView === 'list' ? (
                <div className={styles.list}>
                  {visibleRecents.map((file, index) => (
                    <motion.div
                      key={`${file.provider}-${file.ref}`}
                      className={styles.rowWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <a
                        href={providerFileUrl(file.provider, file.ref)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.row}
                        aria-label={file.name}
                      >
                        <span className={styles.rowFace} aria-hidden="true">
                          <FileSheet compact />
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
                        items={fileMenuItems(
                          {
                            provider: file.provider,
                            ref: file.ref,
                            name: file.name,
                            parentRef: null,
                            mimeType: file.mimeType,
                            extension: file.extension,
                          },
                          menuContext(file),
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className={styles.grid}>
                  {visibleRecents.map((file, index) => (
                    <motion.div
                      key={`${file.provider}-${file.ref}`}
                      className={styles.cardWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <a
                        href={providerFileUrl(file.provider, file.ref)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.tile}
                        aria-label={file.name}
                      >
                        <span className={styles.tileFace} aria-hidden="true">
                          <FileSheet />
                        </span>
                        <span className={styles.tileMeta}>
                          <span className={styles.rowTitle}>{file.name}</span>
                          <span className={styles.rowSub}>
                            {itemKindLabel(file)} · {providerLabel(file.provider)}
                          </span>
                        </span>
                      </a>
                      <OverflowMenu
                        floating
                        hoverReveal
                        label={`Ações de ${file.name}`}
                        items={fileMenuItems(
                          {
                            provider: file.provider,
                            ref: file.ref,
                            name: file.name,
                            parentRef: null,
                            mimeType: file.mimeType,
                            extension: file.extension,
                          },
                          menuContext(file),
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
        ) : null}
      </main>
    </AppShell>
  )
}

function UploadAction({ onError }) {
  const actions = useHubActions()
  const { providers } = useProviders()
  const extrasId = useId()
  const triggerId = useId()
  const inputRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const connectedProviders = providers.filter((provider) => provider.connected)
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
        className={styles.action}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={extrasId}
        onClick={menu.toggleMenu}
        disabled={connectedProviders.length === 0}
      >
        <Upload size={15} strokeWidth={1.6} aria-hidden="true" />
        Enviar
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
            .catch((error) => onError(hubErrorMessage(error)))
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
        className={styles.action}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={extrasId}
        onClick={menu.toggleMenu}
      >
        <Plus size={15} strokeWidth={1.6} aria-hidden="true" />
        Criar
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
