import { Pressable, StyleSheet, View } from 'react-native'
import { FOLDER_COLORS } from '../hub/folderColors'
import { PixelCheck } from './PixelIcons'

export default function FolderColorPalette({ selectedId, onPick }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Cor da pasta" style={styles.palette}>
      {FOLDER_COLORS.map((color) => {
        const selected = color.id === selectedId
        return (
          <Pressable
            key={color.id}
            accessibilityRole="radio"
            accessibilityLabel={color.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onPick(color.id)}
            style={[styles.swatch, { backgroundColor: color.hex }]}
          >
            {selected ? <PixelCheck size={16} color={color.light ? '#1c1c1c' : '#ffffff'} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
