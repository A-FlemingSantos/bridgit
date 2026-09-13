import { Link } from 'react-router-dom'
import { ROUTES } from '../../../shared/config/routes.js'
import styles from './SettingsPage.module.css'

export default function AboutTab() {
  return (
    <section className={styles.pane}>
      <h1>Sobre</h1>

      <div className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Bridgit</h2>
            <p className={styles.hint}>Versão 0.1 · mock</p>
          </div>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>O que guarda</dt>
            <dd>Só metadados. O arquivo fica no provedor.</dd>
          </div>
          <div>
            <dt>Provedores</dt>
            <dd>OneDrive, Google Drive e Dropbox.</dd>
          </div>
        </dl>
      </div>

      <div className={styles.card}>
        <h2>Links</h2>
        <div className={styles.links}>
          <Link to={ROUTES.privacy}>Privacidade</Link>
          <Link to={ROUTES.terms}>Termos</Link>
        </div>
      </div>
    </section>
  )
}
