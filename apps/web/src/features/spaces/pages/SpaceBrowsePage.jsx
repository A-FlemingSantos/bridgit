import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FilePen, FolderPlus, PenLine, Plus, Stamp, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import {
  ROUTES,
  spaceFileUrl,
  spaceFolderUrl,
  spaceUrl,
} from '../../../shared/config/routes.js'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import folderMark from '../assets/folder.svg'
import {
  findSpaceForFile,
  findSpaceForFolder,
  getFolder,
  getFolderContents,
  getProvider,
  getProviderContents,
  getSpace,
  getSpaceContents,
} from '../data/mock.js'
import styles from './SpaceBrowsePage.module.css'

const actions = [
  { id: 'create', label: 'Criar', icon: Plus, primary: true },
  { id: 'upload', label: 'Enviar', icon: Upload },
  { id: 'folder', label: 'Nova pasta', icon: FolderPlus },
  { id: 'edit', label: 'Editar PDF', icon: FilePen },
  { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp },
  { id: 'sign', label: 'Assinar', icon: PenLine },
]

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
    return <Navigate to={spaceSlug ? spaceUrl(spaceSlug) : ROUTES.spaces} replace />
  }

  const contents = (folderRef
    ? getFolderContents(folderRef)
    : provider
      ? getProviderContents(provider.id)
      : getSpaceContents(space.slug)) ?? { folders: [], files: [] }

  const title = folder?.name ?? space?.name ?? provider?.name
  const backTo = folderRef
    ? spaceSlug
      ? spaceUrl(spaceSlug)
      : ROUTES.spaces
    : ROUTES.spaces
  const backLabel = folderRef ? (space?.name ?? 'Space') : 'Spaces'

  return (
    <AppShell
      refreshKey={`${spaceSlug ?? providerId ?? ''}-${folderRef ?? 'root'}`}
      subheader={<SpaceViewHeader backTo={backTo} backLabel={backLabel} title={title} />}
    >
      <main className={styles.main}>
        <motion.div
          className={styles.actions}
          variants={rise}
          initial="hidden"
          animate="show"
          custom={0.04}
        >
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                className={action.primary ? styles.actionPrimary : styles.action}
              >
                <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                {action.label}
              </button>
            )
          })}
        </motion.div>

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
                    to={spaceFolderUrl(spaceSlug ?? findSpaceForFolder(item.folderRef), item.folderRef)}
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
                    to={spaceFileUrl(spaceSlug ?? findSpaceForFile(item.fileRef), item.fileRef)}
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
