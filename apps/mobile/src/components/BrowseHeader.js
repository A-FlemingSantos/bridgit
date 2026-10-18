import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { PixelBack } from './PixelIcons'
import ProviderMark from './ProviderMark'

// Back button and the path as the title, like the web trail: ancestors in a softer tone (tapping
// one goes back to it) and the current folder in bold. trail: [{ title }] from the root down.
export default function BrowseHeader({ title, onBack, onCrumb = null, trail = [], providerId = null }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  // Only the closest ancestors fit beside a phone-width title.
  const shown = trail.slice(-2)
  const hidden = trail.length - shown.length

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: theme.colors.paper }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.back, pressed ? { backgroundColor: theme.colors.wash } : null]}
      >
        <PixelBack size={24} color={theme.colors.ink} />
      </Pressable>
      <View accessibilityRole="header" style={styles.trail}>
        {hidden > 0 ? (
          <View style={styles.segment}>
            <AppText style={[styles.crumb, { color: theme.colors.mute }]}>…</AppText>
            <ChevronRight size={16} strokeWidth={1.6} color={theme.colors.mute} />
          </View>
        ) : null}
        {shown.map((crumb, index) => (
          <View key={`${crumb.title}-${index}`} style={[styles.segment, styles.ancestor]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Voltar para ${crumb.title}`}
              disabled={!onCrumb}
              onPress={() => onCrumb?.(hidden + index)}
              style={styles.ancestor}
            >
              <AppText numberOfLines={1} style={[styles.crumb, { color: theme.colors.soft }]}>{crumb.title}</AppText>
            </Pressable>
            <ChevronRight size={16} strokeWidth={1.6} color={theme.colors.mute} />
          </View>
        ))}
        <AppText weight="600" numberOfLines={1} style={styles.current}>{title}</AppText>
        {providerId ? <ProviderMark id={providerId} size={22} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trail: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ancestor: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 120,
  },
  crumb: {
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.38,
  },
  current: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.38,
  },
})
