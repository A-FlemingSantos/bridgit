import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { providerUrl, spaceUrl } from '../../../shared/config/routes.js'
import ProviderMark from '../components/ProviderMark.jsx'
import { providers, spaces } from '../data/mock.js'
import styles from './SpacesPage.module.css'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function SpacesPage() {
  return (
    <AppShell refreshKey="spaces">
      <main className={styles.main}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h1>Spaces</h1>
            <button type="button" className={styles.more}>
              <Plus size={14} strokeWidth={1.6} aria-hidden="true" />
              Novo space
            </button>
          </header>
          <div className={styles.grid}>
            {spaces.map((space, index) => (
              <motion.div
                key={space.space_id}
                variants={rise}
                initial="hidden"
                animate="show"
                custom={0.06 + index * 0.05}
              >
                <Link to={spaceUrl(space.slug)} className={styles.tile}>
                  <span className={styles.face} aria-hidden="true">
                    <span className={styles.spaceName}>{space.name}</span>
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.title}>{space.name}</span>
                    <span className={styles.sub}>{space.count} itens</span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2>Provedores</h2>
          </header>
          <div className={styles.grid}>
            {providers.map((provider, index) => (
              <motion.div
                key={provider.id}
                variants={rise}
                initial="hidden"
                animate="show"
                custom={0.22 + index * 0.05}
              >
                <Link to={providerUrl(provider.id)} className={styles.tile}>
                  <span className={styles.face}>
                    <ProviderMark id={provider.id} size={40} />
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.title}>{provider.name}</span>
                    <span className={styles.sub}>Conectado</span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  )
}
