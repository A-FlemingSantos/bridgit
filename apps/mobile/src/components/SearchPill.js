import { useEffect, useRef, useState } from 'react'
import { Animated, Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontFamilyFor } from '../theme/AppText'
import { easeOut, useNativeDriver } from '../theme/motion'
import { useMobileTheme } from '../theme/ThemeProvider'
import { PixelSearch } from './PixelIcons'
import { revealMotion, useRevealHidden } from './useScrollReveal'

const GAP = 16
const HEIGHT = 52
// How blurred the pill is once gone, in px: it dissolves as it slides away.
const HIDDEN_BLUR = 14
// The glass: what scrolls behind, blurred, under a veil of the popover color; enough of it shows
// through to read as glass, not so much that it competes with the field.
const GLASS_BLUR = 60
const GLASS_VEIL = 0.32
// Android blurs a backdrop only with this method (experimental in expo-blur).
const BLUR_METHOD = Platform.OS === 'android' ? 'dimezisBlurView' : undefined

// A view's own blur, as a style: Android draws it (12 and up, new architecture), the web as a CSS
// filter; iOS has no view blur, so there the pill only slides and fades.
function blurStyle(px) {
  if (px <= 0) return null
  if (Platform.OS === 'web') return { filter: `blur(${px}px)` }
  if (Platform.OS === 'android') return { filter: [{ blur: px }] }
  return null
}

// The Home search: a glass pill floating over the bottom of the screen, moving with the screen's other
// chrome (`reveal`, see useScrollReveal): leaving, it slides down out of the screen while it blurs and
// fades away; coming back, it rises out of the blur and sharpens as it lands. The keyboard lifts it: the
// window never moves (Android "resize" with edge to edge), so the pill follows the keyboard's height itself.
export default function SearchPill({ value, onChangeText, onFocus, onBlur, reveal, inputRef }) {
  const { theme, isDark, fontsReady } = useMobileTheme()
  const insets = useSafeAreaInsets()
  const hidden = useRevealHidden(reveal)
  const lift = useRef(new Animated.Value(0)).current
  // Blur is a style no driver animates, and a native value's frames do not reliably reach JS on the new
  // architecture, so the blur has its own value on the JS thread: same curve, same duration, started on
  // the same event as the slide. Only this pill re-renders while it moves.
  const fade = useRef(new Animated.Value(reveal.isHidden() ? 1 : 0)).current
  const [blur, setBlur] = useState(reveal.isHidden() ? HIDDEN_BLUR : 0)

  useEffect(() => {
    // The blur leads the fade: most of it is there by mid-way, while the pill is still clearly visible.
    const id = fade.addListener(({ value: next }) => setBlur(Math.round(Math.sqrt(Math.max(0, next)) * HIDDEN_BLUR * 2) / 2))
    const unsubscribe = reveal.subscribe((next) => {
      Animated.timing(fade, { toValue: next ? 1 : 0, useNativeDriver: false, ...revealMotion(next) }).start()
    })
    return () => {
      unsubscribe()
      fade.removeListener(id)
    }
  }, [reveal, fade])

  useEffect(() => {
    if (Platform.OS === 'web') return undefined
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const move = (toValue, duration) => Animated.timing(lift, {
      toValue,
      duration: duration || 220,
      easing: easeOut,
      useNativeDriver,
    }).start()
    // Android reports the keyboard without the navigation bar the pill already stands on; iOS with
    // the home indicator area, which the pill's own inset covers.
    const show = Keyboard.addListener(showEvent, (event) => {
      const height = event.endCoordinates?.height ?? 0
      move(-(Platform.OS === 'android' ? height : Math.max(0, height - insets.bottom)), event.duration)
    })
    // A keyboard closed by the system (back, a drag on the list) ends the typing too: the field lets
    // go of its focus, so no caret is left blinking in it.
    const hide = Keyboard.addListener(hideEvent, (event) => {
      move(0, event?.duration)
      inputRef.current?.blur()
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [lift, insets.bottom, inputRef])

  function clear() {
    onChangeText('')
    inputRef.current?.blur()
    Keyboard.dismiss()
  }

  // Hidden, the pill sits just below the screen's bottom edge.
  const drop = HEIGHT + GAP + insets.bottom + 12
  const translateY = Animated.add(lift, reveal.progress.interpolate({ inputRange: [0, 1], outputRange: [0, drop] }))
  // Gone a little before it reaches the edge, so the dissolve, not the edge, is what ends it.
  const opacity = reveal.progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.75, 0] })

  return (
    <Animated.View
      style={[
        styles.dock,
        { bottom: insets.bottom + GAP, opacity, transform: [{ translateY }], pointerEvents: hidden ? 'none' : 'auto' },
      ]}
    >
      <View style={[styles.pill, { borderColor: theme.colors.overlayLine }, blurStyle(blur)]}>
        <BlurView
          intensity={GLASS_BLUR}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod={BLUR_METHOD}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: GLASS_VEIL }]} />
        {/* Its own layer: on the web an in-flow child would paint under the absolute layers above. */}
        <View style={styles.content}>
          <PixelSearch size={20} color={theme.colors.mute} />
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Pesquise seus arquivos"
            placeholderTextColor={theme.colors.mute}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Buscar arquivos"
            selectionColor={theme.colors.ink}
            style={[styles.input, { color: theme.colors.ink }, fontsReady ? { fontFamily: fontFamilyFor('400') } : null]}
          />
          {value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar busca"
              hitSlop={8}
              onPress={clear}
              style={({ pressed }) => [styles.clear, pressed ? { backgroundColor: theme.colors.overlayPress } : null]}
            >
              <X size={18} strokeWidth={1.8} color={theme.colors.mute} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    maxWidth: 480,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 8,
    gap: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
