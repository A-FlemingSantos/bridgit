import { useState } from 'react'
import { Animated, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRevealHidden, useScrollReveal } from './useScrollReveal'

// A screen's scroll with its header floating on top: the header slides away while the user scrolls
// down and comes back as soon as they scroll up (see useScrollReveal). A screen with more floating
// chrome (the Home search pill) passes its own `reveal`, so everything moves together.
export default function CollapsingHeader({
  header,
  children,
  contentContainerStyle,
  reveal: sharedReveal = null,
  onScroll = null,
  ...scrollProps
}) {
  const insets = useSafeAreaInsets()
  const ownReveal = useScrollReveal()
  const reveal = sharedReveal ?? ownReveal
  const [headerHeight, setHeaderHeight] = useState(0)

  function handleScroll(event) {
    reveal.onScroll(event)
    onScroll?.(event)
  }

  return (
    <View style={styles.root}>
      <ScrollView
        {...scrollProps}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // The screen runs under the system navigation bar, so the end of the list clears it.
        contentContainerStyle={[
          contentContainerStyle,
          {
            paddingTop: headerHeight,
            paddingBottom: (StyleSheet.flatten(contentContainerStyle)?.paddingBottom ?? 0) + insets.bottom,
          },
        ]}
      >
        {children}
      </ScrollView>
      <HeaderLayer
        reveal={reveal}
        height={headerHeight}
        onHeight={(next) => {
          setHeaderHeight(next)
          // Until the content has passed under the whole header, it stays.
          reveal.setTopZone(next)
        }}
      >
        {header}
      </HeaderLayer>
    </View>
  )
}

// Its own component, so taking and giving up touches re-renders only the header, never the list.
function HeaderLayer({ reveal, height, onHeight, children }) {
  const hidden = useRevealHidden(reveal)
  const translateY = reveal.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -height] })
  return (
    <Animated.View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height)
        if (next > 0 && next !== height) onHeight(next)
      }}
      style={[styles.header, { transform: [{ translateY }], pointerEvents: hidden ? 'none' : 'auto' }]}
    >
      {children}
    </Animated.View>
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
