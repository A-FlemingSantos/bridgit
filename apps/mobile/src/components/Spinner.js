import { ActivityIndicator, View } from 'react-native'
import { useMobileTheme } from '../theme/ThemeProvider'

// The platform's own indicator: it turns on the UI thread by itself. A ring rotated by a native-driven
// Animated loop stood still on Android with the new architecture.
export default function Spinner() {
  const { theme } = useMobileTheme()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Carregando">
      <ActivityIndicator size={22} color={theme.colors.mute} />
    </View>
  )
}
