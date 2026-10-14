import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useMobileTheme } from '../theme/ThemeProvider'

export default function FileSheet({ large = false, compact = false, fitted = null }) {
  const { theme, isDark } = useMobileTheme()
  const { width } = useWindowDimensions()
  const largeWidth = Math.min(220, Math.round(width * 0.42))
  const ruleColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(10,10,10,0.22)'
  const backgroundColor = isDark ? '#434343' : theme.colors.paper
  const borderColor = isDark ? 'transparent' : theme.colors.line
  const pad = fitted ? Math.max(6, Math.round(fitted.width * 0.14)) : compact ? 4 : large ? 22 : 10

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.sheet,
        {
          backgroundColor,
          borderColor,
          gap: compact ? 3 : large ? 14 : Math.max(4, Math.round(pad * 0.45)),
          paddingHorizontal: compact ? 4 : pad,
          paddingVertical: compact ? 5 : large ? 28 : pad,
        },
        compact ? styles.compact : large ? { width: largeWidth, aspectRatio: 3 / 4 } : null,
        fitted ? { width: fitted.width, height: fitted.height } : null,
      ]}
    >
      <View style={[styles.rule, { width: '62%', height: large ? 2 : 1, backgroundColor: ruleColor }]} />
      <View style={[styles.rule, { width: '88%', height: large ? 2 : 1, backgroundColor: ruleColor }]} />
      <View style={[styles.rule, { width: '74%', height: large ? 2 : 1, backgroundColor: ruleColor }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderWidth: 1,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  compact: {
    width: 28,
    height: 37,
  },
})
