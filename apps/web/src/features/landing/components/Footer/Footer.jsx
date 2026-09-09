import { Link } from 'react-router-dom'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Footer.module.css'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className={styles.foot}>
      <div className={styles.stack}>
        <div className={styles.close}>
          <h2 className={styles.heading}>Pronto para começar?</h2>
          <p className={styles.note}>
            Crie sua conta e reúna OneDrive, Drive e Dropbox no mesmo lugar.
          </p>
          <Link to={ROUTES.register} className={styles.cta}>
            Criar conta
          </Link>
        </div>

        <div className={styles.legal}>
          <p className={styles.copy}>© {year} Bridgit</p>
          <div className={styles.links}>
            <Link to={ROUTES.privacy} className={styles.link}>
              Privacidade
            </Link>
            <Link to={ROUTES.terms} className={styles.link}>
              Termos
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
