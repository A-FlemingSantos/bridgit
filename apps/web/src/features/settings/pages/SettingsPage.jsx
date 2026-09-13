import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Cloud, Info, RefreshCw, Shield, User, X } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { resolveSettingsBackground, settingsNavState } from '../../../shared/utils/settingsOverlay.js'
import styles from './SettingsPage.module.css'

const tabs = [
  { to: ROUTES.settings, label: 'Conta', icon: User, end: true },
  { to: ROUTES.settingsProviders, label: 'Provedores', icon: Cloud },
  { to: ROUTES.settingsSync, label: 'Sincronização', icon: RefreshCw },
  { to: ROUTES.settingsSecurity, label: 'Segurança', icon: Shield },
  { to: ROUTES.settingsAbout, label: 'Sobre', icon: Info },
]

const ease = [0.22, 1, 0.36, 1]
const backdropMotion = { duration: 0.22, ease }
const panelMotion = { duration: 0.32, ease }

export default function SettingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const titleId = useId()
  const panelRef = useRef(null)
  const navState = settingsNavState(location)
  const [visible, setVisible] = useState(true)
  const backgroundRef = useRef(resolveSettingsBackground(location))
  backgroundRef.current = resolveSettingsBackground(location)

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const commitClose = useCallback(() => {
    navigate(backgroundRef.current)
  }, [navigate])

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
                <X size={16} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
            <CustomScrollArea className={styles.body} refreshKey={location.pathname}>
              <div className={styles.main}>
                <div className={styles.split}>
                  <nav className={styles.side} aria-label="Seções">
                    {tabs.map((tab) => {
                      const Icon = tab.icon
                      return (
                        <NavLink
                          key={tab.to}
                          to={tab.to}
                          end={tab.end}
                          state={navState}
                          className={({ isActive }) => (isActive ? styles.navActive : styles.nav)}
                        >
                          <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                          {tab.label}
                        </NavLink>
                      )
                    })}
                  </nav>
                  <div className={styles.content}>
                    <Outlet />
                  </div>
                </div>
              </div>
            </CustomScrollArea>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
