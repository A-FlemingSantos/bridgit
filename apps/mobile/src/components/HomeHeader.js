import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../auth/SessionContext'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { PixelPanel } from './PixelIcons'

// Home top bar: the side panel toggle on the left, the account on the right.
export default function HomeHeader({ onOpenPanel, onOpenSettings }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const { user } = useSession()
  const initial = (user?.username ?? '?').charAt(0).toUpperCase()

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: theme.colors.paper }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir painel"
        onPress={onOpenPanel}
        hitSlop={8}
        style={({ pressed }) => [styles.icon, pressed ? { backgroundColor: theme.colors.wash } : null]}
      >
        <PixelPanel size={24} color={theme.colors.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajustes"
        onPress={onOpenSettings}
        hitSlop={8}
        style={[styles.avatar, { backgroundColor: theme.colors.ink }]}
      >
        <AppText weight="500" style={[styles.initial, { color: theme.colors.paper }]}>
          {initial}
        </AppText>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    marginRight: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 12,
    letterSpacing: 0.4,
  },
})
