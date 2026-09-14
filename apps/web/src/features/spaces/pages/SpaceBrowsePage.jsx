import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import {
  ROUTES,
  providerFileUrl,
  providerFolderUrl,
  providerUrl,
  spaceFileUrl,
  spaceFolderUrl,
  spaceUrl,
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
  getSpace,
  getSpaceContents,
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
  const { space: spaceSlug, folderRef, provider: providerId } = useParams()
  const space = spaceSlug ? getSpace(spaceSlug) : null
  const provider = providerId ? getProvider(providerId) : null
  const folder = folderRef ? getFolder(folderRef) : null

  if (spaceSlug && !space) {
    return <Navigate to={ROUTES.spaces} replace />
  }

  if (providerId && !provider) {
    return <Navigate to={ROUTES.spaces} replace />
  }

  if (folderRef && !folder) {
    return <Navigate to={providerId ? providerUrl(providerId) : spaceSlug ? spaceUrl(spaceSlug) : ROUTES.spaces} replace />
  }

  const contents = (folderRef
    ? getFolderContents(folderRef)
    : provider
      ? getProviderContents(provider.id)
      : getSpaceContents(space.slug)) ?? { folders: [], files: [] }

  function folderHref(item) {
    if (providerId) return providerFolderUrl(providerId, item.folderRef)
    return spaceFolderUrl(spaceSlug, item.folderRef)
  }

  function fileHref(item) {
    if (providerId) return providerFileUrl(providerId, item.fileRef)
    return spaceFileUrl(spaceSlug, item.fileRef)
  }

  return (
    <AppShell
      refreshKey={`${spaceSlug ?? providerId ?? ''}-${folderRef ?? 'root'}`}
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
                    to={folderHref(item)}
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
                    to={fileHref(item)}
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
