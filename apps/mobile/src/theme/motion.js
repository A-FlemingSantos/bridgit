import { Easing, Platform } from 'react-native'

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1)

// react-native-web has no native animated module, so the driver must stay off there.
export const useNativeDriver = Platform.OS !== 'web'

export const MENU_MOTION_MS = 220
export const MENU_STAGGER_START_MS = 48
export const MENU_STAGGER_STEP_MS = 36

export function menuDismissMs(count) {
  if (count <= 0) return MENU_MOTION_MS
  return MENU_MOTION_MS + MENU_STAGGER_START_MS + MENU_STAGGER_STEP_MS * (count - 1)
}
