import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated } from 'react-native'
import { easeOut, useNativeDriver } from '../theme/motion'

export default function StaggerItem({
  index = 0,
  base = 0.06,
  step = 0.04,
  distance = 8,
  duration = 350,
  style,
  children,
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(distance)).current

  useEffect(() => {
    let cancelled = false
    const play = (reduce) => {
      if (cancelled) return
      const delay = reduce ? 0 : (base + step * index) * 1000
      const motion = reduce ? 0 : duration
      if (reduce) {
        opacity.setValue(1)
        translateY.setValue(0)
        return
      }
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion,
          delay,
          easing: easeOut,
          useNativeDriver,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: motion,
          delay,
          easing: easeOut,
          useNativeDriver,
        }),
      ]).start()
    }

    AccessibilityInfo.isReduceMotionEnabled().then(play).catch(() => play(false))
    return () => {
      cancelled = true
    }
  }, [base, distance, duration, index, opacity, step, translateY])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}
