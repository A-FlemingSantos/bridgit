import { useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Clock } from 'lucide-react-native'
import CollapsingHeader from '../components/CollapsingHeader'
import ActionDialog, { Notice } from '../components/ActionDialog'
import ActionSheet, { SheetHeader } from '../components/ActionSheet'
import AnchoredMenu from '../components/AnchoredMenu'
import FileSheet from '../components/FileSheet'
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
import SidePanel from '../components/SidePanel'
import Spinner from '../components/Spinner'
import StaggerItem from '../components/StaggerItem'
import { useHomeEntries, useProviders } from '../hub/hooks'
import { needsReconnect } from '../hub/format'
import { canPickFolder } from '../hub/pickFolder'
import { useItemActions } from '../hub/useItemActions'
import { errorMessage } from '../api/errorMessage'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

const PROVIDER_LABELS = { onedrive: 'OneDrive', 'google-drive': 'Google Drive', dropbox: 'Dropbox' }
const ALL_PROVIDERS = 'all'
const SCREEN_X = 18

function providerName(id) {
  return PROVIDER_LABELS[id] ?? id
}

function openFile(navigation, file) {
  navigation.push('File', { providerId: file.providerId, fileRef: file.ref })
}

function fileMeta(file) {
  return file.when ? `${file.kind} · ${file.when}` : file.kind
}

function fileHeader(file) {
  return (
    <SheetHeader
      centered
      leading={<FileSheet file={file} size={48} />}
      title={file.name}
      subtitle={`${file.kind} · ${providerName(file.providerId)}`}
    />
  )
}

// Provider mark in the { size, color } icon shape the sheet rows render.
function providerIcon(id) {
  function ProviderIcon({ size = 24 }) {
    return <ProviderMark id={id} size={size} />
  }
  return ProviderIcon
}

function providerHint(provider) {
  if (needsReconnect(provider)) return 'Acesso expirado · Reconectar em Ajustes'
  if (provider.connected) return provider.account?.email ?? 'Conectado'
  return 'Não conectado'
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
            : { backgroundColor: pressed ? theme.colors.line : theme.colors.raise },
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

// One button for the provider filter; the clouds open in a menu that drops from it, so the
// toolbar keeps a single line however many are connected.
function ProviderFilter({ value, options, onChange }) {
  const { theme } = useMobileTheme()
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const filtered = value !== ALL_PROVIDERS
  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={`Filtrar recentes por provedor: ${filtered ? providerName(value) : 'Todos'}`}
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
        label="Filtrar recentes por provedor"
        items={options.map((id) => ({
          id,
          label: id === ALL_PROVIDERS ? 'Todos' : providerName(id),
          icon: id === ALL_PROVIDERS ? PixelCloud : providerIcon(id),
          selected: value === id,
          onSelect: () => onChange(id),
        }))}
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
  const { providers } = useProviders()
  const actions = useItemActions()
  const { width } = useWindowDimensions()
  const [panelOpen, setPanelOpen] = useState(false)
  const [recentsView, setRecentsView] = useState('list')
  const [providerFilter, setProviderFilter] = useState(ALL_PROVIDERS)
  // What "Enviar" picked on the device, waiting for the user to choose the cloud it goes to.
  const [picked, setPicked] = useState(null)
  // The destination sheet keeps drawing the last pick while it slides away.
  const lastPicked = useRef(null)
  if (picked) lastPicked.current = picked
  const shownPicked = picked ?? lastPicked.current
  const tileWidth = (width - SCREEN_X * 2 - 12) / 2
  const tileSheet = Math.min(72, Math.round(tileWidth * 0.42))

  const recentProviders = useMemo(() => [...new Set(recents.map((file) => file.providerId))], [recents])
  const activeFilter = recentProviders.includes(providerFilter) ? providerFilter : ALL_PROVIDERS
  const visibleRecents = activeFilter === ALL_PROVIDERS
    ? recents
    : recents.filter((file) => file.providerId === activeFilter)

  const openSettings = () => navigation.push('Settings')

  // Home uploads, new files and new folders land at the root of the cloud picked in the sheet.
  // An expired connection stays listed but cannot take writes until it is reconnected.
  function destinationItems(run) {
    const connected = providers.filter((provider) => provider.connected)
    if (connected.length === 0) {
      return [{ id: 'connect', label: 'Conectar uma nuvem', icon: PixelCloud, onSelect: openSettings }]
    }
    return connected.map((provider) => ({
      id: provider.id,
      label: provider.name,
      hint: providerHint(provider),
      icon: providerIcon(provider.id),
      disabled: needsReconnect(provider),
      onSelect: () => run(provider.id),
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
      >
        <View style={styles.content}>
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
              {recentProviders.length > 1 ? (
                <ProviderFilter
                  value={activeFilter}
                  options={[ALL_PROVIDERS, ...recentProviders]}
                  onChange={setProviderFilter}
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

            {recentsView === 'list' ? (
              <View>
                {visibleRecents.map((file, index) => (
                  <StaggerItem key={`${file.providerId}-${file.ref}`} index={index} base={0.04} step={0.025}>
                    <HoldMenu header={fileHeader(file)} items={actions.fileMenu(file)}>
                      {({ onLongPress, openMenu }) => (
                        <View style={styles.rowWrap}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={file.name}
                            accessibilityHint="Mantenha pressionado para ações"
                            delayLongPress={420}
                            onPress={() => openFile(navigation, file)}
                            onLongPress={onLongPress}
                            style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.colors.wash } : null]}
                          >
                            <View style={styles.rowFace}>
                              <FileSheet compact file={file} />
                            </View>
                            <View style={styles.rowBody}>
                              <AppText weight="500" numberOfLines={1} style={styles.rowTitle}>{file.name}</AppText>
                              <AppText numberOfLines={1} style={[styles.sub, { color: theme.colors.mute }]}>
                                {fileMeta(file)}
                              </AppText>
                            </View>
                            <ProviderMark id={file.providerId} size={16} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Ações de ${file.name}`}
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
            ) : (
              <View style={styles.grid}>
                {visibleRecents.map((file, index) => (
                  <StaggerItem
                    key={`${file.providerId}-${file.ref}-grid`}
                    index={index}
                    base={0.04}
                    step={0.025}
                    style={{ width: tileWidth }}
                  >
                    <HoldMenu header={fileHeader(file)} items={actions.fileMenu(file)}>
                      {({ onLongPress }) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={file.name}
                          accessibilityHint="Mantenha pressionado para ações"
                          delayLongPress={420}
                          onPress={() => openFile(navigation, file)}
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
                                <FileSheet file={file} size={tileSheet} />
                                <View style={styles.tileMark}>
                                  <ProviderMark id={file.providerId} size={14} />
                                </View>
                              </View>
                              <View style={styles.tileMeta}>
                                <AppText weight="500" numberOfLines={1} style={styles.tileTitle}>{file.name}</AppText>
                                <AppText numberOfLines={1} style={[styles.sub, { color: theme.colors.mute }]}>
                                  {fileMeta(file)}
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
            )}
          </View>
        </View>
      </CollapsingHeader>
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
        onOpenProvider={(providerId) => navigation.push('Folder', { providerId })}
        onOpenSettings={openSettings}
      />
      <Notice message={actions.notice} />
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
