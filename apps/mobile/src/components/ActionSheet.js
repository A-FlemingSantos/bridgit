import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Keyboard, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { easeOut, useNativeDriver } from '../theme/motion'
import { Overlay } from './OverlayHost'
import { useSlideModal } from './useSlideModal'

// Height the body grew by the last time a keyboard opened, kept for the whole app session.
let lastKeyboardGrowth = 0

// Lets a field inside the sheet grow the body before its keyboard opens (see `prepare` below).
const SheetKeyboardContext = createContext(null)

export function useSheetKeyboard() {
  return useContext(SheetKeyboardContext)
}

const KEYBOARD_MS = 250
// Share of the window an Android keyboard takes (navigation bar included), used before the first one
// has reported its real height. Slightly high on purpose: a gap under the buttons beats covering them.
const FIRST_KEYBOARD_RATIO = 0.4

// How far the body grows for the keyboard. Android sends one event when the keyboard shows, with
// its height minus the system bars (and only one: later height changes are not reported), so the
// navigation bar under it is added back. The distance from the keyboard's top edge to the bottom of
// the sheet's layer measures the same thing another way; the larger wins, since a gap under the
// buttons is better than the keyboard covering them.
function keyboardGrowth(event, layerHeight, bottomInset) {
  const { height = 0, screenY = 0 } = event.endCoordinates ?? {}
  if (Platform.OS !== 'android') return height
  const fromHeight = height + bottomInset
  const fromEdge = layerHeight && screenY ? layerHeight - screenY : 0
  return Math.max(fromHeight, fromEdge)
}
const OPEN_MS = 280
const CLOSE_MS = 220
const OFFSCREEN = 640
const DISMISS_DISTANCE = 90
const DISMISS_VELOCITY = 0.9

// Large square choices across the top of the sheet, like the upload shortcuts on the providers' apps.
function Tile({ item, onPick }) {
  const { theme } = useMobileTheme()
  const Icon = item.icon
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: Boolean(item.disabled) }}
      disabled={item.disabled}
      onPress={() => onPick(item)}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? theme.colors.sheetPress : theme.colors.sheetRaise },
        item.disabled ? styles.disabled : null,
      ]}
    >
      {Icon ? <Icon size={24} color={theme.colors.ink} /> : null}
      <AppText numberOfLines={2} style={[styles.tileLabel, { color: theme.colors.ink }]}>{item.label}</AppText>
    </Pressable>
  )
}

function Row({ item, expanded, onPick, onClose }) {
  const { theme } = useMobileTheme()
  const Icon = item.icon
  const color = item.danger ? theme.colors.danger : theme.colors.ink
  return (
    <View style={{ backgroundColor: theme.colors.sheetRaise }}>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityLabel={item.label}
        accessibilityState={{ disabled: Boolean(item.disabled), expanded: item.panel ? expanded : undefined }}
        disabled={item.disabled}
        onPress={() => onPick(item)}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: theme.colors.sheetPress } : null,
          item.disabled ? styles.disabled : null,
        ]}
      >
        {Icon ? <Icon size={24} color={color} /> : null}
        <View style={styles.rowBody}>
          <AppText numberOfLines={1} style={[styles.rowLabel, { color }]}>{item.label}</AppText>
          {item.hint ? (
            <AppText numberOfLines={1} style={[styles.rowHint, { color: theme.colors.mute }]}>{item.hint}</AppText>
          ) : null}
        </View>
        {item.swatch ? <View style={[styles.swatch, { backgroundColor: item.swatch }]} /> : null}
      </Pressable>
      {item.panel && expanded ? <View style={styles.panel}>{item.panel({ close: onClose })}</View> : null}
    </View>
  )
}

// Bottom sheet for an item's actions: optional header, a row of tiles and a grouped list.
// items / tiles: [{ id, label, hint?, icon, danger?, disabled?, onSelect?, swatch?, panel?({ close }) }].
// An item with `panel` opens it under its row instead of closing the sheet. `onSelect` runs once
// the sheet has slid away, so a dialog or picker it opens never fights the closing modal.
// `children` (a form, a confirmation) goes under the list.
export default function ActionSheet({ open, onClose, header = null, tiles = [], items = [], children = null }) {
  const insets = useSafeAreaInsets()
  const { theme } = useMobileTheme()
  const { mounted, offset: translateY, backdrop, onReady, afterClose } = useSlideModal(open, {
    onClose,
    from: OFFSCREEN,
    openMs: OPEN_MS,
    closeMs: CLOSE_MS,
  })
  const [expandedId, setExpandedId] = useState(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // The keyboard covers the bottom of the window, so a sheet with a field grows its body by the
  // keyboard's height and keeps its content, buttons included, above it. The sheet itself never
  // leaves the bottom edge, so closing the keyboard never shows it floating back down. The window
  // never moves (Android keyboard mode "resize" with edge to edge); iOS "will" events let the
  // content move with the keyboard.
  // Space under the content: the bottom inset at rest, the keyboard's height while it is up. It is a
  // height, so it animates on the JS driver; the sheet's own slide keeps the native one.
  const rest = Math.max(insets.bottom, 12)
  const restRef = useRef(rest)
  restRef.current = rest
  const keyboardRef = useRef(0)
  const space = useRef(new Animated.Value(rest)).current
  const insetsRef = useRef(insets)
  insetsRef.current = insets
  // Height of the layer the sheet sits in (the whole window, edge to edge).
  const layerHeightRef = useRef(0)

  useEffect(() => {
    if (!keyboardRef.current) space.setValue(rest)
  }, [rest, space])

  const move = useCallback((height, duration = KEYBOARD_MS) => {
    keyboardRef.current = height
    Animated.timing(space, {
      toValue: height || restRef.current,
      duration: duration || KEYBOARD_MS,
      easing: easeOut,
      useNativeDriver: false,
    }).start()
  }, [space])

  // Called when a field in the sheet takes focus. A field that is on screen but covered when its
  // keyboard opens makes Android pan the whole window up, and that pan stays on top of the body's own
  // growth; growing first by the last known height keeps the field clear, so Android never pans.
  // The first time in the session no height is known yet, so an estimate stands in until the
  // keyboard's own event arrives and corrects it.
  const prepare = useCallback(() => {
    if (Platform.OS !== 'android') return
    move(lastKeyboardGrowth || Math.round(Dimensions.get('window').height * FIRST_KEYBOARD_RATIO))
  }, [move])
  const keyboardContext = useMemo(() => ({ prepare }), [prepare])

  useEffect(() => {
    if (Platform.OS === 'web' || !mounted) return undefined
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (event) => {
      const growth = keyboardGrowth(event, layerHeightRef.current, insetsRef.current.bottom)
      lastKeyboardGrowth = growth
      move(growth, event.duration)
    })
    const hide = Keyboard.addListener(hideEvent, (event) => move(0, event?.duration))
    return () => {
      show.remove()
      hide.remove()
      keyboardRef.current = 0
      space.setValue(restRef.current)
    }
  }, [mounted, move, space])

  // A sheet opens with every panel folded.
  useEffect(() => {
    if (open) setExpandedId(null)
  }, [open])

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
        onCloseRef.current?.()
        return
      }
      Animated.spring(translateY, { toValue: 0, bounciness: 0, useNativeDriver }).start()
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateY, { toValue: 0, bounciness: 0, useNativeDriver }).start()
    },
  })).current

  function pick(item) {
    if (item.panel) {
      setExpandedId((current) => (current === item.id ? null : item.id))
      return
    }
    afterClose.current = item.onSelect ?? null
    onClose()
  }

  if (!mounted) return null

  return (
    <Overlay>
      <SheetKeyboardContext.Provider value={keyboardContext}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(event) => {
          layerHeightRef.current = event.nativeEvent.layout.height
          onReady()
        }}
      >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim, opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar menu" />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.sheet,
            paddingBottom: 0,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handleZone}>
          <View style={[styles.handle, { backgroundColor: theme.colors.mute }]} />
        </View>
        {header ? <View style={styles.header}>{header}</View> : null}
        {tiles.length ? (
          <View accessibilityRole="menu" style={styles.tiles}>
            {tiles.map((item) => <Tile key={item.id} item={item} onPick={pick} />)}
          </View>
        ) : null}
        {items.length ? (
          <View accessibilityRole="menu" style={[styles.group, { backgroundColor: theme.colors.sheet }]}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onPick={pick}
                onClose={onClose}
              />
            ))}
          </View>
        ) : null}
        {children}
        {/* The sheet stays on the bottom edge; with the keyboard up its body grows under it.
            The negative margin cancels the sheet's gap, so the space is exactly inset + 12. */}
        <Animated.View style={{ height: Animated.add(space, 12), marginTop: -16 }} />
      </Animated.View>
      </View>
      </SheetKeyboardContext.Provider>
    </Overlay>
  )
}

// Name and meta line at the top of an item's sheet, with its cover beside them; `centered` stacks
// cover, name and meta down the middle (the file and folder sheets).
export function SheetHeader({ leading = null, title, subtitle = null, centered = false }) {
  const { theme } = useMobileTheme()
  return (
    <View style={centered ? styles.headerStack : styles.headerRow}>
      {leading ? <View style={centered ? null : styles.leading}>{leading}</View> : null}
      <View style={centered ? styles.headerStackBody : styles.headerBody}>
        <AppText
          weight="500"
          numberOfLines={1}
          style={[styles.headerTitle, centered ? styles.headerCentered : null]}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            numberOfLines={1}
            style={[styles.headerSub, { color: theme.colors.mute }, centered ? styles.headerCentered : null]}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 16,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.45,
  },
  header: {
    paddingHorizontal: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leading: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStack: {
    alignItems: 'center',
    gap: 10,
  },
  headerStackBody: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 2,
  },
  headerCentered: {
    textAlign: 'center',
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 12.5,
    letterSpacing: -0.12,
  },
  tiles: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    minHeight: 96,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tileLabel: {
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    gap: 2,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    fontSize: 16,
    letterSpacing: -0.32,
  },
  rowHint: {
    fontSize: 12.5,
    letterSpacing: -0.12,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  panel: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  disabled: {
    opacity: 0.4,
  },
})
