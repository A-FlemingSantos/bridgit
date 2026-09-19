import { useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Cloud, FolderPlus, LayoutGrid, LayoutList, Layers, Plus, RefreshCw, Search, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import AnchoredSuspendedMenu from '../../../shared/components/SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import { providerFileUrl, providerUrl, ROUTES } from '../../../shared/config/routes.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import FileSheet from '../../spaces/components/FileSheet/FileSheet.jsx'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { fileMenuItems } from '../../spaces/components/entryActions.js'
import {
  hydrateRecents,
  hydrateShortcuts,
} from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import styles from './HomePage.module.css'

const rise = {
  hidden: { opacity: 0, y: 8 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function HomePage() {
  const { state, dispatch, openOverlay } = useHub()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const recentsView = state.recentsView === 'grid' ? 'grid' : 'list'
  const recents = hydrateRecents(state)
  const shortcuts = hydrateShortcuts(state)
  const normalized = query.trim().toLowerCase()

  const visibleShortcuts = useMemo(
    () =>
      normalized
        ? shortcuts.filter((file) => file.title.toLowerCase().includes(normalized))
        : shortcuts,
    [shortcuts, normalized],
  )
  const visibleRecents = useMemo(
    () =>
      normalized
        ? recents.filter((file) => file.title.toLowerCase().includes(normalized))
        : recents,
    [recents, normalized],
  )

  return (
    <AppShell refreshKey="home">
      <main className={styles.main}>
        <div className={styles.command}>
          <div className={styles.search}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar"
              aria-label="Buscar"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={styles.actions}>
            <UploadAction />
            <CreateAction />
            <button
              type="button"
              className={styles.action}
              onClick={() =>
                navigate(ROUTES.settingsProviders, { state: settingsNavState({ pathname: ROUTES.home }) })
              }
            >
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

        <div className={styles.body}>
          <aside className={styles.rail}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Provedores</h2>
              </header>
              <nav className={styles.providers} aria-label="Provedores">
                {state.providers.map((provider, index) => (
                  <motion.div
                    key={provider.id}
                    variants={rise}
                    initial="hidden"
                    animate="show"
                    custom={0.04 + index * 0.04}
                  >
                    <Link
                      to={providerUrl(provider.id)}
                      className={styles.provider}
                      aria-label={`${provider.name} Conectado`}
                    >
                      <ProviderMark id={provider.id} size={22} />
                      <span className={styles.providerMeta}>
                        <span className={styles.providerName}>{provider.name}</span>
                        <span className={styles.providerSub}>Conectado</span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </section>
          </aside>

          <div className={styles.workspace}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Atalhos</h2>
              </header>
              {visibleShortcuts.length === 0 ? (
                <p className={styles.empty}>Nenhum atalho.</p>
              ) : (
                <div className={styles.pins}>
                  {visibleShortcuts.map((file, index) => (
                    <motion.div
                      key={file.fileRef}
                      className={styles.cardWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.08 + index * 0.04}
                    >
                      <Link
                        to={providerFileUrl(file.providerId, file.fileRef)}
                        className={styles.pin}
                        aria-label={file.title}
                      >
                        <span className={styles.pinFace} aria-hidden="true">
                          <FileSheet />
                        </span>
                        <span className={styles.pinMeta}>
                          <span className={styles.pinTitle}>{file.title}</span>
                          <span className={styles.pinSub}>{file.provider}</span>
                        </span>
                      </Link>
                      <OverflowMenu
                        floating
                        hoverReveal
                        label={`Ações de ${file.title}`}
                        items={fileMenuItems(file, { openOverlay, dispatch, state })}
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
                    onClick={() => dispatch({ type: 'setRecentsView', view: 'list' })}
                  >
                    <LayoutList size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.viewButton}
                    aria-pressed={recentsView === 'grid'}
                    aria-label="Grade"
                    onClick={() => dispatch({ type: 'setRecentsView', view: 'grid' })}
                  >
                    <LayoutGrid size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
              </header>

              {visibleRecents.length === 0 ? (
                <p className={styles.empty}>Nada encontrado.</p>
              ) : recentsView === 'list' ? (
                <div className={styles.list}>
                  {visibleRecents.map((file, index) => (
                    <motion.div
                      key={file.fileRef}
                      className={styles.rowWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <Link
                        to={providerFileUrl(file.providerId, file.fileRef)}
                        className={styles.row}
                        aria-label={file.title}
                      >
                        <span className={styles.rowFace} aria-hidden="true">
                          <FileSheet compact />
                        </span>
                        <span className={styles.rowBody}>
                          <span className={styles.rowTitle}>{file.title}</span>
                          <span className={styles.rowSub}>
                            {file.kind} · {file.provider}
                          </span>
                        </span>
                        <span className={styles.rowWhen}>{file.when}</span>
                        <span className={styles.rowMark}>
                          <ProviderMark id={file.providerId} size={16} />
                        </span>
                      </Link>
                      <OverflowMenu
                        ghost
                        hoverReveal
                        label={`Ações de ${file.title}`}
                        items={fileMenuItems(file, { openOverlay, dispatch, state })}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className={styles.grid}>
                  {visibleRecents.map((file, index) => (
                    <motion.div
                      key={file.fileRef}
                      className={styles.cardWrap}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <Link
                        to={providerFileUrl(file.providerId, file.fileRef)}
                        className={styles.tile}
                        aria-label={file.title}
                      >
                        <span className={styles.tileFace} aria-hidden="true">
                          <FileSheet />
                        </span>
                        <span className={styles.tileMeta}>
                          <span className={styles.rowTitle}>{file.title}</span>
                          <span className={styles.rowSub}>
                            {file.kind} · {file.provider}
                          </span>
                        </span>
                      </Link>
                      <OverflowMenu
                        floating
                        hoverReveal
                        label={`Ações de ${file.title}`}
                        items={fileMenuItems(file, { openOverlay, dispatch, state })}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  )
}

function UploadAction() {
  const { state, dispatch } = useHub()
  const extrasId = useId()
  const triggerId = useId()
  const inputRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const providerRef = useRef(state.providers[0]?.id ?? null)
  const menu = useSuspendedMenu(state.providers.length, { menuRef })
  const items = state.providers.map((provider) => ({
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
          if (!providerId) return
          files.forEach((file) => {
            const title = file.name.replace(/\.[^.]+$/, '') || file.name
            const ext = file.name.split('.').pop()
            dispatch({
              type: 'createFile',
              title,
              providerId,
              kind: ext ? ext.toUpperCase() : 'PDF',
            })
          })
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
