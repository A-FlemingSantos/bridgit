import { Link } from 'react-router-dom'
import styles from './SpaceViewHeader.module.css'

export default function SpaceViewHeader({ backTo, backLabel, title, trailing = null }) {
  return (
    <header className={styles.band}>
      <Link to={backTo} className={styles.back}>
        {backLabel}
      </Link>
      <div className={styles.titleRow}>
        <h1>{title}</h1>
        {trailing}
      </div>
    </header>
  )
}
