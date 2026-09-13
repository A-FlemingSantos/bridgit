import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { providerUrl, spaceUrl } from '../../../shared/config/routes.js'
import ProviderMark from '../components/ProviderMark.jsx'
import { providers, spaces as initialSpaces } from '../data/mock.js'
import styles from './SpacesPage.module.css'

function slugFromName(name) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base || `space-${Date.now()}`
}

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

function SpaceNameEditor({ autoFocus, onChange, onCommit, onCancel }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (!autoFocus || !ref.current) return
    ref.current.focus()
  }, [autoFocus])

  return (
    <span
      ref={ref}
      className={styles.spaceName}
      contentEditable
      role="textbox"
      aria-label="Nome do space"
      spellCheck={false}
      suppressContentEditableWarning
      onInput={(event) => onChange(event.currentTarget.textContent ?? '')}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

export default function SpacesPage() {
  const [spaceList, setSpaceList] = useState(() => [...initialSpaces])
  const [focusDraftId, setFocusDraftId] = useState(null)

  function addSpace() {
    const space_id = crypto.randomUUID()
    setFocusDraftId(space_id)
    setSpaceList((prev) => [
      ...prev,
      { space_id, slug: '', name: '', count: 0, isDraft: true },
    ])
  }

  function updateSpaceName(space_id, name) {
    setSpaceList((prev) =>
      prev.map((space) => (space.space_id === space_id ? { ...space, name } : space)),
    )
  }

  function finishDraft(space_id) {
    setSpaceList((prev) => {
      const space = prev.find((item) => item.space_id === space_id)
      if (!space?.isDraft) return prev
      const trimmed = space.name.trim()
      if (!trimmed) {
        return prev.filter((item) => item.space_id !== space_id)
      }
      const slug = slugFromName(trimmed)
      return prev.map((item) =>
        item.space_id === space_id
          ? { ...item, name: trimmed, slug, isDraft: false }
          : item,
      )
    })
  }

  return (
    <AppShell refreshKey="spaces">
      <main className={styles.main}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h1>Spaces</h1>
            <button type="button" className={styles.more} onClick={addSpace}>
              <Plus size={14} strokeWidth={1.6} aria-hidden="true" />
              Novo space
            </button>
          </header>
          <div className={styles.grid}>
            {spaceList.map((space, index) => (
              <motion.div
                key={space.space_id}
                variants={rise}
                initial="hidden"
                animate="show"
                custom={0.06 + index * 0.05}
              >
                {space.isDraft ? (
                  <div className={styles.tile}>
                    <span className={styles.face}>
                      <SpaceNameEditor
                        autoFocus={space.space_id === focusDraftId}
                        onChange={(name) => updateSpaceName(space.space_id, name)}
                        onCommit={() => finishDraft(space.space_id)}
                        onCancel={() =>
                          setSpaceList((prev) =>
                            prev.filter((item) => item.space_id !== space.space_id),
                          )
                        }
                      />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.title}>{space.name}</span>
                      <span className={styles.sub}>{space.count} itens</span>
                    </span>
                  </div>
                ) : (
                  <Link to={spaceUrl(space.slug)} className={styles.tile}>
                    <span className={styles.face} aria-hidden="true">
                      <span className={styles.spaceName}>{space.name}</span>
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.title}>{space.name}</span>
                      <span className={styles.sub}>{space.count} itens</span>
                    </span>
                  </Link>
                )}
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
