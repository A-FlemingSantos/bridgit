import styles from './Spinner.module.css'

export default function Spinner({ label = 'Carregando arquivo' }) {
  return (
    <div className={styles.wrap} role="status" aria-label={label}>
      <span className={styles.ring} aria-hidden="true" />
    </div>
  )
}
