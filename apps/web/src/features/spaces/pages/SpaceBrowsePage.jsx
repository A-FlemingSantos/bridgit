import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import {
  ROUTES,
  providerFileUrl,
  providerFolderUrl,
  providerUrl,
} from '../../../shared/config/routes.js'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import folderMark from '../assets/folder.svg'
import {
  getFolder,
  getFolderContents,
  getProvider,
  getProviderContents,
} from '../data/mock.js'
import styles from './SpaceBrowsePage.module.css'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function SpaceBrowsePage() {
  const { folderRef, provider: providerId } = useParams()
  const provider = providerId ? getProvider(providerId) : null
  const folder = folderRef ? getFolder(folderRef) : null

  if (!provider) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (folderRef && !folder) {
    return <Navigate to={providerUrl(provider.id)} replace />
  }

  const contents = (folderRef
    ? getFolderContents(folderRef)
    : getProviderContents(provider.id)) ?? { folders: [], files: [] }

  return (
    <AppShell
      refreshKey={`${providerId}-${folderRef ?? 'root'}`}
      subheader={
        <SpaceViewHeader trailing={<SpaceViewActions />} />
      }
    >
      <main className={styles.main}>
        {contents.folders.length > 0 ? (
          <section className={styles.section}>
            <h2>Pastas</h2>
            <div className={styles.grid}>
              {contents.folders.map((item, index) => (
                <motion.div
                  key={item.folderRef}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.06 + index * 0.04}
                >
                  <Link
                    to={providerFolderUrl(providerId, item.folderRef)}
                    className={styles.item}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <span
                        className={styles.folderMark}
                        style={{ '--folder-mark': `url("${folderMark}")` }}
                      />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.name}</span>
                      <span className={styles.itemSub}>Pasta · {item.provider}</span>
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}

        {contents.files.length > 0 ? (
          <section className={styles.section}>
            <h2>Arquivos</h2>
            <div className={styles.grid}>
              {contents.files.map((item, index) => (
                <motion.div
                  key={item.fileRef}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.14 + index * 0.03}
                >
                  <Link
                    to={providerFileUrl(providerId, item.fileRef)}
                    className={styles.item}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <FileSheet />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemSub}>
                        {item.kind} · {item.provider}
                      </span>
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  )
}
