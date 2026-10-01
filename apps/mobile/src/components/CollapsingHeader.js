import { useRef, useState } from 'react'
import { Animated, ScrollView, StyleSheet, View } from 'react-native'
import { easeOut, useNativeDriver } from '../theme/motion'

const TOP_REVEAL_PX = 12
const MOTION_MS = 320

export default function CollapsingHeader({
  header,
  children,
  contentContainerStyle,
  ...scrollProps
}) {
  const translateY = useRef(new Animated.Value(0)).current
  const headerHeightRef = useRef(0)
  const retractedRef = useRef(false)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [retracted, setRetracted] = useState(false)

  function setRetractedIfChanged(next) {
    if (retractedRef.current === next) return
    retractedRef.current = next
    setRetracted(next)
    Animated.timing(translateY, {
      toValue: next ? -headerHeightRef.current : 0,
      duration: MOTION_MS,
      easing: easeOut,
      useNativeDriver,
    }).start()
  }

  function handleScroll(event) {
    const top = event.nativeEvent.contentOffset.y
    const boundary = Math.max(TOP_REVEAL_PX, headerHeightRef.current)
    setRetractedIfChanged(top > boundary)
  }

  return (
    <View style={styles.root}>
      <ScrollView
        {...scrollProps}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[contentContainerStyle, { paddingTop: headerHeight }]}
      >
        {children}
      </ScrollView>
      <Animated.View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height)
          if (next <= 0 || next === headerHeightRef.current) return
          headerHeightRef.current = next
          setHeaderHeight(next)
        }}
        style={[
          styles.header,
          {
            transform: [{ translateY }],
            pointerEvents: retracted ? 'none' : 'auto',
          },
        ]}
      >
        {header}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
  },
})
