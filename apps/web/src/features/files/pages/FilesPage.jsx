import { motion } from 'framer-motion'
import { FilePen, FolderPlus, PenLine, Plus, Stamp, Upload } from 'lucide-react'
import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import AppHeader from '../../../shared/components/AppHeader/AppHeader.jsx'
import folderMark from '../assets/folder.svg'
import styles from './FilesPage.module.css'

const folders = [
  { id: 'tech', name: 'Inovações técnicas', owner: 'Arthur Fleming' },
  { id: 'digital', name: 'Acervo digital', owner: 'Arthur Fleming' },
  { id: 'software', name: 'Soluções de software', owner: 'Arthur Fleming' },
  { id: 'code', name: 'Referências de código', owner: 'Arthur Fleming' },
]

const files = [
  { id: 'innov', title: 'Relatório 2023', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'review', title: 'Revisão anual', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'trends', title: 'Tendências', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'perf', title: 'Análise de desempenho', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'study', title: 'Estudo abrangente', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'effect', title: 'Efetividade', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'land', title: 'Visão geral', kind: 'PDF', owner: 'Arthur Fleming' },
  { id: 'strat', title: 'Estratégias', kind: 'PDF', owner: 'Arthur Fleming' },
]

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

export default function FilesPage() {
  return (
    <div className={styles.page}>
      <AppHeader />
      <CustomScrollArea className={styles.scroll} viewportClassName={styles.viewport} refreshKey="files">
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

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h1>Pastas</h1>
              <button type="button" className={styles.more}>
                Ver mais
              </button>
            </header>
            <div className={styles.folderGrid}>
              {folders.map((folder, index) => (
                <motion.button
                  key={folder.id}
                  type="button"
                  className={styles.folder}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.08 + index * 0.04}
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <span className={styles.folderFace} aria-hidden="true">
                    <span
                      className={styles.folderMark}
                      style={{ '--folder-mark': `url("${folderMark}")` }}
                    />
                  </span>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemTitle}>{folder.name}</span>
                    <span className={styles.itemSub}>Pasta · {folder.owner}</span>
                  </span>
                </motion.button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2>Arquivos</h2>
            </header>
            <div className={styles.fileGrid}>
              {files.map((file, index) => (
                <motion.button
                  key={file.id}
                  type="button"
                  className={styles.file}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.16 + index * 0.03}
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <span className={styles.fileFace} aria-hidden="true">
                    <span className={styles.sheet}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </span>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemTitle}>{file.title}</span>
                    <span className={styles.itemSub}>
                      {file.kind} · {file.owner}
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          </section>
        </main>
      </CustomScrollArea>
    </div>
  )
}
