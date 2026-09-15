import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { providerUrl } from '../../../shared/config/routes.js'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { providers } from '../../spaces/data/mock.js'
import styles from './HomePage.module.css'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function HomePage() {
  return (
    <AppShell refreshKey="home">
      <main className={styles.main}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h1>Provedores</h1>
          </header>
          <div className={styles.grid}>
            {providers.map((provider, index) => (
              <motion.div
                key={provider.id}
                variants={rise}
                initial="hidden"
                animate="show"
                custom={0.06 + index * 0.05}
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
