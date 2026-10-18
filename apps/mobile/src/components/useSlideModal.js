import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, BackHandler } from 'react-native'
import { easeOut, useNativeDriver } from '../theme/motion'

// Mount, slide-in and slide-out of an overlay (bottom sheet, side panel).
// The enter animation starts from `onReady` (the overlay's first layout): started any earlier, the
// animated view does not exist yet and the Android native driver jumps straight to the end value.
// The overlay stays mounted until the exit finishes; `afterClose` runs then (e.g. the action the
// user picked). While it is on screen, the Android back button calls `onClose`.
export function useSlideModal(open, { from, onClose, openMs = 280, closeMs = 220 }) {
  const offset = useRef(new Animated.Value(from)).current
  const backdrop = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(false)
  const mountedRef = useRef(false)
  const shownRef = useRef(false)
  const reduceMotion = useRef(false)
  const afterClose = useRef(null)
  const fromRef = useRef(from)
  fromRef.current = from
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!mounted) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current?.()
      return true
    })
    return () => subscription.remove()
  }, [mounted])

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduceMotion.current = Boolean(value)
    }).catch(() => {})
  }, [])

  const enter = useCallback(() => {
    shownRef.current = true
    const duration = reduceMotion.current ? 0 : openMs
    Animated.parallel([
      Animated.timing(offset, { toValue: 0, duration, easing: easeOut, useNativeDriver }),
      Animated.timing(backdrop, { toValue: 1, duration, easing: easeOut, useNativeDriver }),
    ]).start()
  }, [backdrop, offset, openMs])

  useEffect(() => {
    if (open) {
      // Reopened while still on screen: it is already laid out, so no onReady will come.
      if (shownRef.current) {
        enter()
        return
      }
      offset.setValue(fromRef.current)
      backdrop.setValue(0)
      mountedRef.current = true
      setMounted(true)
      return
    }
    if (!mountedRef.current) return
    const duration = reduceMotion.current ? 0 : closeMs
    Animated.parallel([
      Animated.timing(offset, { toValue: fromRef.current, duration, easing: easeOut, useNativeDriver }),
      Animated.timing(backdrop, { toValue: 0, duration, easing: easeOut, useNativeDriver }),
    ]).start(({ finished }) => {
      // Interrupted by a reopen: stay mounted.
      if (!finished) return
      shownRef.current = false
      mountedRef.current = false
      setMounted(false)
      const action = afterClose.current
      afterClose.current = null
      action?.()
    })
  }, [open, backdrop, closeMs, enter, offset])

  // Later layouts (a panel unfolding in the sheet) must not replay the entrance, and one that comes
  // after the overlay was already closed must not bring it back.
  const onReady = useCallback(() => {
    if (!shownRef.current && openRef.current) enter()
  }, [enter])

  return { mounted, offset, backdrop, onReady, afterClose }
}
