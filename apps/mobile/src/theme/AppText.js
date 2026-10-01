import { Text } from 'react-native'
import { useMobileTheme } from './ThemeProvider'

const FAMILIES = {
  400: 'Geist_400Regular',
  500: 'Geist_500Medium',
  600: 'Geist_600SemiBold',
  700: 'Geist_700Bold',
}

export function fontFamilyFor(weight = '400') {
  return FAMILIES[weight] ?? FAMILIES[400]
}

export default function AppText({ weight = '400', style, ...props }) {
  const { theme, fontsReady } = useMobileTheme()

  return (
    <Text
      {...props}
      style={[
        { color: theme.colors.ink },
        fontsReady ? { fontFamily: fontFamilyFor(weight) } : null,
        style,
      ]}
    />
  )
}
