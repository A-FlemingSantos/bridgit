import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import ProviderMark from './ProviderMark'

export default function BrowseHeader({ title, onBack, providerId = null }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: theme.colors.paper }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={onBack}
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={22} strokeWidth={1.75} color={theme.colors.ink} />
      </Pressable>
      <View style={styles.titleRow}>
        <AppText weight="500" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        {providerId ? <ProviderMark id={providerId} size={28} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flexShrink: 1,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -1.54,
  },
})
