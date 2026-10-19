import { Pressable, StyleSheet } from 'react-native'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { useSheetKeyboard } from './ActionSheet'
import { TextField } from './SettingsParts'

// The name field grows the sheet before its keyboard opens (see ActionSheet `prepare`). A tap counts
// too: after Android's back button hides the keyboard the field keeps its focus, so tapping it
// again brings the keyboard back without a new focus event.
export function NameField(props) {
  const sheetKeyboard = useSheetKeyboard()
  return <TextField {...props} onFocus={sheetKeyboard?.prepare} onPressIn={sheetKeyboard?.prepare} />
}

// `destructive` colors a plain button's label like a dangerous menu row.
export function SheetButton({ label, onPress, variant = 'plain', disabled = false, destructive = false }) {
  const { theme } = useMobileTheme()
  const background = variant === 'solid'
    ? theme.colors.ink
    : variant === 'danger'
      ? theme.colors.danger
      : theme.colors.raise
  const color = variant !== 'plain' ? theme.colors.paper : destructive ? theme.colors.danger : theme.colors.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 },
      ]}
    >
      <AppText weight="500" style={[styles.buttonLabel, { color }]}>{label}</AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
})
