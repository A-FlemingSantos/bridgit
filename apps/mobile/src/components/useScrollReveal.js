import { useEffect, useState } from 'react'
import { Animated, Easing } from 'react-native'
import { useNativeDriver } from '../theme/motion'

// Distance the user must keep scrolling one way before the chrome moves: down to hide it, up to bring
// it back. Counting restarts whenever the direction changes, so a hesitant finger does not flicker it.
const HIDE_AFTER = 28
const SHOW_AFTER = 14
// Timing of the move. Leaving eases in and out, so the way out is seen (the pill's blur and fade read
// before it is gone); coming back decelerates into place. Exported so effects the native driver cannot
// run (the pill's blur) run on the JS thread with exactly the same curve, started on the same event.
export function revealMotion(hidden) {
  return hidden
    ? { duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1) }
    : { duration: 320, easing: Easing.bezier(0, 0, 0.2, 1) }
}

// Hide-on-scroll for floating chrome (the header, the Home search pill): `progress` goes from 0
// (shown) to 1 (hidden) on the native driver, and the screen itself never re-renders
// while the user scrolls. Pieces that must know the state (to take or give up touches) subscribe.
export function createScrollReveal() {
  const progress = new Animated.Value(0)
  const listeners = new Set()
  let hidden = false
  let locked = false
  let lastY = 0
  let travel = 0
  let topZone = 0

  function set(next) {
    if (next === hidden) return
    hidden = next
    Animated.timing(progress, { toValue: next ? 1 : 0, useNativeDriver, ...revealMotion(next) }).start()
    listeners.forEach((listener) => listener(next))
  }

  return {
    progress,
    isHidden: () => hidden,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    // Scrolling within this much of the top always shows the chrome (the header's own height).
    setTopZone(px) {
      topZone = Math.max(0, px)
    },
    // While locked (typing a search, say) the chrome stays where it is shown.
    lock(value) {
      locked = value
      travel = 0
      if (value) set(false)
    },
    onScroll(event) {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const y = contentOffset.y
      const delta = y - lastY
      lastY = y
      if (y <= topZone) {
        travel = 0
        set(false)
        return
      }
      // The bounce past either end is the platform, not the user.
      const end = Math.max(0, contentSize.height - layoutMeasurement.height)
      if (locked || y < 0 || y > end || delta === 0) return
      if (Math.sign(delta) !== Math.sign(travel)) travel = 0
      travel += delta
      if (travel > HIDE_AFTER) set(true)
      else if (travel < -SHOW_AFTER) set(false)
    },
  }
}

export function useScrollReveal() {
  const [reveal] = useState(createScrollReveal)
  return reveal
}

// Whether the chrome is hidden, for the one piece that needs it as state (touch handling).
export function useRevealHidden(reveal) {
  const [hidden, setHidden] = useState(() => reveal.isHidden())
  useEffect(() => {
    setHidden(reveal.isHidden())
    return reveal.subscribe(setHidden)
  }, [reveal])
  return hidden
}
