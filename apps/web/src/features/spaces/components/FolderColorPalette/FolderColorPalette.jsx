import { Check } from 'lucide-react'
import { FOLDER_COLORS } from '../../folderColors.js'
import styles from './FolderColorPalette.module.css'

export default function FolderColorPalette({ selectedId, onPick }) {
  return (
    <div className={styles.palette} role="group" aria-label="Cor da pasta">
      {FOLDER_COLORS.map((color) => {
        const selected = color.id === selectedId
        return (
          <button
            key={color.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            aria-label={color.label}
            title={color.label}
            className={styles.swatch}
            style={{ '--swatch': color.hex, color: color.light ? '#1c1c1c' : '#ffffff' }}
            onClick={() => onPick(color.id)}
          >
            {selected ? <Check size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
          </button>
        )
      })}
    </div>
  )
}
