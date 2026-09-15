import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './features/auth/pages/AuthPage.jsx'
import HomePage from './features/home/pages/HomePage.jsx'
import SpaceBrowsePage from './features/spaces/pages/SpaceBrowsePage.jsx'
import SpaceFilePage from './features/spaces/pages/SpaceFilePage.jsx'
import SettingsPage from './features/settings/pages/SettingsPage.jsx'
import AccountTab from './features/settings/pages/AccountTab.jsx'
import ProvidersTab from './features/settings/pages/ProvidersTab.jsx'
import SecurityTab from './features/settings/pages/SecurityTab.jsx'
import SyncTab from './features/settings/pages/SyncTab.jsx'
import AboutTab from './features/settings/pages/AboutTab.jsx'
import SpacesPage from './features/spaces/pages/SpacesPage.jsx'
import LandingPage from './features/landing/pages/LandingPage.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import { ROUTES } from './shared/config/routes.js'
import { isSettingsPath, resolveSettingsBackground } from './shared/utils/settingsOverlay.js'

export default function App() {
  const location = useLocation()
  const settingsOpen = isSettingsPath(location.pathname)
  const backgroundLocation = settingsOpen ? resolveSettingsBackground(location) : location

  return (
    <>
      <Routes location={backgroundLocation}>
        <Route path={ROUTES.landing} element={<LandingPage />} />
        <Route path={ROUTES.login} element={<AuthPage />} />
        <Route path={ROUTES.register} element={<AuthPage />} />
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.spaces} element={<SpacesPage />} />
        <Route path={`${ROUTES.spaces}/*`} element={<Navigate to={ROUTES.home} replace />} />
        <Route path={ROUTES.providers} element={<Navigate to={ROUTES.home} replace />} />
        <Route path={ROUTES.providerFolder} element={<SpaceBrowsePage />} />
        <Route path={ROUTES.providerFile} element={<SpaceFilePage />} />
        <Route path={ROUTES.provider} element={<SpaceBrowsePage />} />
        <Route path={ROUTES.privacy} element={<PlaceholderScreen title="Privacidade" />} />
        <Route path={ROUTES.terms} element={<PlaceholderScreen title="Termos" />} />
      </Routes>
      {settingsOpen ? (
        <Routes>
          <Route path={ROUTES.settings} element={<SettingsPage />}>
            <Route index element={<AccountTab />} />
            <Route path="providers" element={<ProvidersTab />} />
            <Route path="sync" element={<SyncTab />} />
            <Route path="security" element={<SecurityTab />} />
            <Route path="about" element={<AboutTab />} />
          </Route>
        </Routes>
      ) : null}
    </>
  )
}
