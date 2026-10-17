import styles from './OpenChoices.module.css'

// Docked card of the file menu's "Abrir" item: pick where the file opens.
export default function OpenChoices({ onNewTab, onHere }) {
  return (
    <div className={styles.choices} role="group" aria-label="Abrir arquivo">
      <button type="button" role="menuitem" className={styles.choice} onClick={onNewTab}>
        Nova aba
      </button>
      <button type="button" role="menuitem" className={styles.choice} onClick={onHere}>
        Aqui
      </button>
    </div>
  )
}
