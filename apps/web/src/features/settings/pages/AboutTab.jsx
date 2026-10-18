import { Link } from 'react-router-dom'
import { ROUTES } from '../../../shared/config/routes.js'
import { PixelBrand, PixelGithub, PixelLinkedin, PixelX } from '../components/SettingsIcons.jsx'
import styles from './SettingsPage.module.css'

// Only GitHub has a link for now; LinkedIn and X are placeholders.
const SOCIALS = [
  { id: 'github', label: 'GitHub', icon: PixelGithub, url: 'https://github.com/A-FlemingSantos/bridgit' },
  { id: 'linkedin', label: 'LinkedIn', icon: PixelLinkedin, url: null },
  { id: 'x', label: 'X', icon: PixelX, url: null },
]

export default function AboutTab() {
  return (
    <section id="settings-about" className={styles.pane}>
      <h2 className={styles.paneTitle}>Sobre</h2>

      <div className={styles.about}>
        <PixelBrand size={40} />
        <p className={styles.aboutName}>Bridgit</p>
        <p className={styles.heroHint}>{`Versão ${__APP_VERSION__}`}</p>
        <div className={styles.socials}>
          {SOCIALS.map(({ id, label, icon: Icon, url }) =>
            url ? (
              <a key={id} className={styles.social} href={url} target="_blank" rel="noreferrer" aria-label={label}>
                <Icon size={24} />
              </a>
            ) : (
              <span key={id} className={styles.social} role="img" aria-label={label}>
                <Icon size={24} />
              </span>
            ),
          )}
        </div>
      </div>

      <div className={styles.links}>
        <Link to={ROUTES.privacy}>Privacidade</Link>
        <Link to={ROUTES.terms}>Termos</Link>
      </div>
    </section>
  )
}
