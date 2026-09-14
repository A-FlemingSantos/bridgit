import { Link } from 'react-router-dom'
import styles from './SpaceViewHeader.module.css'

export default function SpaceViewHeader({ backTo, backLabel, title }) {
  return (
    <header className={styles.band}>
      <Link to={backTo} className={styles.back}>
        {backLabel}
      </Link>
      <h1>{title}</h1>
    </header>
  )
}
