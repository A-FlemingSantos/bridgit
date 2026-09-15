import { Link } from 'react-router-dom'
import { ROUTES } from '../shared/config/routes.js'
import styles from './PlaceholderScreen.module.css'

export default function PlaceholderScreen({ title }) {
  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <Link to={ROUTES.landing} className={styles.mark}>
          Bridgit
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <Link to={ROUTES.landing} className={styles.back}>
          Voltar
        </Link>
      </div>
    </main>
  )
}
