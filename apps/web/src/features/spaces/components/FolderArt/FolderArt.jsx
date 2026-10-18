import styles from './FolderArt.module.css'

// The folder as the folder pages draw it: a back tab peeking above a front panel, shaded from
// one base color (the one the user picked for it, carbon by default).
export default function FolderArt({ color, size = 'regular' }) {
  return (
    <span
      className={[styles.folder, size === 'small' ? styles.small : ''].filter(Boolean).join(' ')}
      style={color ? { '--folder-base': color } : undefined}
      aria-hidden="true"
    >
      <span className={styles.tab} />
      <span className={styles.body} />
    </span>
  )
}
