import { Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import BrandMark from '../../../../shared/components/BrandMark/BrandMark.jsx'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.bar}>
      <Link to={ROUTES.landing} className={styles.mark} aria-label="Bridgit">
        <BrandMark />
      </Link>
      <Link to={ROUTES.login} className={styles.action} aria-label="Acessar conta">
        <LogIn size={16} strokeWidth={1.6} aria-hidden="true" />
      </Link>
    </header>
  )
}
