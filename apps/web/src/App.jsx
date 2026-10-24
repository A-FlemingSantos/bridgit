import { matchPath, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { SessionProvider, useSession } from './shared/auth/SessionContext.jsx'
import AuthPage from './features/auth/pages/AuthPage.jsx'
import HomePage from './features/home/pages/HomePage.jsx'
import SpaceBrowsePage from './features/spaces/pages/SpaceBrowsePage.jsx'
import SpaceFilePage from './features/spaces/pages/SpaceFilePage.jsx'
import SpaceDetailPage from './features/spaces/pages/SpaceDetailPage.jsx'
import SettingsPage from './features/settings/pages/SettingsPage.jsx'
import SpacesPage from './features/spaces/pages/SpacesPage.jsx'
import LandingPage from './features/landing/pages/LandingPage.jsx'
import PublicLinkPage from './features/public-link/pages/PublicLinkPage.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import Spinner from './shared/components/Spinner/Spinner.jsx'
import { driveFileUrl, driveFolderUrl, driveUrl, isPublicRoute, ROUTES, spaceUrl } from './shared/config/routes.js'
import { HubDataProvider } from './shared/hub/HubDataProvider.jsx'
import { useProviders } from './shared/hub/index.js'
import { HubProvider } from './shared/state/HubState.jsx'
import HubOverlays from './shared/state/HubOverlays.jsx'
import OperationNotices from './shared/components/OperationNotices/OperationNotices.jsx'
import { resolveFileBackground } from './shared/utils/fileOverlay.js'
import { isSettingsPath, resolveSettingsBackground } from './shared/utils/settingsOverlay.js'
import styles from './App.module.css'

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  )
}

function AppShell() {
  const { status, session, shouldDiscardReturnPath, acknowledgeDiscardReturnPath } = useSession()
  const location = useLocation()
  const settingsOpen = isSettingsPath(location.pathname)
  const fileBackground = resolveFileBackground(location)
  const backgroundLocation = settingsOpen ? resolveSettingsBackground(location) : (fileBackground ?? location)

  if (matchPath(ROUTES.publicLink, location.pathname)) {
    return (
      <Routes>
        <Route path={ROUTES.publicLink} element={<PublicLinkPage />} />
      </Routes>
    )
  }

  if (status === 'anonymous' && isPublicRoute(location.pathname) && shouldDiscardReturnPath()) {
    acknowledgeDiscardReturnPath()
  }

  if (status === 'boot') {
    return (
      <div className={styles.boot}>
        <Spinner />
      </div>
    )
  }

  if (!isPublicRoute(location.pathname) && status === 'anonymous') {
    if (shouldDiscardReturnPath()) {
      return <Navigate to={ROUTES.login} replace />
    }

    const from = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`${ROUTES.login}?from=${from}`} replace />
  }

  return (
    <HubDataProvider key={session?.user?.id ?? 'anonymous'}>
    <HubProvider>
      <Routes location={backgroundLocation}>
        <Route path={ROUTES.landing} element={<LandingPage />} />
        <Route path={ROUTES.login} element={<AuthPage />} />
        <Route path={ROUTES.register} element={<AuthPage />} />
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.spaces} element={<SpacesPage />} />
        <Route path={ROUTES.space} element={<SpaceDetailPage />} />
        <Route path={ROUTES.legacySpace} element={<LegacySpaceRedirect />} />
        <Route path={ROUTES.providers} element={<Navigate to={ROUTES.home} replace />} />
        <Route path={ROUTES.driveFolder} element={<SpaceBrowsePage />} />
        <Route path={ROUTES.driveFile} element={<SpaceFilePage />} />
        <Route path={ROUTES.drive} element={<SpaceBrowsePage />} />
        <Route path={ROUTES.providerFolder} element={<LegacyProviderRedirect />} />
        <Route path={ROUTES.providerFile} element={<LegacyProviderRedirect />} />
        <Route path={ROUTES.provider} element={<LegacyProviderRedirect />} />
        <Route path={ROUTES.privacy} element={<PlaceholderScreen title="Privacidade" />} />
        <Route path={ROUTES.terms} element={<PlaceholderScreen title="Termos" />} />
        <Route path="*" element={<PlaceholderScreen title="Página não encontrada" backLabel="Ir para o início" />} />
      </Routes>
      {settingsOpen ? (
        <Routes>
          <Route path={`${ROUTES.settings}/*`} element={<SettingsPage />} />
        </Routes>
      ) : null}
      {fileBackground ? (
        <Routes>
          <Route path={ROUTES.driveFile} element={<SpaceFilePage overlay />} />
        </Routes>
      ) : null}
      <HubOverlays />
      <OperationNotices />
    </HubProvider>
    </HubDataProvider>
  )
}

// Links made before an account could be told apart name only the provider. They keep working by landing on
// that provider's oldest account, at the same folder or file.
function LegacyProviderRedirect() {
  const { provider, folderRef, fileRef } = useParams()
  const location = useLocation()
  const { providers, status } = useProviders()

  if (status === 'idle' || status === 'loading') {
    return (
      <div className={styles.boot}>
        <Spinner />
      </div>
    )
  }

  const oldest = providers.find((row) => row.id === provider)?.connections?.[0] ?? null
  if (!oldest) {
    return <Navigate to={ROUTES.settingsProviders} replace />
  }

  const pathname = fileRef
    ? driveFileUrl(oldest.connectionId, fileRef)
    : folderRef
      ? driveFolderUrl(oldest.connectionId, folderRef)
      : driveUrl(oldest.connectionId)
  return <Navigate to={{ pathname, search: location.search, hash: location.hash }} replace state={location.state} />
}

function LegacySpaceRedirect() {
  const { spaceRef } = useParams()
  return <Navigate to={spaceUrl(spaceRef)} replace />
}
