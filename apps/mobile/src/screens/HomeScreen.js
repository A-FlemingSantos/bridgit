import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { LayoutGrid, LayoutList } from 'lucide-react-native'
import CollapsingHeader from '../components/CollapsingHeader'
import CreateFab from '../components/CreateFab'
import FileSheet from '../components/FileSheet'
import HomeHeader from '../components/HomeHeader'
import HoldMenu from '../components/OverflowMenu'
import ProviderMark from '../components/ProviderMark'
import StaggerItem from '../components/StaggerItem'
import { fileMenuItems } from '../components/menus'
import { providerName, recents, shortcuts } from '../data/mock'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

function openFile(navigation, file) {
  navigation.push('File', { providerId: file.providerId, fileRef: file.ref })
}

export default function HomeScreen({ navigation }) {
  const { theme } = useMobileTheme()
  const { width } = useWindowDimensions()
  const [recentsView, setRecentsView] = useState('list')
  const tileWidth = (width - 36 - 12) / 2
  const glyphWidth = Math.round(tileWidth * 0.72)
  const sheetHeight = Math.round(glyphWidth * (4 / 3))
  const pinWidth = Math.min(172, Math.round(width * 0.44))
  const pinSheetWidth = Math.round(pinWidth * 0.76)
  const pinSheetHeight = Math.round(pinSheetWidth * (4 / 3))

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={<HomeHeader onOpenProvider={(providerId) => navigation.push('Folder', { providerId })} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
        <View style={styles.section}>
          <AppText weight="500" style={styles.sectionTitle}>Atalhos</AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pins}
          >
            {shortcuts.map((file, index) => (
              <StaggerItem key={file.ref} index={index} base={0.08} step={0.04} style={{ width: pinWidth }}>
                <HoldMenu items={fileMenuItems(() => {})}>
                  {({ onLongPress }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={file.name}
                      accessibilityHint="Mantenha pressionado para ações"
                      delayLongPress={420}
                      onPress={() => openFile(navigation, file)}
                      onLongPress={onLongPress}
                      style={styles.pin}
                    >
                      <FileSheet fitted={{ width: pinSheetWidth, height: pinSheetHeight }} />
                      <AppText weight="500" numberOfLines={1} style={styles.itemTitle}>{file.name}</AppText>
                      <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                        {providerName(file.providerId)}
                      </AppText>
                    </Pressable>
                  )}
                </HoldMenu>
              </StaggerItem>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText weight="500" style={styles.sectionTitle}>Recentes</AppText>
            <View accessibilityRole="tablist" style={styles.toggle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lista"
                accessibilityState={{ selected: recentsView === 'list' }}
                onPress={() => setRecentsView('list')}
                style={[
                  styles.viewButton,
                  recentsView === 'list' ? { backgroundColor: theme.colors.wash } : null,
                ]}
              >
                <LayoutList
                  size={15}
                  strokeWidth={1.7}
                  color={recentsView === 'list' ? theme.colors.ink : theme.colors.mute}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Grade"
                accessibilityState={{ selected: recentsView === 'grid' }}
                onPress={() => setRecentsView('grid')}
                style={[
                  styles.viewButton,
                  recentsView === 'grid' ? { backgroundColor: theme.colors.wash } : null,
                ]}
              >
                <LayoutGrid
                  size={15}
                  strokeWidth={1.7}
                  color={recentsView === 'grid' ? theme.colors.ink : theme.colors.mute}
                />
              </Pressable>
            </View>
          </View>

          {recentsView === 'list' ? (
            <View>
              {recents.map((file, index) => (
                <StaggerItem key={`${file.ref}-${file.when}`} index={index} base={0.06} step={0.025}>
                  <HoldMenu items={fileMenuItems(() => {})}>
                    {({ onLongPress }) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={file.name}
                        accessibilityHint="Mantenha pressionado para ações"
                        delayLongPress={420}
                        onPress={() => openFile(navigation, file)}
                        onLongPress={onLongPress}
                        style={({ pressed }) => [
                          styles.row,
                          pressed ? { backgroundColor: theme.colors.wash } : null,
                        ]}
                      >
                        <FileSheet compact />
                        <View style={styles.rowBody}>
                          <AppText weight="500" numberOfLines={1} style={styles.itemTitle}>{file.name}</AppText>
                          <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                            {file.kind} · {providerName(file.providerId)}
                          </AppText>
                        </View>
                        <AppText numberOfLines={1} style={[styles.when, { color: theme.colors.mute }]}>
                          {file.when}
                        </AppText>
                        <ProviderMark id={file.providerId} size={18} />
                      </Pressable>
                    )}
                  </HoldMenu>
                </StaggerItem>
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {recents.map((file, index) => (
                <StaggerItem
                  key={`${file.ref}-grid`}
                  index={index}
                  base={0.06}
                  step={0.025}
                  style={{ width: tileWidth }}
                >
                  <HoldMenu items={fileMenuItems(() => {})}>
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
                        <View style={styles.glyph}>
                          <FileSheet fitted={{ width: glyphWidth, height: sheetHeight }} />
                        </View>
                        <AppText weight="500" numberOfLines={1} style={styles.itemTitle}>{file.name}</AppText>
                        <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>
                          {file.kind} · {providerName(file.providerId)}
                        </AppText>
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
      <CreateFab />
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
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 28,
  },
  section: {
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: -0.42,
  },
  pins: {
    gap: 16,
    paddingRight: 4,
  },
  pin: {
    gap: 8,
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 13,
    letterSpacing: -0.39,
  },
  itemSub: {
    fontSize: 11,
    letterSpacing: -0.11,
  },
  toggle: {
    flexDirection: 'row',
    gap: 2,
  },
  viewButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  when: {
    width: 72,
    textAlign: 'right',
    fontSize: 11,
    letterSpacing: -0.11,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    gap: 8,
    alignItems: 'center',
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
