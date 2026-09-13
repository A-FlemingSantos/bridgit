import styles from './Toggle.module.css'

export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={styles.switch}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  )
}
