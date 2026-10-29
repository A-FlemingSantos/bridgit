import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import AppOverlay, { overlayStyles } from '../../../shared/components/AppOverlay/AppOverlay.jsx'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import StaggerItem from '../../../shared/components/motion/StaggerItem.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import AnchoredSuspendedMenu from '../../../shared/components/SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import { driveFileUrl, driveFolderUrl, ROUTES } from '../../../shared/config/routes.js'
import { fileNavState } from '../../../shared/utils/fileOverlay.js'
import { settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import {
  useConnections,
  useHubActions,
  usePublicLinks,
  useRecents,
  useSearch,
  useShortcuts,
} from '../../../shared/hub/index.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import FileThumb from '../../spaces/components/FileThumb/FileThumb.jsx'
import FolderArt from '../../spaces/components/FolderArt/FolderArt.jsx'
import FolderColorPalette from '../../spaces/components/FolderColorPalette/FolderColorPalette.jsx'
import { useFolderColors } from '../../spaces/folderColors.js'
import { PixelFileEmpty, PixelFilePlus, PixelFolder, PixelFolderPlus } from '../../../shared/components/PixelIcons/PixelIcons.jsx'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import ProviderStrip from '../../spaces/components/ProviderStrip/ProviderStrip.jsx'
import { fileMenuItems, folderMenuItems } from '../../spaces/components/entryActions.jsx'
import { connectionLabel } from '../../spaces/connectionLabel.js'
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
  if (item.kind === 'folder') return 'Pasta'
  if (item.extension) return item.extension.toUpperCase()
  if (item.mimeType) return item.mimeType.split('/').pop()?.toUpperCase() ?? 'Arquivo'
  return 'Arquivo'
}

function providerLabel(id) {
  return PROVIDER_LABELS[id] ?? id
}

function entryMenuFile(file) {
  return {
    connectionId: file.connectionId,
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
  // Recents and search results share the grid/list choice.
  const [view, setView] = useState('grid')
  const [accountFilter, setAccountFilter] = useState(ALL_PROVIDERS)
  const [searchFilter, setSearchFilter] = useState(ALL_PROVIDERS)
  const [actionError, setActionError] = useState(null)
  const operationError = actions.getOperationError?.() ?? null
  useEffect(() => { if (operationError) setActionError(operationError) }, [operationError])
  const [failedUploads, setFailedUploads] = useState([])
  const [uploadConnectionId, setUploadConnectionId] = useState(null)
  const search = useSearch(query)
  const { connections } = useConnections()
  const location = useLocation()
  const searchRef = useRef(null)

  // The rail's search button lands here asking for the field to be focused.
  useEffect(() => {
    if (location.state?.focusSearch) searchRef.current?.focus()
  }, [location.key, location.state])

  const recents = recentsQuery.entries
  const normalized = query.trim().toLowerCase()
  const searching = normalized.length >= 2

  // A cloud account is what the lists are split by. Its name is the provider name, plus the account e-mail
  // when that provider has several accounts.
  function accountName(connectionId, provider) {
    const connection = connections.find((item) => item.connectionId === connectionId)
    return connection ? connectionLabel(connection, connections) : providerLabel(provider)
  }

  const recentAccounts = useMemo(() => accountsOf(recents), [recents])
  const activeFilter = recentAccounts.some((account) => account.connectionId === accountFilter) ? accountFilter : ALL_PROVIDERS
  const visibleRecents = activeFilter === ALL_PROVIDERS
    ? recents
    : recents.filter((file) => file.connectionId === activeFilter)

  const searchResults = useMemo(
    () => (searching && search.status === 'ready' ? search.results ?? [] : []),
    [search.results, search.status, searching],
  )
  const searchAccounts = useMemo(() => accountsOf(searchResults), [searchResults])
  const activeSearchFilter = searchAccounts.some((account) => account.connectionId === searchFilter) ? searchFilter : ALL_PROVIDERS
  const visibleResults = activeSearchFilter === ALL_PROVIDERS
    ? searchResults
    : searchResults.filter((item) => item.connectionId === activeSearchFilter)

  // Each queried account answers on its own: one can fail, or still be syncing, while another finds files.
  const queried = searching && search.status === 'ready' && Array.isArray(search.providers) ? search.providers : []
  const failedAccounts = queried.filter((entry) => entry.ok === false)
  const syncingAccounts = queried.filter((entry) => entry.ok !== false && entry.catalog?.coverage === 'partial')
  const allFailed = queried.length > 0 && failedAccounts.length === queried.length
  const someFailed = failedAccounts.length > 0 && !allFailed

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
      location,
      providerName: accountName(item.connectionId, item.provider),
      onError: (error) => setActionError(hubErrorMessage(error)),
    }
  }

  function handleUploadError(connectionId, files, error) {
    setActionError(hubErrorMessage(error))
    const failed = Array.isArray(error?.failed) ? error.failed.filter(Boolean) : []
    setFailedUploads(failed)
    setUploadConnectionId(connectionId)
  }

  const retryableUploads = failedUploads.filter((entry) => entry?.ambiguous !== true)
  const pendingVerificationUploads = failedUploads.filter((entry) => entry?.ambiguous === true)

  async function retryFailedUploads() {
    if (!uploadConnectionId || retryableUploads.length === 0) return
    const connectionId = uploadConnectionId
    const files = retryableUploads.map((entry) => entry?.file ?? entry).filter(Boolean)
    setActionError(null)
    setFailedUploads([])
    try {
      await actions.uploadFiles({ connectionId, parentRef: null, files })
    } catch (error) {
      handleUploadError(connectionId, files, error)
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
            {retryableUploads.length > 0 && uploadConnectionId ? (
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
            ) : (
              <>
                {someFailed ? (
                  <p className={styles.empty} role="status">
                    Alguns provedores não responderam. Mostrando resultados parciais.
                  </p>
                ) : null}
                {failedAccounts.map((entry) => (
                  <p key={entry.connectionId ?? entry.id} className={styles.empty} role="alert">
                    {`Não foi possível buscar em ${accountName(entry.connectionId, entry.id)}.`}
                  </p>
                ))}
                {syncingAccounts.map((entry) => (
                  <p key={entry.connectionId ?? entry.id} className={styles.empty} role="status">
                    {`Ainda sincronizando ${accountName(entry.connectionId, entry.id)}. Os resultados podem estar incompletos.`}
                  </p>
                ))}
                {searchResults.length === 0 ? (
                  <p className={styles.empty}>Nada encontrado.</p>
                ) : (
                  <>
                    <ItemsToolbar
                      accounts={searchAccounts}
                      filter={activeSearchFilter}
                      onFilter={setSearchFilter}
                      filterLabel="Filtrar resultados por conta"
                      view={view}
                      onView={setView}
                      viewLabel="Visualização dos resultados"
                      accountName={accountName}
                    />
                    <ItemsLayout
                      items={visibleResults}
                      view={view}
                      when={(item) => item.modifiedAt}
                      accountName={accountName}
                      menuContext={menuContext}
                    />
                  </>
                )}
              </>
            )}
          </section>
        ) : (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h1 className={styles.heading}>Recentes</h1>
            </header>

            <ItemsToolbar
              accounts={recentAccounts}
              filter={activeFilter}
              onFilter={setAccountFilter}
              filterLabel="Filtrar recentes por provedor"
              view={view}
              onView={setView}
              viewLabel="Visualização dos recentes"
              accountName={accountName}
            />

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
            ) : (
              <ItemsLayout
                items={visibleRecents}
                view={view}
                when={(file) => file.openedAt}
                accountName={accountName}
                menuContext={menuContext}
              />
            )}
          </section>
        )}
      </main>
    </AppShell>
  )
}

// The accounts that have at least one of the items, in order of first appearance.
function accountsOf(items) {
  return [...new Map(items.map((item) => [item.connectionId, item.provider])).entries()]
    .map(([connectionId, provider]) => ({ connectionId, provider }))
}

// Account pills (only when the items come from more than one account) and the grid/list switch.
function ItemsToolbar({ accounts, filter, onFilter, filterLabel, view, onView, viewLabel, accountName }) {
  return (
    <div className={styles.toolbar}>
      {accounts.length > 1 ? (
        <div className={styles.chips} role="group" aria-label={filterLabel}>
          <button
            type="button"
            className={styles.chip}
            aria-pressed={filter === ALL_PROVIDERS}
            onClick={() => onFilter(ALL_PROVIDERS)}
          >
            Todos
          </button>
          {accounts.map(({ connectionId, provider }) => (
            <button
              key={connectionId}
              type="button"
              className={styles.chip}
              aria-pressed={filter === connectionId}
              onClick={() => onFilter(connectionId)}
            >
              {accountName(connectionId, provider)}
            </button>
          ))}
        </div>
      ) : <span />}
      <div className={styles.viewToggle} role="group" aria-label={viewLabel}>
        <button
          type="button"
          className={styles.viewButton}
          aria-pressed={view === 'grid'}
          aria-label="Grade"
          onClick={() => onView('grid')}
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
          aria-pressed={view === 'list'}
          aria-label="Lista"
          onClick={() => onView('list')}
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
  )
}

// Recents and search results, as tiles or rows. `when` picks the date shown (opened or modified).
// Folders (only in search results) open the folder and keep the folder menu, color included.
function ItemsLayout({ items, view, when, accountName, menuContext }) {
  const location = useLocation()
  const folderColors = useFolderColors()

  function linkProps(item) {
    return item.kind === 'folder'
      ? { to: driveFolderUrl(item.connectionId, item.ref), state: { folderName: item.name } }
      : { to: driveFileUrl(item.connectionId, item.ref), state: fileNavState(location) }
  }

  // A row's face is 80×60, too small for the regular folder drawing.
  function face(item) {
    return item.kind === 'folder'
      ? <FolderArt color={folderColors.colorOf(item.connectionId, item.ref).hex} size={view === 'list' ? 'small' : 'regular'} />
      : <FileThumb file={item} align="center" fit="cover" />
  }

  function menuItems(item) {
    if (item.kind !== 'folder') return fileMenuItems(entryMenuFile(item), menuContext(item))
    const color = folderColors.colorOf(item.connectionId, item.ref)
    return folderMenuItems(item, {
      ...menuContext(item),
      colorPicker: {
        swatch: color.hex,
        panel: ({ close }) => (
          <FolderColorPalette
            selectedId={color.id}
            onPick={(id) => {
              folderColors.setColor(item.connectionId, item.ref, id)
              close()
            }}
          />
        ),
      },
    })
  }

  if (view === 'list') {
    return (
      <div className={styles.list}>
        {items.map((item, index) => (
          <StaggerItem
            key={`${item.connectionId}-${item.ref}`}
            index={index}
            base={0.04}
            step={0.025}
            variants={rise}
            className={styles.rowWrap}
          >
            <Link {...linkProps(item)} className={styles.row} aria-label={item.name}>
              <span className={styles.rowFace} aria-hidden="true">{face(item)}</span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{item.name}</span>
                <span className={styles.rowSub}>
                  {itemKindLabel(item)} · {accountName(item.connectionId, item.provider)}
                </span>
              </span>
              <span className={styles.rowWhen}>{formatRelativeTime(when(item))}</span>
              <span className={styles.rowMark}>
                <ProviderMark id={item.provider} size={16} />
              </span>
            </Link>
            <OverflowMenu contextual label={`Ações de ${item.name}`} title={item.name} items={menuItems(item)} />
          </StaggerItem>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      {items.map((item, index) => (
        <StaggerItem
          key={`${item.connectionId}-${item.ref}`}
          index={index}
          base={0.04}
          step={0.025}
          variants={rise}
          className={styles.cardWrap}
        >
          <Link {...linkProps(item)} className={styles.tile} aria-label={item.name}>
            <span className={styles.tileFace} aria-hidden="true">
              {face(item)}
              <span className={styles.tileMark}>
                <ProviderMark id={item.provider} size={14} />
              </span>
            </span>
            <span className={styles.tileMeta}>
              <span className={styles.tileTitle}>{item.name}</span>
              <span className={styles.rowSub}>
                {itemKindLabel(item)} · {formatRelativeTime(when(item))}
              </span>
            </span>
          </Link>
          <OverflowMenu contextual label={`Ações de ${item.name}`} title={item.name} items={menuItems(item)} />
        </StaggerItem>
      ))}
    </div>
  )
}

function UploadAction({ onUploadError }) {
  const actions = useHubActions()
  const { connections } = useConnections()
  const extrasId = useId()
  const triggerId = useId()
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  // An expired connection cannot receive uploads until it is reconnected.
  const uploadTargets = connections.filter((connection) => connection.lastError !== 'RECONEXAO_NECESSARIA')
  const menu = useSuspendedMenu(2, { menuRef })
  // What the system picker returned, waiting for the cloud it goes to (asked only when more than
  // one is connected).
  const [picked, setPicked] = useState(null)

  // Both options open the system picker straight away; the cloud is asked afterwards.
  function startPicking(input) {
    menu.closeMenu()
    input.current?.click()
  }

  function send(connectionId, choice) {
    const run = choice.kind === 'folder'
      ? uploadFolder(connectionId, choice.files)
      : actions.uploadFiles({ connectionId, parentRef: null, files: choice.files })
    void run.catch((error) => onUploadError?.(connectionId, choice.files, error))
  }

  function receive(kind, files) {
    if (!files.length || uploadTargets.length === 0) return
    const choice = { kind, files }
    if (uploadTargets.length === 1) send(uploadTargets[0].connectionId, choice)
    else setPicked(choice)
  }

  const pickedLabel = !picked
    ? ''
    : picked.kind === 'folder'
      ? `Pasta "${(picked.files[0]?.webkitRelativePath || '').split('/')[0] || 'sem nome'}"`
      : picked.files.length === 1
        ? picked.files[0].name
        : `${picked.files.length} arquivos`

  const items = [
    { id: 'files', label: 'Enviar arquivos', icon: PixelFileEmpty, onSelect: () => startPicking(inputRef) },
    { id: 'folder', label: 'Enviar pasta', icon: PixelFolder, onSelect: () => startPicking(folderInputRef) },
  ]

  async function uploadFolder(connectionId, files) {
    // webkitRelativePath is "pasta/sub/arquivo.ext": rebuild the tree folder by
    // folder, then upload each folder's files into its new counterpart.
    const byDirectory = new Map()
    files.forEach((file) => {
      const parts = (file.webkitRelativePath || file.name).split('/')
      const directory = parts.slice(0, -1).join('/')
      if (!byDirectory.has(directory)) byDirectory.set(directory, [])
      byDirectory.get(directory).push(file)
    })
    const directories = [...byDirectory.keys()].sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
    )
    const refs = new Map([['', null]])
    for (const directory of directories) {
      const parts = directory.split('/')
      for (let depth = 1; depth <= parts.length; depth += 1) {
        const path = parts.slice(0, depth).join('/')
        if (refs.has(path)) continue
        const parentRef = refs.get(parts.slice(0, depth - 1).join('/'))
        const created = await actions.createFolder({
          connectionId,
          parentRef,
          name: parts[depth - 1],
        })
        refs.set(path, created.ref)
      }
      await actions.uploadFiles({
        connectionId,
        parentRef: refs.get(directory),
        files: byDirectory.get(directory),
      })
    }
  }

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
        disabled={uploadTargets.length === 0}
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
          receive('files', files)
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        hidden
        multiple
        webkitdirectory=""
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          receive('folder', files)
        }}
      />
      {picked ? (
        <AppOverlay title="Enviar para" onClose={() => setPicked(null)} compact>
          <p className={overlayStyles.lead}>{pickedLabel}</p>
          <ProviderStrip
            providers={uploadTargets}
            onPick={(connectionId) => {
              const choice = picked
              setPicked(null)
              send(connectionId, choice)
            }}
          />
        </AppOverlay>
      ) : null}
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
      id: 'file',
      label: 'Novo arquivo',
      icon: PixelFilePlus,
      onSelect: () => {
        menu.closeMenu()
        openOverlay({ type: 'name', kind: 'file' })
      },
    },
    {
      id: 'folder',
      label: 'Nova pasta',
      icon: PixelFolderPlus,
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
