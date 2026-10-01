import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useNativeDriver } from '../theme/motion'
import { useMobileTheme } from '../theme/ThemeProvider'

export default function Spinner() {
  const { theme } = useMobileTheme()
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [spin])

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Carregando">
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: theme.colors.line,
            borderTopColor: theme.colors.mute,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 11,
  },
})
