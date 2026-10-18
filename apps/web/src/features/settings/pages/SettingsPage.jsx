import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { PixelClose } from '../../../shared/components/PixelIcons/PixelIcons.jsx'
import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { resolveSettingsBackground } from '../../../shared/utils/settingsOverlay.js'
import AboutTab from './AboutTab.jsx'
import AccountTab from './AccountTab.jsx'
import ProvidersTab from './ProvidersTab.jsx'
import SecurityTab from './SecurityTab.jsx'
import styles from './SettingsPage.module.css'

// Every section on one page; the old per-tab paths still open it, scrolled to their section.
const SECTION_BY_PATH = {
  [ROUTES.settingsProviders]: 'settings-providers',
  [ROUTES.settingsSecurity]: 'settings-security',
  [ROUTES.settingsAbout]: 'settings-about',
}

const ease = [0.22, 1, 0.36, 1]
const backdropMotion = { duration: 0.22, ease }
const panelMotion = { duration: 0.32, ease }

export default function SettingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const titleId = useId()
  const panelRef = useRef(null)
  const [visible, setVisible] = useState(true)
  const backgroundRef = useRef(resolveSettingsBackground(location))
  backgroundRef.current = resolveSettingsBackground(location)

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const commitClose = useCallback(() => {
    navigate(backgroundRef.current)
  }, [navigate])

  const sectionId = SECTION_BY_PATH[location.pathname]
  useEffect(() => {
    if (!sectionId) return
    document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
  }, [sectionId])

  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [close])

  return (
    <AnimatePresence onExitComplete={commitClose}>
      {visible ? (
        <motion.div
          key="settings-overlay"
          className={styles.overlay}
          initial={false}
          exit={{ opacity: 0 }}
          transition={panelMotion}
        >
          <motion.button
            type="button"
            className={styles.backdrop}
            aria-label="Fechar configurações"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropMotion}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={panelMotion}
          >
            <div className={styles.chrome}>
              <h2 id={titleId}>Configurações</h2>
              <button type="button" className={styles.close} onClick={close} aria-label="Fechar configurações">
                <PixelClose size={24} />
              </button>
            </div>
            <CustomScrollArea className={styles.body} refreshKey={location.pathname}>
              <div className={styles.main}>
                <AccountTab />
                <ProvidersTab />
                <SecurityTab />
                <AboutTab />
              </div>
            </CustomScrollArea>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
