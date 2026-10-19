import { useRef, useState } from 'react'
import {
  Animated,
  Linking,
 
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronRight, FileText, Plus } from 'lucide-react-native'
import { useProviders, usePublicLinks } from '../hub/hooks'
import { needsReconnect } from '../hub/format'
import { errorMessage } from '../api/errorMessage'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { useNativeDriver } from '../theme/motion'
import { SheetHeader } from './ActionSheet'
import FileSheet from './FileSheet'
import HoldMenu from './OverflowMenu'
import { PixelFolder, PixelGear, PixelHome, PixelLink, PixelMore, PixelUnlink } from './PixelIcons'
import ProviderMark from './ProviderMark'
import { Overlay } from './OverlayHost'
import { useSlideModal } from './useSlideModal'

const PROVIDER_LABELS = { onedrive: 'OneDrive', 'google-drive': 'Google Drive', dropbox: 'Dropbox' }

function Group({ title, children }) {
  const { theme } = useMobileTheme()
  const [open, setOpen] = useState(true)
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.groupToggle}
        hitSlop={4}
      >
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRight size={14} strokeWidth={1.8} color={theme.colors.mute} />
        </View>
        <AppText weight="500" style={[styles.groupTitle, { color: theme.colors.mute }]}>{title}</AppText>
      </Pressable>
      {open ? <View style={styles.list}>{children}</View> : null}
    </View>
  )
}

function Item({ icon, title, subtitle = null, active = false, ghost = false, onPress, onMore = null, label }) {
  const { theme } = useMobileTheme()
  return (
    <View style={styles.itemWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? title}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onLongPress={onMore ?? undefined}
        delayLongPress={420}
        style={({ pressed }) => [
          styles.item,
          active || pressed ? { backgroundColor: theme.colors.raise } : null,
          ghost ? styles.ghost : null,
        ]}
      >
        <View style={styles.itemIcon}>{icon}</View>
        <View style={styles.itemMeta}>
          <AppText numberOfLines={1} style={[styles.itemName, { color: active ? theme.colors.ink : theme.colors.soft }]}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText numberOfLines={1} style={[styles.itemSub, { color: theme.colors.mute }]}>{subtitle}</AppText>
          ) : null}
        </View>
      </Pressable>
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ações de ${title}`}
          onPress={onMore}
          hitSlop={6}
          style={styles.more}
        >
          <PixelMore size={18} color={theme.colors.mute} />
        </Pressable>
      ) : null}
    </View>
  )
}

// A folder link shows a folder; a file link shows the link icon.
function LinkIcon({ kind, ...props }) {
  return kind === 'folder' ? <PixelFolder {...props} /> : <PixelLink {...props} />
}

function Empty({ children, onPress = null }) {
  const { theme } = useMobileTheme()
  const text = <AppText style={[styles.empty, { color: theme.colors.mute }]}>{children}</AppText>
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{text}</Pressable> : text
}

// The web side panel, adapted to a drawer: providers, public links and shortcuts.
// `go(fn)` closes the drawer first and runs `fn` once it is gone, so the next screen is not covered.
export default function SidePanel({ open, onClose, shortcuts, shortcutsStatus, actions, onOpenFile, onOpenProvider, onOpenSettings }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const { width: screenWidth } = useWindowDimensions()
  const width = Math.min(320, Math.round(screenWidth * 0.84))
  const { providers, status: providersStatus, reload: reloadProviders } = useProviders()
  const linksQuery = usePublicLinks()
  const { mounted, offset: translateX, backdrop, onReady, afterClose } = useSlideModal(open, {
    onClose, from: -width })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => translateX.setValue(Math.min(0, gesture.dx)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -80 || gesture.vx < -0.8) {
        onCloseRef.current?.()
        return
      }
      Animated.spring(translateX, { toValue: 0, bounciness: 0, useNativeDriver }).start()
    },
  })).current

  function go(action) {
    afterClose.current = action
    onClose()
  }

  if (!mounted) return null

  const icon = (Icon) => <Icon size={18} strokeWidth={1.7} color={theme.colors.mute} />

  return (
    <Overlay>
      <View style={StyleSheet.absoluteFill} onLayout={onReady}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar painel" />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityViewIsModal
        style={[
          styles.panel,
          {
            width,
            backgroundColor: theme.colors.wash,
            borderColor: theme.colors.line,
            paddingTop: insets.top + 20,
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{ translateX }],
          },
        ]}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <AppText weight="500" style={styles.title}>Bridgit</AppText>

          <Item icon={<PixelHome size={24} color={theme.colors.mute} />} title="Início" active onPress={onClose} />

          <Group title="Provedores">
            {providersStatus === 'loading' ? <Empty>Carregando…</Empty> : null}
            {providersStatus === 'error' ? (
              <Empty onPress={reloadProviders}>Não foi possível carregar os provedores. Toque para tentar de novo.</Empty>
            ) : null}
            {providersStatus === 'ready' ? providers.map((provider) => {
              const expired = needsReconnect(provider)
              const connected = provider.connected && !expired
              return (
                <Item
                  key={provider.id}
                  icon={<ProviderMark id={provider.id} size={24} />}
                  title={provider.name}
                  subtitle={expired
                    ? 'Acesso expirado · Reconectar'
                    : provider.connected ? provider.account?.email ?? 'Conectado' : 'Conectar'}
                  ghost={!provider.connected}
                  onPress={() => go(connected ? () => onOpenProvider(provider.id) : onOpenSettings)}
                />
              )
            }) : null}
            <Item icon={icon(Plus)} title="Nova conta" onPress={() => go(onOpenSettings)} />
          </Group>

          <Group title="Links públicos">
            {linksQuery.status === 'loading' ? <Empty>Carregando…</Empty> : null}
            {linksQuery.status === 'error' ? (
              <Empty onPress={linksQuery.reload}>{errorMessage(linksQuery.error, 'Não foi possível carregar.')}</Empty>
            ) : null}
            {linksQuery.status === 'ready' && linksQuery.links.length === 0 ? (
              <Empty>Nenhum link. Publique um arquivo ou uma pasta pelo menu.</Empty>
            ) : null}
            {linksQuery.links.map((link) => {
              const providerName = PROVIDER_LABELS[link.providerId] ?? link.providerId
              const subtitle = link.when ? `${providerName} · ${link.when}` : providerName
              return (
                <HoldMenu
                  key={`${link.providerId}-${link.ref}`}
                  header={<SheetHeader leading={<LinkIcon kind={link.kind} size={24} color={theme.colors.mute} />} title={link.name} subtitle={subtitle} />}
                  items={[
                    { id: 'view', label: 'Ver link', icon: PixelLink, onSelect: () => actions.manageLink(link) },
                    { id: 'share', label: 'Compartilhar link', icon: PixelLink, onSelect: () => actions.shareUrl(link.url) },
                    { id: 'disable', label: 'Desativar link', icon: PixelUnlink, danger: true, onSelect: () => actions.disableLink(link) },
                  ]}
                >
                  {({ openMenu }) => (
                    <Item
                      icon={<LinkIcon kind={link.kind} size={18} color={theme.colors.mute} />}
                      title={link.name}
                      label={`${link.kind === 'folder' ? 'Pasta pública' : 'Link público'} de ${link.name}`}
                      subtitle={subtitle}
                      onPress={() => Linking.openURL(link.url).catch(() => {})}
                      onMore={openMenu}
                    />
                  )}
                </HoldMenu>
              )
            })}
          </Group>

          <Group title="Atalhos">
            {shortcutsStatus === 'loading' ? <Empty>Carregando…</Empty> : null}
            {shortcutsStatus !== 'loading' && shortcuts.length === 0 ? (
              <Empty>Fixe arquivos pelo menu deles para tê-los aqui.</Empty>
            ) : null}
            {shortcuts.map((file) => (
              <HoldMenu
                key={`${file.providerId}-${file.ref}`}
                header={(
                  <SheetHeader
                    centered
                    leading={<FileSheet file={file} size={48} />}
                    title={file.name}
                    subtitle={`${file.kind} · ${PROVIDER_LABELS[file.providerId] ?? file.providerId}`}
                  />
                )}
                items={actions.fileMenu(file)}
              >
                {({ openMenu }) => (
                  <Item
                    icon={icon(FileText)}
                    title={file.name}
                    onPress={() => go(() => onOpenFile(file))}
                    onMore={openMenu}
                  />
                )}
              </HoldMenu>
            ))}
          </Group>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
          <Item icon={<PixelGear size={18} color={theme.colors.mute} />} title="Ajustes" onPress={() => go(onOpenSettings)} />
        </View>
      </Animated.View>
      </View>
    </Overlay>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    // Same rounding as the bottom sheets, on the edge that faces the screen.
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  scroll: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 20,
  },
  title: {
    paddingHorizontal: 10,
    fontSize: 18,
    letterSpacing: -0.54,
  },
  group: {
    gap: 4,
  },
  groupToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 10,
  },
  groupTitle: {
    fontSize: 12.5,
    letterSpacing: -0.12,
  },
  list: {
    gap: 2,
  },
  itemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    width: 24,
    alignItems: 'center',
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  itemName: {
    fontSize: 14,
    letterSpacing: -0.28,
  },
  itemSub: {
    fontSize: 11.5,
  },
  ghost: {
    opacity: 0.42,
  },
  more: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
