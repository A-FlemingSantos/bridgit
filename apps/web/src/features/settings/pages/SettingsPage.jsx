import { Cloud, Info, RefreshCw, Shield, User } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import styles from './SettingsPage.module.css'

const tabs = [
  { to: ROUTES.settings, label: 'Conta', icon: User, end: true },
  { to: ROUTES.settingsProviders, label: 'Provedores', icon: Cloud },
  { to: ROUTES.settingsSync, label: 'Sincronização', icon: RefreshCw },
  { to: ROUTES.settingsSecurity, label: 'Segurança', icon: Shield },
  { to: ROUTES.settingsAbout, label: 'Sobre', icon: Info },
]

export default function SettingsPage() {
  const location = useLocation()

  return (
    <AppShell refreshKey={location.pathname}>
      <main className={styles.main}>
        <Link to={ROUTES.spaces} className={styles.back}>
          Spaces
        </Link>
        <div className={styles.split}>
          <nav className={styles.side} aria-label="Configurações">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
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
      </main>
    </AppShell>
  )
}
