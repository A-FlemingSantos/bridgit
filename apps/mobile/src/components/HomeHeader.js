import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { providers } from '../data/mock'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import ProviderMark from './ProviderMark'

const USER_INITIAL = 'A'

export default function HomeHeader({ onOpenProvider }) {
  const insets = useSafeAreaInsets()
  const { theme, isDark } = useMobileTheme()
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? null)
  const selectedFill = isDark ? '#3a3a3a' : theme.colors.paper

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10, backgroundColor: theme.colors.paper }]}>
      <View
        accessibilityRole="image"
        accessibilityLabel="Conta"
        style={[styles.avatar, { backgroundColor: theme.colors.ink }]}
      >
        <AppText weight="500" style={[styles.initial, { color: theme.colors.paper }]}>
          {USER_INITIAL}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.wash }]}>
        {providers.map((provider) => {
          const selected = provider.id === selectedId
          return (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              accessibilityLabel={provider.name}
              accessibilityState={{ selected }}
              onPress={() => {
                setSelectedId(provider.id)
                onOpenProvider(provider.id)
              }}
              style={[
                styles.segment,
                selected ? { backgroundColor: selectedFill } : null,
              ]}
            >
              <ProviderMark id={provider.id} size={16} />
              <AppText
                numberOfLines={1}
                weight={selected ? '500' : '400'}
                style={[styles.segmentLabel, { color: selected ? theme.colors.ink : theme.colors.mute }]}
              >
                {provider.name}
              </AppText>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  track: {
    marginLeft: 'auto',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    padding: 3,
    borderRadius: 999,
    gap: 2,
  },
  segment: {
    flexShrink: 1,
    minWidth: 0,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  segmentLabel: {
    flexShrink: 1,
    fontSize: 12,
    letterSpacing: -0.12,
  },
})
