import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PixelBookmark, PixelBrush, PixelDownload, PixelFolderMove, PixelLink, PixelTrash } from '../../../../shared/components/PixelIcons/PixelIcons.jsx'
import FolderColorPalette from '../FolderColorPalette/FolderColorPalette.jsx'
import { downloadEntry } from '../entryActions.jsx'
import styles from './SelectionActions.module.css'

// How long a selection must hold before the strip opens, so a quick click does not set the page moving.
export const SELECTION_ACTIONS_DELAY_MS = 250

const EASE = [0.22, 1, 0.36, 1]

// Opening, the strip makes room (the tiles slide down) as its cards appear; closing runs it
// backwards: the cards go first, and only then do the tiles slide back up.
const stripMotion = {
  closed: (gap) => ({
    height: 0,
    marginBottom: -gap,
    transition: { duration: 0.32, ease: EASE, when: 'afterChildren' },
  }),
  open: {
    height: 'auto',
    marginBottom: 0,
    transition: { duration: 0.32, ease: EASE },
  },
}

const cardMotion = {
  closed: (index) => ({
    opacity: 0,
    y: -6,
    transition: { duration: 0.18, delay: index * 0.02, ease: EASE },
  }),
  open: (index) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, delay: 0.06 + index * 0.03, ease: EASE },
  }),
}

// Waits until `active` has held still for `delay` before turning on; turns off at once.
// Any change in `key` while it waits starts the wait again.
function useSettled(active, key, delay) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!active) {
      setSettled(false)
      return undefined
    }
    if (settled) return undefined
    const timer = setTimeout(() => setSettled(true), delay)
    return () => clearTimeout(timer)
  }, [active, key, delay, settled])
  return active && settled
}

// The actions for the selected folders and files, in a strip of cards above them. It opens a moment
// after the selection starts, growing from nothing so the tiles below slide down to make room.
// Folders get baixar | mover | cor | excluir, files baixar | mover | atalho | link público | excluir;
// a mixed selection keeps what both share. Baixar leads, filled like the first action on Início. `gap` is the page's spacing, kept out while it is closed.
export default function SelectionActions({
  entries,
  providerId,
  gap = 0,
  openOverlay,
  actions,
  isShortcut,
  colorOf,
  setColor,
  onError,
}) {
  const shown = useSettled(entries.length > 0, entries.map((entry) => entry.ref).join(','), SELECTION_ACTIONS_DELAY_MS)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The strip clips its cards only while it grows or shrinks, so the color palette can hang out of it.
  const [resting, setResting] = useState(false)
  const colorRef = useRef(null)
  useEffect(() => { if (!shown) setPaletteOpen(false) }, [shown])
  useEffect(() => {
    if (!paletteOpen) return undefined
    function handlePointerDown(event) {
      if (!colorRef.current?.contains(event.target)) setPaletteOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [paletteOpen])

  const folders = entries.filter((entry) => entry.kind === 'folder')
  const files = entries.filter((entry) => entry.kind === 'file')
  const single = entries.length === 1 ? entries[0] : null
  const allPinned = files.length > 0 && files.every((file) => isShortcut?.(providerId, file.ref))
  const colorIds = new Set(folders.map((folder) => colorOf(providerId, folder.ref).id))
  const sharedColor = colorIds.size === 1 ? [...colorIds][0] : null

  // One entry keeps the overlay's single-item shape (its name shows in the text); several go as `items`.
  function overlayFor(type) {
    if (single) {
      return { type, kind: single.kind, providerId, ref: single.ref, name: single.name, parentRef: single.parentRef ?? undefined }
    }
    return {
      type,
      providerId,
      items: entries.map((entry) => ({ kind: entry.kind, ref: entry.ref, name: entry.name, parentRef: entry.parentRef ?? undefined })),
    }
  }

  const move = { id: 'move', label: 'Mover', icon: PixelFolderMove, onSelect: () => openOverlay(overlayFor('move')) }
  const color = {
    id: 'color',
    label: 'Cor',
    icon: PixelBrush,
    onSelect: () => setPaletteOpen((open) => !open),
  }
  const download = {
    id: 'download',
    label: 'Baixar',
    icon: PixelDownload,
    primary: true,
    onSelect: () => entries.forEach((entry) => void downloadEntry(entry, { actions, onError })),
  }
  const pin = {
    id: 'pin',
    label: allPinned ? 'Remover atalho' : 'Atalho',
    icon: PixelBookmark,
    onSelect: () =>
      files
        .filter((file) => (isShortcut?.(providerId, file.ref) ?? false) === allPinned)
        .forEach((file) => void actions.toggleShortcut(file).catch((error) => onError?.(error))),
  }
  // Each file gets its link (asking again is harmless); the addresses go to the clipboard, one per line.
  const link = {
    id: 'link',
    label: 'Link público',
    icon: PixelLink,
    onSelect: () =>
      void Promise.all(files.map((file) => actions.enablePublicLink({ providerId, ref: file.ref })))
        .then((links) => navigator.clipboard.writeText(links.map((entry) => entry.url).join('\n')))
        .catch((error) => onError?.(error)),
  }
  const remove = { id: 'delete', label: 'Excluir', icon: PixelTrash, danger: true, onSelect: () => openOverlay(overlayFor('confirm-delete-entry')) }

  const items = files.length === 0
    ? [download, move, color, remove]
    : folders.length === 0
      ? [download, move, pin, link, remove]
      : [download, move, remove]

  return (
    <AnimatePresence initial={false}>
      {shown ? (
        <motion.section
          key="selection-actions"
          aria-label="Ações da seleção"
          data-selection-keep=""
          className={styles.strip}
          custom={gap}
          variants={stripMotion}
          initial="closed"
          animate="open"
          exit="closed"
          style={{ overflow: resting ? 'visible' : 'hidden' }}
          onAnimationStart={() => setResting(false)}
          onAnimationComplete={() => setResting(true)}
        >
          <div className={styles.cards}>
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                className={styles.dock}
                ref={item.id === 'color' ? colorRef : undefined}
                custom={index}
                variants={cardMotion}
              >
                <button
                  type="button"
                  className={[styles.card, item.primary ? styles.cardPrimary : '', item.danger ? styles.cardDanger : ''].filter(Boolean).join(' ')}
                  aria-haspopup={item.id === 'color' ? 'true' : undefined}
                  aria-expanded={item.id === 'color' ? paletteOpen : undefined}
                  onClick={item.onSelect}
                >
                  <span className={styles.cardIcon}>
                    <item.icon />
                  </span>
                  <span className={styles.cardLabel}>{item.label}</span>
                </button>
                {item.id === 'color' && paletteOpen ? (
                  <div className={styles.popover}>
                    <FolderColorPalette
                      selectedId={sharedColor}
                      onPick={(id) => {
                        folders.forEach((folder) => setColor(providerId, folder.ref, id))
                        setPaletteOpen(false)
                      }}
                    />
                  </div>
                ) : null}
              </motion.div>
            ))}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}
