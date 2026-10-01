import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { menuDismissMs } from '../theme/motion'
import SuspendedMenu, { MENU_TILE_GAP, MENU_TILE_HEIGHT, MENU_WIDTH } from './SuspendedMenu'

function menuHeight(items) {
  const tiles = items.length * MENU_TILE_HEIGHT
  const gaps = Math.max(0, items.length - 1) * MENU_TILE_GAP
  const danger = items.some((item) => item.danger) ? 4 : 0
  return tiles + gaps + danger
}

export default function HoldMenu({ items, children }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const hostRef = useRef(null)
  const timer = useRef(null)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const visible = open || closing

  function finishClose() {
    setOpen(false)
    setClosing(false)
    setAnchor(null)
  }

  function closeMenu() {
    if (!open || closing) return
    setClosing(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(finishClose, menuDismissMs(items.length))
  }

  function openMenu() {
    if (open) return
    clearTimeout(timer.current)
    hostRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setClosing(false)
      setOpen(true)
    })
  }

  const wrapped = items.map((item) => ({
    ...item,
    onSelect: () => {
      closeMenu()
      item.onSelect?.()
    },
  }))

  const height = menuHeight(items)
  const left = anchor
    ? Math.min(
      Math.max(8, anchor.x + anchor.width - MENU_WIDTH),
      Math.max(8, screenWidth - MENU_WIDTH - 8),
    )
    : 8
  const below = anchor ? anchor.y + anchor.height + 8 : 8
  const above = anchor ? anchor.y - height - 8 : 8
  const top = anchor && below + height > screenHeight - 8 ? Math.max(8, above) : below

  return (
    <View ref={hostRef} collapsable={false}>
      {children({ onLongPress: openMenu })}
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={closeMenu} accessibilityLabel="Fechar menu" />
        <View style={[styles.panel, { top, left, width: MENU_WIDTH }]}>
          <SuspendedMenu open={open && !closing} closing={closing} items={wrapped} />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: 'absolute',
  },
})
