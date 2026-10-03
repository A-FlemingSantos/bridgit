import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import BrowseHeader from '../components/BrowseHeader'
import CollapsingHeader from '../components/CollapsingHeader'
import ActionDialog, { Notice } from '../components/ActionDialog'
import CreateFab from '../components/CreateFab'
import FileSheet from '../components/FileSheet'
import FolderMark from '../components/FolderMark'
import HoldMenu from '../components/OverflowMenu'
import StaggerItem from '../components/StaggerItem'
import { useFolder, useProviders } from '../hub/hooks'
import { useItemActions } from '../hub/useItemActions'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

function Face({ children, width }) {
  return (
    <View style={[styles.glyph, { width }]}>
      {children}
    </View>
  )
}

export default function FolderScreen({ navigation, route }) {
  const { theme } = useMobileTheme()
  const { width } = useWindowDimensions()
  const { providerId, folderRef = null } = route.params ?? {}
  const { providers } = useProviders()
  const provider = providers.find((entry) => entry.id === providerId)
  const providerName = () => provider?.name ?? providerId
  const connected = provider?.connected ?? true
  const { status, error, reload, title, folders, files } = useFolder(connected ? providerId : null, folderRef)
  const actions = useItemActions({ providerId: connected ? providerId : null, parentRef: folderRef })
  const location = { title: title ?? provider?.name ?? 'Pasta', folders, files }
  const tileWidth = (width - 40 - 12) / 2
  const glyphWidth = Math.round(tileWidth * 0.86)
  const fileWidth = Math.round(tileWidth * 0.72)
  const sheetHeight = Math.round(fileWidth * (4 / 3))
  const empty = status === 'ready' && folders.length === 0 && files.length === 0

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={(
          <BrowseHeader
            title={location.title}
            providerId={folderRef ? null : providerId}
            onBack={() => navigation.goBack()}
          />
        )}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
        {!connected ? (
          <AppText style={[styles.empty, { color: theme.colors.mute }]}>
            {providerName()} ainda não está conectado. Conecte em Ajustes.
          </AppText>
        ) : null}
        {connected && status === 'error' ? (
          <Pressable accessibilityRole="button" onPress={reload}>
            <AppText style={[styles.empty, { color: theme.colors.mute }]}>
              {error?.message ?? 'Não foi possível carregar.'} Toque para tentar de novo.
            </AppText>
          </Pressable>
        ) : null}
        {connected && empty ? (
          <AppText style={[styles.empty, { color: theme.colors.mute }]}>
            Nenhum arquivo aqui ainda
          </AppText>
        ) : null}

        {location.folders.length ? (
          <View style={styles.section}>
            <AppText weight="500" style={styles.sectionTitle}>Pastas</AppText>
            <View style={styles.grid}>
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
                  <HoldMenu items={actions.folderMenu(folder)}>
                    {({ onLongPress }) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={folder.name}
                        accessibilityHint="Mantenha pressionado para ações"
                        delayLongPress={420}
                        onLongPress={onLongPress}
                        onPress={() => navigation.push('Folder', { providerId, folderRef: folder.ref })}
                      >
                        <Face width={tileWidth}>
                          <FolderMark size={glyphWidth} />
                        </Face>
                        <View style={styles.meta}>
                          <AppText weight="500" numberOfLines={1} style={styles.itemTitle}>{folder.name}</AppText>
                          <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                            Pasta · {providerName(providerId)}
                          </AppText>
                        </View>
                      </Pressable>
                    )}
                  </HoldMenu>
                </StaggerItem>
              ))}
            </View>
          </View>
        ) : null}

        {location.files.length ? (
          <View style={styles.section}>
            <AppText weight="500" style={styles.sectionTitle}>Arquivos</AppText>
            <View style={styles.grid}>
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
                  <HoldMenu items={actions.fileMenu(file)}>
                    {({ onLongPress }) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={file.name}
                        accessibilityHint="Mantenha pressionado para ações"
                        delayLongPress={420}
                        onLongPress={onLongPress}
                        onPress={() => navigation.push('File', { providerId, fileRef: file.ref })}
                      >
                        <Face width={tileWidth}>
                          <FileSheet fitted={{ width: fileWidth, height: sheetHeight }} />
                        </Face>
                        <View style={styles.meta}>
                          <AppText weight="500" numberOfLines={1} style={styles.itemTitle}>{file.name}</AppText>
                          <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                            {file.kind} · {providerName(providerId)}
                          </AppText>
                        </View>
                      </Pressable>
                    )}
                  </HoldMenu>
                </StaggerItem>
              ))}
            </View>
          </View>
        ) : null}
        </View>
      </CollapsingHeader>
      <CreateFab items={actions.createMenu()} />
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
    paddingBottom: 108,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 36,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: -0.42,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: 2,
    paddingHorizontal: 2,
    paddingTop: 10,
  },
  itemTitle: {
    fontSize: 13,
    letterSpacing: -0.39,
  },
  itemSub: {
    fontSize: 11,
    letterSpacing: -0.11,
  },
  empty: {
    fontSize: 13,
    letterSpacing: -0.26,
  },
})
