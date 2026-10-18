import { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMobileTheme } from '../theme/ThemeProvider'
import ActionSheet from './ActionSheet'
import { PixelPlus } from './PixelIcons'

// The "+" button of a folder; its choices open in a bottom sheet, tiles across the top and a list.
export default function CreateFab({ tiles = [], items = [] }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const [open, setOpen] = useState(false)

  if (tiles.length === 0 && items.length === 0) return null

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Criar"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          {
            bottom: Math.max(insets.bottom, 16) + 8,
            backgroundColor: theme.colors.ink,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <PixelPlus size={24} color={theme.colors.paper} />
      </Pressable>
      <ActionSheet open={open} onClose={() => setOpen(false)} tiles={tiles} items={items} />
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    zIndex: 21,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
