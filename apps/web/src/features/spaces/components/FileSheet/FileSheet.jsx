import styles from './FileSheet.module.css'

export default function FileSheet({ large = false, compact = false }) {
  const className = [
    styles.sheet,
    large ? styles.large : '',
    compact ? styles.compact : '',
  ].filter(Boolean).join(' ')

  return (
    <span className={className} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
