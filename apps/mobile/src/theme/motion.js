import { Easing, Platform } from 'react-native'

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1)

// react-native-web has no native animated module, so the driver must stay off there.
export const useNativeDriver = Platform.OS !== 'web'
