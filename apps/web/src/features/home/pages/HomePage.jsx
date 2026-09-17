import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Cloud, LayoutGrid, LayoutList, Plus, RefreshCw, Search, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { providerFileUrl, providerUrl } from '../../../shared/config/routes.js'
import FileSheet from '../../spaces/components/FileSheet/FileSheet.jsx'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { providers, recents, shortcuts } from '../data/mock.js'
import styles from './HomePage.module.css'

const actions = [
  { id: 'upload', label: 'Enviar', icon: Upload },
  { id: 'create', label: 'Criar', icon: Plus },
  { id: 'connect', label: 'Conectar', icon: Cloud },
  { id: 'mirror', label: 'Espelhar', icon: RefreshCw },
]

const rise = {
  hidden: { opacity: 0, y: 8 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function HomePage() {
  const [recentsView, setRecentsView] = useState('list')

  return (
    <AppShell refreshKey="home">
      <main className={styles.main}>
        <div className={styles.command}>
          <div className={styles.search}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <input type="search" placeholder="Buscar" aria-label="Buscar" />
          </div>
          <div className={styles.actions}>
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <button key={action.id} type="button" className={styles.action}>
                  <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                  {action.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.body}>
          <aside className={styles.rail}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Provedores</h2>
              </header>
              <nav className={styles.providers} aria-label="Provedores">
                {providers.map((provider, index) => (
                  <motion.div
                    key={provider.id}
                    variants={rise}
                    initial="hidden"
                    animate="show"
                    custom={0.04 + index * 0.04}
                  >
                    <Link
                      to={providerUrl(provider.id)}
                      className={styles.provider}
                      aria-label={`${provider.name} Conectado`}
                    >
                      <ProviderMark id={provider.id} size={22} />
                      <span className={styles.providerMeta}>
                        <span className={styles.providerName}>{provider.name}</span>
                        <span className={styles.providerSub}>Conectado</span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </section>
          </aside>

          <div className={styles.workspace}>
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2>Atalhos</h2>
              </header>
              <div className={styles.pins}>
                {shortcuts.map((file, index) => (
                  <motion.div
                    key={file.fileRef}
                    variants={rise}
                    initial="hidden"
                    animate="show"
                    custom={0.08 + index * 0.04}
                  >
                    <Link
                      to={providerFileUrl(file.providerId, file.fileRef)}
                      className={styles.pin}
                      aria-label={file.title}
                    >
                      <span className={styles.pinFace} aria-hidden="true">
                        <FileSheet />
                      </span>
                      <span className={styles.pinMeta}>
                        <span className={styles.pinTitle}>{file.title}</span>
                        <span className={styles.pinSub}>{file.provider}</span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h1>Recentes</h1>
                <div className={styles.viewToggle} role="group" aria-label="Visualização dos recentes">
                  <button
                    type="button"
                    className={styles.viewButton}
                    aria-pressed={recentsView === 'list'}
                    aria-label="Lista"
                    onClick={() => setRecentsView('list')}
                  >
                    <LayoutList size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.viewButton}
                    aria-pressed={recentsView === 'grid'}
                    aria-label="Grade"
                    onClick={() => setRecentsView('grid')}
                  >
                    <LayoutGrid size={15} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
              </header>

              {recentsView === 'list' ? (
                <div className={styles.list}>
                  {recents.map((file, index) => (
                    <motion.div
                      key={file.fileRef}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <Link
                        to={providerFileUrl(file.providerId, file.fileRef)}
                        className={styles.row}
                        aria-label={file.title}
                      >
                        <span className={styles.rowFace} aria-hidden="true">
                          <FileSheet compact />
                        </span>
                        <span className={styles.rowBody}>
                          <span className={styles.rowTitle}>{file.title}</span>
                          <span className={styles.rowSub}>
                            {file.kind} · {file.provider}
                          </span>
                        </span>
                        <span className={styles.rowWhen}>{file.when}</span>
                        <span className={styles.rowMark}>
                          <ProviderMark id={file.providerId} size={16} />
                        </span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className={styles.grid}>
                  {recents.map((file, index) => (
                    <motion.div
                      key={file.fileRef}
                      variants={rise}
                      initial="hidden"
                      animate="show"
                      custom={0.06 + index * 0.025}
                    >
                      <Link
                        to={providerFileUrl(file.providerId, file.fileRef)}
                        className={styles.tile}
                        aria-label={file.title}
                      >
                        <span className={styles.tileFace} aria-hidden="true">
                          <FileSheet />
                        </span>
                        <span className={styles.tileMeta}>
                          <span className={styles.rowTitle}>{file.title}</span>
                          <span className={styles.rowSub}>
                            {file.kind} · {file.provider}
                          </span>
                        </span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
