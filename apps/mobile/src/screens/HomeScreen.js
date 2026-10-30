import { useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Clock } from 'lucide-react-native'
import CollapsingHeader from '../components/CollapsingHeader'
import ActionDialog, { Notice } from '../components/ActionDialog'
import ActionSheet, { SheetHeader } from '../components/ActionSheet'
import AnchoredMenu from '../components/AnchoredMenu'
import { accountLine } from '../components/accountDisplay'
import FileThumb from '../components/FileThumb'
import FolderMark from '../components/FolderMark'
import HomeHeader from '../components/HomeHeader'
import HoldMenu from '../components/OverflowMenu'
import {
  PixelCloud,
  PixelFileEmpty,
  PixelFilePlus,
  PixelFilter,
  PixelFolder,
  PixelFolderPlus,
  PixelGrid,
  PixelList,
  PixelMore,
  PixelUpload,
} from '../components/PixelIcons'
import ProviderMark from '../components/ProviderMark'
import SearchPill from '../components/SearchPill'
import { useScrollReveal } from '../components/useScrollReveal'
import SidePanel from '../components/SidePanel'
import Spinner from '../components/Spinner'
import StaggerItem from '../components/StaggerItem'
import { useConnections, useHomeEntries, useSearch } from '../hub/hooks'
import { SEARCH_MIN_LENGTH, summarizeSearch } from '../hub/search'
import { needsReconnect } from '../hub/format'
import { canPickFolder } from '../hub/pickFolder'
import { useConnectAccount } from '../hub/useConnectAccount'
import { useItemActions } from '../hub/useItemActions'
import { errorMessage } from '../api/errorMessage'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

const PROVIDER_LABELS = { onedrive: 'OneDrive', 'google-drive': 'Google Drive', dropbox: 'Dropbox' }
const ALL_PROVIDERS = 'all'
const NO_ENTRIES = []
const SCREEN_X = 18

function providerName(id) {
  return PROVIDER_LABELS[id] ?? id
}

function openFile(navigation, file) {
  navigation.push('File', { connectionId: file.connectionId, providerId: file.providerId, fileRef: file.ref })
}

function fileMeta(file) {
  return file.when ? `${file.kind} · ${file.when}` : file.kind
}

// A search result shows when it last changed, as the web does.
function resultMeta(entry) {
  return entry.modified ? `${entry.kind} · ${entry.modified}` : entry.kind
}

// The accounts a list holds, for its filter: the provider name, plus the e-mail when that provider has
// more than one account.
function accountOptions(entries, connections) {
  const ids = [...new Set(entries.map((entry) => entry.connectionId).filter(Boolean))]
  return ids.map((id) => {
    const connection = connections.find((item) => item.connectionId === id)
    const providerId = connection?.providerId ?? entries.find((entry) => entry.connectionId === id)?.providerId
    const shared = connections.filter((other) => other.providerId === providerId).length > 1
    const name = connection?.providerName ?? providerName(providerId)
    return { id, providerId, label: shared && connection?.account?.email ? `${name} · ${connection.account.email}` : name }
  })
}

function fileHeader(file) {
  return (
    <SheetHeader
      centered
      leading={<FileThumb file={file} size={48} />}
      title={file.name}
      subtitle={`${file.kind} · ${providerName(file.providerId)}`}
    />
  )
}

// Opens a file, or a folder from search results, in the account it was found in.
function openEntry(navigation, entry) {
  if (entry.isFolder) {
    navigation.push('Folder', { connectionId: entry.connectionId, providerId: entry.providerId, folderRef: entry.ref })
    return
  }
  openFile(navigation, entry)
}

function entryHeader(entry, actions) {
  if (!entry.isFolder) return fileHeader(entry)
  return (
    <SheetHeader
      centered
      leading={<FolderMark width={56} color={actions.folderColor(entry)} />}
      title={entry.name}
      subtitle={`Pasta · ${providerName(entry.providerId)}`}
    />
  )
}

// Recents and search results, as rows or tiles. Folders appear only in search results; they keep the
// folder menu, color included. `meta` writes the line under the name.
function Entries({ entries, view, meta, tileWidth, navigation, actions }) {
  const { theme } = useMobileTheme()
  const tileSheet = Math.min(72, Math.round(tileWidth * 0.42))
  const menuOf = (entry) => (entry.isFolder ? actions.folderMenu(entry) : actions.fileMenu(entry))

  if (view === 'list') {
    return (
      <View>
        {entries.map((entry, index) => (
          <StaggerItem key={`${entry.connectionId}-${entry.ref}`} index={index} base={0.04} step={0.025}>
            <HoldMenu header={entryHeader(entry, actions)} items={menuOf(entry)}>
              {({ onLongPress, openMenu }) => (
                <View style={styles.rowWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={entry.name}
                    accessibilityHint="Mantenha pressionado para ações"
                    delayLongPress={420}
                    onPress={() => openEntry(navigation, entry)}
                    onLongPress={onLongPress}
                    style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.colors.wash } : null]}
                  >
                    <View style={styles.rowFace}>
                      {entry.isFolder
                        ? <FolderMark width={28} color={actions.folderColor(entry)} />
                        : <FileThumb file={entry} size={24} fit="cover" style={styles.rowThumb} />}
                    </View>
                    <View style={styles.rowBody}>
                      <AppText weight="500" numberOfLines={1} style={styles.rowTitle}>{entry.name}</AppText>
                      <AppText numberOfLines={1} style={[styles.sub, { color: theme.colors.mute }]}>
                        {meta(entry)}
                      </AppText>
                    </View>
                    <ProviderMark id={entry.providerId} size={16} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ações de ${entry.name}`}
                    onPress={openMenu}
                    hitSlop={6}
                    style={styles.more}
                  >
                    <PixelMore size={18} color={theme.colors.mute} />
                  </Pressable>
                </View>
              )}
            </HoldMenu>
          </StaggerItem>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.grid}>
      {entries.map((entry, index) => (
        <StaggerItem
          key={`${entry.connectionId}-${entry.ref}-grid`}
          index={index}
          base={0.04}
          step={0.025}
          style={{ width: tileWidth }}
        >
          <HoldMenu header={entryHeader(entry, actions)} items={menuOf(entry)}>
            {({ onLongPress }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={entry.name}
                accessibilityHint="Mantenha pressionado para ações"
                delayLongPress={420}
                onPress={() => openEntry(navigation, entry)}
                onLongPress={onLongPress}
                style={styles.tile}
              >
                {({ pressed }) => (
                  <>
                    <View
                      style={[
                        styles.tileFace,
                        { backgroundColor: pressed ? theme.colors.raise : theme.colors.wash },
                      ]}
                    >
                      {entry.isFolder
                        ? <FolderMark width={tileSheet + 16} color={actions.folderColor(entry)} />
                        : <FileThumb file={entry} size={tileSheet} fit="cover" dimmed={pressed} style={styles.tileThumb} />}
                      <View style={styles.tileMark}>
                        <ProviderMark id={entry.providerId} size={14} />
                      </View>
                    </View>
                    <View style={styles.tileMeta}>
                      <AppText weight="500" numberOfLines={1} style={styles.tileTitle}>{entry.name}</AppText>
                      <AppText numberOfLines={1} style={[styles.sub, { color: theme.colors.mute }]}>
                        {meta(entry)}
                      </AppText>
                    </View>
                  </>
                )}
              </Pressable>
            )}
          </HoldMenu>
        </StaggerItem>
      ))}
    </View>
  )
}

// Provider mark in the { size, color } icon shape the sheet rows render.
function providerIcon(id) {
  function ProviderIcon({ size = 24 }) {
    return <ProviderMark id={id} size={size} />
  }
  return ProviderIcon
}

// The account's email is shown on its own only when the provider has more than one account to tell apart.
function accountHint(connection, shared) {
  if (needsReconnect(connection)) return 'Acesso expirado · Reconectar em Ajustes'
  if (shared) return accountLine(connection)
  return connection.account?.email ?? 'Conectado'
}

// A Home shortcut, drawn like the bottom sheet tiles; its choices open in a sheet of their own.
function ActionTile({ icon: Icon, label, primary = false, sheetTitle, sheetHint, items }) {
  const { theme } = useMobileTheme()
  const [open, setOpen] = useState(false)
  const ink = primary ? theme.colors.paper : theme.colors.ink
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.card,
          primary
            ? { backgroundColor: theme.colors.ink, opacity: pressed ? 0.88 : 1 }
            : { backgroundColor: pressed ? theme.colors.press : theme.colors.raise },
        ]}
      >
        <Icon size={24} color={ink} />
        <AppText numberOfLines={1} style={[styles.cardLabel, { color: ink }]}>{label}</AppText>
      </Pressable>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        header={(
          <SheetHeader
            leading={<Icon size={24} color={theme.colors.mute} />}
            title={sheetTitle}
            subtitle={sheetHint}
          />
        )}
        items={items}
      />
    </>
  )
}

// One button for the account filter; the accounts open in a menu that drops from it, so the
// toolbar keeps a single line however many are connected. `options` are { id, label, providerId }.
function AccountFilter({ value, options, onChange, label }) {
  const { theme } = useMobileTheme()
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const filtered = value !== ALL_PROVIDERS
  const current = options.find((option) => option.id === value)
  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${filtered ? current?.label ?? '' : 'Todas'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.viewButton, filtered || open ? { backgroundColor: theme.colors.wash } : null]}
      >
        <PixelFilter size={24} color={filtered ? theme.colors.ink : theme.colors.mute} />
      </Pressable>
      <AnchoredMenu
        open={open}
        anchor={button}
        onClose={() => setOpen(false)}
        label={label}
        items={[
          { id: ALL_PROVIDERS, label: 'Todas', icon: PixelCloud },
          ...options.map((option) => ({ id: option.id, label: option.label, icon: providerIcon(option.providerId) })),
        ].map((item) => ({ ...item, selected: value === item.id, onSelect: () => onChange(item.id) }))}
      />
    </>
  )
}

function ViewButton({ icon: Icon, label, selected, onPress }) {
  const { theme } = useMobileTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.viewButton, selected ? { backgroundColor: theme.colors.wash } : null]}
    >
      <Icon size={24} color={selected ? theme.colors.ink : theme.colors.mute} />
    </Pressable>
  )
}

export default function HomeScreen({ navigation }) {
  const { theme } = useMobileTheme()
  const { recents, shortcuts, status, error, reload } = useHomeEntries()
  const { connections } = useConnections()
  const connectAccount = useConnectAccount()
  const actions = useItemActions()
  const { width } = useWindowDimensions()
  const [panelOpen, setPanelOpen] = useState(false)
  const [recentsView, setRecentsView] = useState('list')
  const [accountFilter, setAccountFilter] = useState(ALL_PROVIDERS)
  // Search: any text in the pill swaps the actions and the recents for the results, like the web.
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [resultsFilter, setResultsFilter] = useState(ALL_PROVIDERS)
  const searchInput = useRef(null)
  // Header and search pill step aside together while the user scrolls down.
  const reveal = useScrollReveal()
  const search = useSearch(query)
  const searching = query.trim().length > 0
  // What "Enviar" picked on the device, waiting for the user to choose the cloud it goes to.
  const [picked, setPicked] = useState(null)
  // Result of connecting another account from the side panel (a failure message, or empty).
  const [connectNotice, setConnectNotice] = useState('')
  const connectTimer = useRef(null)
  useEffect(() => () => clearTimeout(connectTimer.current), [])
  // The destination sheet keeps drawing the last pick while it slides away.
  const lastPicked = useRef(null)
  if (picked) lastPicked.current = picked
  const shownPicked = picked ?? lastPicked.current
  const tileWidth = (width - SCREEN_X * 2 - 12) / 2

  // The filter lists the accounts that have recents.
  const recentAccounts = useMemo(() => accountOptions(recents, connections), [recents, connections])
  const activeFilter = recentAccounts.some((account) => account.id === accountFilter) ? accountFilter : ALL_PROVIDERS
  const visibleRecents = activeFilter === ALL_PROVIDERS
    ? recents
    : recents.filter((file) => file.connectionId === activeFilter)

  const results = search.status === 'ready' ? search.results : NO_ENTRIES
  const resultAccounts = useMemo(() => accountOptions(results, connections), [results, connections])
  const activeResultsFilter = resultAccounts.some((account) => account.id === resultsFilter) ? resultsFilter : ALL_PROVIDERS
  const visibleResults = activeResultsFilter === ALL_PROVIDERS
    ? results
    : results.filter((entry) => entry.connectionId === activeResultsFilter)
  const coverage = summarizeSearch(search.status === 'ready' ? search.providers : [])
  const accountName = (entry) => connections.find((item) => item.connectionId === entry.connectionId)?.providerName
    ?? providerName(entry.provider ?? entry.id)

  // While the user types, the pill (and the header with it) stays put.
  useEffect(() => {
    reveal.lock(searchFocused)
  }, [reveal, searchFocused])

  // Another screen on top ends the typing: no caret is left in the field behind it.
  useEffect(() => navigation.addListener('blur', () => searchInput.current?.blur()), [navigation])

  // Android's back closes the search before it leaves the screen.
  useEffect(() => {
    if (!searching) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuery('')
      searchInput.current?.blur()
      Keyboard.dismiss()
      return true
    })
    return () => subscription.remove()
  }, [searching])

  const openSettings = () => navigation.push('Settings')

  // Connects one more account of the provider; the list refreshes itself once the OAuth flow returns.
  async function addAccount(providerId) {
    const message = await connectAccount(providerId, { addAccount: true })
    if (!message) return
    setConnectNotice(message)
    clearTimeout(connectTimer.current)
    connectTimer.current = setTimeout(() => setConnectNotice(''), 4000)
  }

  // Home uploads, new files and new folders land at the root of the account picked in the sheet.
  // An expired connection stays listed but cannot take writes until it is reconnected.
  function destinationItems(run) {
    if (connections.length === 0) {
      return [{ id: 'connect', label: 'Conectar uma nuvem', icon: PixelCloud, onSelect: openSettings }]
    }
    return connections.map((connection) => ({
      id: connection.connectionId,
      label: connection.providerName,
      hint: accountHint(
        connection,
        connections.filter((other) => other.providerId === connection.providerId).length > 1,
      ),
      icon: providerIcon(connection.providerId),
      disabled: needsReconnect(connection),
      onSelect: () => run(connection.connectionId),
    }))
  }

  // Same choices as the web's "Enviar"; the cloud is asked only once something is picked.
  const sendItems = [
    {
      id: 'files',
      label: 'Enviar arquivos',
      icon: PixelFileEmpty,
      onSelect: async () => {
        const files = await actions.pickFiles()
        if (files) setPicked({ kind: 'files', files })
      },
    },
    ...(canPickFolder
      ? [{
          id: 'folder',
          label: 'Enviar pasta',
          icon: PixelFolder,
          onSelect: async () => {
            const tree = await actions.pickFolder()
            if (tree) setPicked({ kind: 'folder', tree })
          },
        }]
      : []),
  ]

  const pickedSummary = !shownPicked
    ? ''
    : shownPicked.kind === 'folder'
      ? `Pasta "${shownPicked.tree.name}" · ${shownPicked.tree.files.length} ${shownPicked.tree.files.length === 1 ? 'arquivo' : 'arquivos'}`
      : shownPicked.files.length === 1
        ? shownPicked.files[0].name
        : `${shownPicked.files.length} arquivos`

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={<HomeHeader onOpenPanel={() => setPanelOpen(true)} onOpenSettings={openSettings} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        reveal={reveal}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.content}>
          {searching ? (
            <View style={styles.section}>
              <AppText weight="500" style={styles.heading}>Resultados</AppText>
              {search.status === 'idle' ? (
                <AppText style={[styles.empty, { color: theme.colors.mute }]}>
                  {`Digite pelo menos ${SEARCH_MIN_LENGTH} letras para buscar.`}
                </AppText>
              ) : search.status === 'loading' ? (
                <View style={styles.loading}>
                  <Spinner />
                </View>
              ) : search.status === 'error' || coverage.allFailed ? (
                <Pressable accessibilityRole="button" onPress={search.retry}>
                  <AppText style={[styles.empty, { color: theme.colors.mute }]}>
                    {`${search.status === 'error' ? errorMessage(search.error, 'Não foi possível buscar.') : 'Não foi possível buscar.'} Toque para tentar de novo.`}
                  </AppText>
                </Pressable>
              ) : (
                <>
                  {coverage.someFailed ? (
                    <AppText style={[styles.empty, { color: theme.colors.mute }]}>
                      Alguns provedores não responderam. Mostrando resultados parciais.
                    </AppText>
                  ) : null}
                  {coverage.failed.map((entry) => (
                    <AppText key={entry.connectionId ?? entry.id} style={[styles.empty, { color: theme.colors.mute }]}>
                      {`Não foi possível buscar em ${accountName(entry)}.`}
                    </AppText>
                  ))}
                  {coverage.syncing.map((entry) => (
                    <AppText key={entry.connectionId ?? entry.id} style={[styles.empty, { color: theme.colors.mute }]}>
                      {`Ainda sincronizando ${accountName(entry)}. Os resultados podem estar incompletos.`}
                    </AppText>
                  ))}
                  {results.length === 0 ? (
                    <AppText style={[styles.empty, { color: theme.colors.mute }]}>Nada encontrado.</AppText>
                  ) : (
                    <>
                      <View style={styles.toolbar}>
                        {resultAccounts.length > 1 ? (
                          <AccountFilter
                            value={activeResultsFilter}
                            options={resultAccounts}
                            onChange={setResultsFilter}
                            label="Filtrar resultados por conta"
                          />
                        ) : <View />}
                        <View style={styles.toggle}>
                          <ViewButton icon={PixelGrid} label="Grade" selected={recentsView === 'grid'} onPress={() => setRecentsView('grid')} />
                          <ViewButton icon={PixelList} label="Lista" selected={recentsView === 'list'} onPress={() => setRecentsView('list')} />
                        </View>
                      </View>
                      <Entries entries={visibleResults} view={recentsView} meta={resultMeta} tileWidth={tileWidth} navigation={navigation} actions={actions} />
                    </>
                  )}
                </>
              )}
            </View>
          ) : (
            <>
          <View style={styles.actions}>
            <ActionTile
              icon={PixelUpload}
              label="Enviar"
              primary
              sheetTitle="Enviar"
              sheetHint="Escolha o que enviar do aparelho"
              items={sendItems}
            />
            <ActionTile
              icon={PixelFilePlus}
              label="Novo arquivo"
              sheetTitle="Novo arquivo"
              sheetHint="Escolha onde criar o arquivo"
              items={destinationItems(actions.newFileIn)}
            />
            <ActionTile
              icon={PixelFolderPlus}
              label="Nova pasta"
              sheetTitle="Nova pasta"
              sheetHint="Escolha onde criar a pasta"
              items={destinationItems(actions.newFolderIn)}
            />
          </View>

          <View style={styles.section}>
            <AppText weight="500" style={styles.heading}>Recentes</AppText>

            <View style={styles.toolbar}>
              {recentAccounts.length > 1 ? (
                <AccountFilter
                  value={activeFilter}
                  options={recentAccounts}
                  onChange={setAccountFilter}
                  label="Filtrar recentes por conta"
                />
              ) : <View />}
              <View style={styles.toggle}>
                <ViewButton icon={PixelGrid} label="Grade" selected={recentsView === 'grid'} onPress={() => setRecentsView('grid')} />
                <ViewButton icon={PixelList} label="Lista" selected={recentsView === 'list'} onPress={() => setRecentsView('list')} />
              </View>
            </View>

            {status === 'loading' ? (
              <View style={styles.loading}>
                <Spinner />
              </View>
            ) : null}
            {status === 'error' ? (
              <Pressable accessibilityRole="button" onPress={reload}>
                <AppText style={[styles.empty, { color: theme.colors.mute }]}>
                  {errorMessage(error, 'Não foi possível carregar.')} Toque para tentar de novo.
                </AppText>
              </Pressable>
            ) : null}
            {status === 'ready' && visibleRecents.length === 0 ? (
              <View style={[styles.emptyState, { borderColor: theme.colors.line }]}>
                <Clock size={20} strokeWidth={1.6} color={theme.colors.mute} />
                <AppText weight="500" style={styles.emptyTitle}>Nada encontrado.</AppText>
                <AppText style={[styles.empty, { color: theme.colors.mute }]}>
                  Os arquivos que você abrir em qualquer nuvem aparecem aqui.
                </AppText>
              </View>
            ) : null}

            <Entries entries={visibleRecents} view={recentsView} meta={fileMeta} tileWidth={tileWidth} navigation={navigation} actions={actions} />
          </View>
            </>
          )}
        </View>
      </CollapsingHeader>
      <SearchPill
        value={query}
        onChangeText={setQuery}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        reveal={reveal}
        inputRef={searchInput}
      />
      <ActionSheet
        open={Boolean(picked)}
        onClose={() => setPicked(null)}
        header={(
          <SheetHeader
            leading={<PixelUpload size={24} color={theme.colors.mute} />}
            title="Enviar para"
            subtitle={pickedSummary}
          />
        )}
        items={shownPicked ? destinationItems((target) => actions.sendPicked(target, shownPicked)) : []}
      />
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        shortcuts={shortcuts}
        shortcutsStatus={status}
        actions={actions}
        onOpenFile={(file) => openFile(navigation, file)}
        onOpenAccount={({ connectionId, providerId }) => navigation.push('Folder', { connectionId, providerId })}
        onAddAccount={addAccount}
        onOpenSettings={openSettings}
      />
      <Notice message={connectNotice || actions.notice} />
      <ActionDialog dialog={actions.dialog} onClose={actions.closeDialog} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 96,
  },
  content: {
    paddingHorizontal: SCREEN_X,
    paddingTop: 12,
    gap: 28,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    minHeight: 96,
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  cardLabel: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
  section: {
    gap: 16,
  },
  heading: {
    fontSize: 20,
    letterSpacing: -0.6,
  },
  toolbar: {
    marginTop: -4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggle: {
    flexDirection: 'row',
    gap: 2,
  },
  viewButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: -0.26,
  },
  emptyState: {
    gap: 6,
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 14,
    letterSpacing: -0.28,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowFace: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowThumb: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    letterSpacing: -0.42,
  },
  sub: {
    fontSize: 12,
    letterSpacing: -0.12,
  },
  more: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 18,
  },
  tile: {
    gap: 10,
  },
  tileFace: {
    aspectRatio: 4 / 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileThumb: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  tileMark: {
    position: 'absolute',
    left: 10,
    bottom: 10,
  },
  tileMeta: {
    gap: 3,
  },
  tileTitle: {
    fontSize: 14,
    letterSpacing: -0.42,
  },
})
