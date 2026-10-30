import { useEffect, useRef, useState } from 'react'
import { Animated, BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { easeOut, useNativeDriver } from '../theme/motion'
import { Overlay } from './OverlayHost'
import { PixelCheck } from './PixelIcons'

const MENU_MS = 180
const MENU_WIDTH = 220
const EDGE = 16

// Small menu that drops from the button it belongs to (`anchor`, a ref to that view), in the
// theme's raised surface. Items: { id, label, icon, selected, onSelect }.
export default function AnchoredMenu({ open, anchor, onClose, items, label }) {
  const { theme, isDark } = useMobileTheme()
  const { width } = useWindowDimensions()
  const [frame, setFrame] = useState(null)
  const [mounted, setMounted] = useState(false)
  const progress = useRef(new Animated.Value(0)).current
  const laidOut = useRef(false)

  const enterNow = () => Animated.timing(progress, { toValue: 1, duration: MENU_MS, easing: easeOut, useNativeDriver }).start()

  useEffect(() => {
    if (open) {
      anchor.current?.measureInWindow((x, y, w, h) => {
        setFrame({ x, y, w, h })
        setMounted(true)
        // Reopened while still closing: the view exists, so it can head back in right away.
        if (laidOut.current) enterNow()
      })
      return
    }
    Animated.timing(progress, { toValue: 0, duration: MENU_MS, easing: easeOut, useNativeDriver }).start(({ finished }) => {
      if (!finished) return
      laidOut.current = false
      setMounted(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, open, progress])

  useEffect(() => {
    if (!open) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => subscription.remove()
  }, [onClose, open])

  // A short fade and drop, started on the menu's first layout: started before the view exists,
  // Android's native driver would jump straight to the end.
  const enter = () => {
    if (laidOut.current) return
    laidOut.current = true
    if (open) enterNow()
  }

  if (!mounted || !frame) return null

  // Starts at the button's left edge, kept on screen.
  const left = Math.max(EDGE, Math.min(frame.x, width - MENU_WIDTH - EDGE))

  return (
    <Overlay>
      <Pressable accessibilityLabel="Fechar menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View
        accessibilityRole="menu"
        accessibilityLabel={label}
        onLayout={enter}
        style={[
          styles.menu,
          {
            top: frame.y + frame.h + 6,
            left,
            backgroundColor: theme.colors.overlay,
            borderColor: theme.colors.overlayLine,
            shadowOpacity: isDark ? 0.4 : 0.12,
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
            ],
          },
        ]}
      >
        {items.map(({ id, label: itemLabel, icon: Icon, selected, onSelect }) => (
          <Pressable
            key={id}
            accessibilityRole="menuitem"
            accessibilityState={{ selected }}
            onPress={() => {
              onSelect()
              onClose()
            }}
            style={({ pressed }) => [styles.item, pressed ? { backgroundColor: theme.colors.overlayPress } : null]}
          >
            <View style={styles.icon}>{Icon ? <Icon size={20} color={theme.colors.mute} /> : null}</View>
            <AppText numberOfLines={1} style={[styles.label, { color: theme.colors.ink }]}>{itemLabel}</AppText>
            {selected ? <PixelCheck size={18} color={theme.colors.ink} /> : null}
          </Pressable>
        ))}
      </Animated.View>
    </Overlay>
  )
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    padding: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  item: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 20,
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.28,
  },
})
