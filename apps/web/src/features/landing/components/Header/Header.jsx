import { Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.bar}>
      <Link to={ROUTES.landing} className={styles.mark} aria-label="Bridgit">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M22 20H2v-2h20v2ZM2 18H0v-6h2v6Zm22 0h-2v-6h2v6Zm-6-6v2h-2v-2h2ZM4 12H2v-2h2v2Zm6 0H8v-2h2v2Zm10-2h2v2h-4V8h2v2ZM8 10H4V8h4v2Zm2-2H8V6h2v2Zm8 0h-2V6h2v2Zm-2-2h-6V4h6v2Z" />
        </svg>
      </Link>
      <Link to={ROUTES.login} className={styles.action} aria-label="Acessar conta">
        <LogIn size={16} strokeWidth={1.6} aria-hidden="true" />
      </Link>
    </header>
  )
}
