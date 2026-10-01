import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import {
  easeOut,
  useNativeDriver,
  MENU_MOTION_MS,
  MENU_STAGGER_START_MS,
  MENU_STAGGER_STEP_MS,
} from '../theme/motion'

function useReduceMotion() {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduce(Boolean(value))
    }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduce(Boolean(value))
    })
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduce
}

function MenuTile({ item, index, count, open, closing, reduceMotion }) {
  const { theme, isDark } = useMobileTheme()
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : -8)).current
  const Icon = item.icon
  const visible = open && !closing

  useEffect(() => {
    const delay = reduceMotion
      ? 0
      : visible
        ? MENU_STAGGER_START_MS + MENU_STAGGER_STEP_MS * index
        : MENU_STAGGER_START_MS + MENU_STAGGER_STEP_MS * (count - 1 - index)
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: reduceMotion ? 0 : MENU_MOTION_MS,
        delay,
        easing: easeOut,
        useNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : -8,
        duration: reduceMotion ? 0 : MENU_MOTION_MS,
        delay,
        easing: easeOut,
        useNativeDriver,
      }),
    ]).start()
  }, [closing, count, index, opacity, open, reduceMotion, translateY, visible])

  const pressedBackground = isDark ? '#313131' : '#e4e4e4'

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }], marginTop: item.danger ? 4 : 0 }}>
      <Pressable
        accessibilityRole="menuitem"
        disabled={item.disabled}
        onPress={item.onSelect}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: pressed ? pressedBackground : theme.colors.wash },
          item.disabled ? styles.disabled : null,
        ]}
      >
        {Icon ? (
          <Icon
            size={18}
            strokeWidth={1.6}
            color={item.danger ? theme.colors.mute : theme.colors.ink}
          />
        ) : null}
        <AppText
          numberOfLines={1}
          style={[styles.label, { color: item.danger ? theme.colors.mute : theme.colors.ink }]}
        >
          {item.label}
        </AppText>
      </Pressable>
    </Animated.View>
  )
}

export default function SuspendedMenu({ open, closing, items }) {
  const reduceMotion = useReduceMotion()

  return (
    <Animated.View accessibilityRole="menu" style={styles.menu}>
      {items.map((item, index) => (
        <MenuTile
          key={item.id}
          item={item}
          index={index}
          count={items.length}
          open={open}
          closing={closing}
          reduceMotion={reduceMotion}
        />
      ))}
    </Animated.View>
  )
}

export const MENU_TILE_HEIGHT = 44
export const MENU_TILE_GAP = 6
export const MENU_WIDTH = 208

const styles = StyleSheet.create({
  menu: {
    width: MENU_WIDTH,
    gap: MENU_TILE_GAP,
  },
  item: {
    height: MENU_TILE_HEIGHT,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    flex: 1,
    fontSize: 15,
    letterSpacing: -0.3,
  },
  disabled: {
    opacity: 0.4,
  },
})
