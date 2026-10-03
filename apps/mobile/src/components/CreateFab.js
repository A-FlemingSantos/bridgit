import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMobileTheme } from '../theme/ThemeProvider'
import { menuDismissMs } from '../theme/motion'
import SuspendedMenu from './SuspendedMenu'

export default function CreateFab({ items: createItems = [] }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const timer = useRef(null)
  const openRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  function closeMenu() {
    if (!openRef.current) return
    setClosing(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      openRef.current = false
      setOpen(false)
      setClosing(false)
    }, menuDismissMs(5))
  }

  function toggleMenu() {
    if (openRef.current) {
      closeMenu()
      return
    }
    clearTimeout(timer.current)
    openRef.current = true
    setClosing(false)
    setOpen(true)
  }

  const visible = open || closing
  if (createItems.length === 0) return null
  const items = createItems.map((item) => ({
    ...item,
    onSelect: () => {
      closeMenu()
      item.onSelect?.()
    },
  }))

  return (
    <>
      {visible ? (
        <Pressable
          style={styles.backdrop}
          onPress={closeMenu}
          accessibilityLabel="Fechar criar"
        />
      ) : null}
      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
        {visible ? (
          <View style={styles.menu}>
            <SuspendedMenu open={open && !closing} closing={closing} items={items} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Fechar criar' : 'Criar'}
          accessibilityState={{ expanded: open }}
          onPress={toggleMenu}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.colors.ink, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Plus size={22} strokeWidth={1.75} color={theme.colors.paper} />
        </Pressable>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  dock: {
    position: 'absolute',
    right: 20,
    zIndex: 21,
    alignItems: 'flex-end',
  },
  menu: {
    marginBottom: 8,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
