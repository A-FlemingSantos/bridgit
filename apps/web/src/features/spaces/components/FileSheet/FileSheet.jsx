import styles from './FileSheet.module.css'

export default function FileSheet({ large = false }) {
  return (
    <span className={large ? `${styles.sheet} ${styles.large}` : styles.sheet} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
