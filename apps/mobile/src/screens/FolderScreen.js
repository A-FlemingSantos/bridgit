import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import BrowseHeader from '../components/BrowseHeader'
import CollapsingHeader from '../components/CollapsingHeader'
import ActionDialog, { Notice } from '../components/ActionDialog'
import { SheetHeader } from '../components/ActionSheet'
import CreateFab from '../components/CreateFab'
import FileSheet from '../components/FileSheet'
import FolderMark from '../components/FolderMark'
import HoldMenu from '../components/OverflowMenu'
import { PixelFolderOpen } from '../components/PixelIcons'
import Spinner from '../components/Spinner'
import StaggerItem from '../components/StaggerItem'
import { useFolder } from '../hub/hooks'
import { needsReconnect, staleCatalogNotice } from '../hub/format'
import { useItemActions } from '../hub/useItemActions'
import { errorMessage } from '../api/errorMessage'
import { useRouteConnection } from './routeConnection'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

export default function FolderScreen({ navigation, route }) {
  const { theme } = useMobileTheme()
  const { width } = useWindowDimensions()
  const { connectionId: routeConnectionId = null, providerId = null, folderRef = null, trail = [] } = route.params ?? {}
  // The route names the account; one that names only the provider means that provider's oldest account.
  const { status: accountStatus, connectionId, connection } = useRouteConnection({ connectionId: routeConnectionId, providerId })
  const resolving = accountStatus === 'resolving'
  const providerName = () => connection?.providerName ?? providerId ?? 'A conta'
  // An account that is gone from the list (disconnected) cannot be browsed; the list loading says nothing yet.
  const connected = accountStatus !== 'missing'
  // An expired connection still lists the last synced catalog, which may be stale or incomplete.
  const expired = needsReconnect(connection)
  const accountEmail = connection?.account?.email ?? ''
  const { status, error, reload, title, catalog, folders, files } = useFolder(connected && !resolving ? connectionId : null, folderRef)
  // The listing says its catalog is old (e.g. sync failing); the reconnect warning already covers an expired login.
  const staleNotice = connected ? staleCatalogNotice(catalog, { reconnectShown: expired }) : null
  const actions = useItemActions({ connectionId: connected && !expired ? connectionId : null, parentRef: folderRef })
  const location = { title: title ?? connection?.providerName ?? 'Pasta', folders, files }
  const tileWidth = (width - 40 - 12) / 2
  const folderWidth = Math.min(112, Math.round(tileWidth * 0.7))
  const fileSize = Math.min(72, Math.round(tileWidth * 0.42))
  const empty = status === 'ready' && folders.length === 0 && files.length === 0

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={(
          <BrowseHeader
            title={location.title}
            trail={trail}
            providerId={folderRef ? null : connection?.providerId ?? providerId}
            onBack={() => navigation.goBack()}
            onCrumb={(index) => navigation.pop(trail.length - index)}
          />
        )}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
        {!connected ? (
          <AppText style={[styles.empty, { color: theme.colors.mute }]}>
            Esta conta do {providerName()} não está conectada. Conecte em Ajustes.
          </AppText>
        ) : null}
        {expired ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.push('Settings')}>
            <AppText style={[styles.empty, { color: theme.colors.mute }]}>
              O acesso ao {providerName()}{accountEmail ? ` (${accountEmail})` : ''} expirou e esta lista pode estar desatualizada. Toque para reconectar em Ajustes.
            </AppText>
          </Pressable>
        ) : null}
        {staleNotice ? (
          <AppText style={[styles.empty, { color: theme.colors.mute }]}>{staleNotice}</AppText>
        ) : null}
        {resolving || (connected && status === 'loading') ? (
          <View style={styles.loading}>
            <Spinner />
          </View>
        ) : null}
        {connected && !resolving && status === 'error' ? (
          <Pressable accessibilityRole="button" onPress={reload}>
            <AppText style={[styles.empty, { color: theme.colors.mute }]}>
              {errorMessage(error, 'Não foi possível carregar.')} Toque para tentar de novo.
            </AppText>
          </Pressable>
        ) : null}
        {connected && !resolving && !expired && !staleNotice && empty ? (
          <View style={styles.emptyState}>
            <PixelFolderOpen size={96} color={theme.colors.mute} />
            <AppText weight="500" style={styles.emptyTitle}>Pasta vazia</AppText>
            <AppText style={[styles.empty, styles.emptyHint, { color: theme.colors.mute }]}>
              Envie arquivos ou crie uma pasta pelo +.
            </AppText>
          </View>
        ) : null}

        {location.folders.length ? (
          <View accessibilityLabel="Pastas" style={styles.grid}>
            {location.folders.map((folder, index) => (
              <StaggerItem
                key={folder.ref}
                index={index}
                base={0.06}
                step={0.04}
                distance={10}
                duration={400}
                style={{ width: tileWidth }}
              >
                <HoldMenu
                  header={(
                    <SheetHeader
                      centered
                      leading={<FolderMark width={64} color={actions.folderColor(folder)} />}
                      title={folder.name}
                      subtitle={`Pasta · ${providerName()}`}
                    />
                  )}
                  items={actions.folderMenu(folder)}
                >
                  {({ onLongPress }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={folder.name}
                      accessibilityHint="Mantenha pressionado para ações"
                      delayLongPress={420}
                      onLongPress={onLongPress}
                      onPress={() => navigation.push('Folder', {
                        connectionId,
                        providerId,
                        folderRef: folder.ref,
                        trail: [...trail, { title: location.title }],
                      })}
                      style={({ pressed }) => [styles.item, pressed ? { backgroundColor: theme.colors.wash } : null]}
                    >
                      <View style={styles.face}>
                        <FolderMark width={folderWidth} color={actions.folderColor(folder)} />
                      </View>
                      <View style={styles.meta}>
                        <AppText numberOfLines={1} style={styles.itemTitle}>{folder.name}</AppText>
                        <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                          {folder.modified || 'Pasta'}
                        </AppText>
                      </View>
                    </Pressable>
                  )}
                </HoldMenu>
              </StaggerItem>
            ))}
          </View>
        ) : null}

        {location.files.length ? (
          <View accessibilityLabel="Arquivos" style={styles.grid}>
            {location.files.map((file, index) => (
              <StaggerItem
                key={file.ref}
                index={index}
                base={0.14}
                step={0.03}
                distance={10}
                duration={400}
                style={{ width: tileWidth }}
              >
                <HoldMenu
                  header={(
                    <SheetHeader
                      centered
                      leading={<FileSheet file={file} size={48} />}
                      title={file.name}
                      subtitle={`${file.kind} · ${providerName()}`}
                    />
                  )}
                  items={actions.fileMenu(file)}
                >
                  {({ onLongPress }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={file.name}
                      accessibilityHint="Mantenha pressionado para ações"
                      delayLongPress={420}
                      onLongPress={onLongPress}
                      onPress={() => navigation.push('File', { connectionId, providerId, fileRef: file.ref })}
                      style={({ pressed }) => [styles.item, pressed ? { backgroundColor: theme.colors.wash } : null]}
                    >
                      <View style={styles.face}>
                        <FileSheet file={file} size={fileSize} />
                      </View>
                      <View style={styles.meta}>
                        <AppText numberOfLines={1} style={styles.itemTitle}>{file.name}</AppText>
                        <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                          {file.modified || file.kind}
                        </AppText>
                      </View>
                    </Pressable>
                  )}
                </HoldMenu>
              </StaggerItem>
            ))}
          </View>
        ) : null}
        </View>
      </CollapsingHeader>
      <CreateFab {...actions.createMenu()} />
      <Notice message={actions.notice} />
      <ActionDialog dialog={actions.dialog} onClose={actions.closeDialog} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Fills the screen so the empty state can sit in its middle.
  scroll: {
    flexGrow: 1,
    paddingBottom: 108,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 32,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 20,
  },
  item: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 8,
  },
  face: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  meta: {
    width: '100%',
    alignItems: 'center',
    gap: 3,
  },
  itemTitle: {
    fontSize: 13.5,
    letterSpacing: -0.14,
  },
  itemSub: {
    fontSize: 11.5,
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: -0.26,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: 19,
    letterSpacing: -0.5,
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
})
