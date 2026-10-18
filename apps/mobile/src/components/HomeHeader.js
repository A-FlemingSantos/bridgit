import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../auth/SessionContext'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { PixelPanel, PixelUser } from './PixelIcons'

// Home top bar: the side panel toggle on the left, the account (username and icon) on the right.
export default function HomeHeader({ onOpenPanel, onOpenSettings }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const { user } = useSession()
  const username = user?.username ?? ''

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
        accessibilityLabel={username ? `Ajustes da conta ${username}` : 'Ajustes'}
        onPress={onOpenSettings}
        hitSlop={8}
        style={({ pressed }) => [styles.account, pressed ? { backgroundColor: theme.colors.wash } : null]}
      >
        {username ? (
          <AppText weight="500" numberOfLines={1} style={[styles.username, { color: theme.colors.ink }]}>
            {username}
          </AppText>
        ) : null}
        <PixelUser size={24} color={theme.colors.ink} />
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
  account: {
    maxWidth: '60%',
    height: 40,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    flexShrink: 1,
    fontSize: 14,
    letterSpacing: -0.28,
  },
})
