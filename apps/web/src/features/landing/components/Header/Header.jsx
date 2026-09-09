import { Link } from 'react-router-dom'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.bar}>
      <Link to={ROUTES.home} className={styles.mark}>
        Bridgit
      </Link>
    </header>
  )
}
