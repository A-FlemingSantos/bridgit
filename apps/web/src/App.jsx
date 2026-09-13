import { Route, Routes } from 'react-router-dom'
import AuthPage from './features/auth/pages/AuthPage.jsx'
import SpaceBrowsePage from './features/spaces/pages/SpaceBrowsePage.jsx'
import SpaceFilePage from './features/spaces/pages/SpaceFilePage.jsx'
import SpacesPage from './features/spaces/pages/SpacesPage.jsx'
import LandingPage from './features/landing/pages/LandingPage.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import { ROUTES } from './shared/config/routes.js'

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<LandingPage />} />
      <Route path={ROUTES.login} element={<AuthPage />} />
      <Route path={ROUTES.register} element={<AuthPage />} />
      <Route path={ROUTES.spaces} element={<SpacesPage />} />
      <Route path={ROUTES.spaceFolder} element={<SpaceBrowsePage />} />
      <Route path={ROUTES.spaceFile} element={<SpaceFilePage />} />
      <Route path={ROUTES.space} element={<SpaceBrowsePage />} />
      <Route path={ROUTES.provider} element={<SpaceBrowsePage />} />
      <Route path={ROUTES.privacy} element={<PlaceholderScreen title="Privacidade" />} />
      <Route path={ROUTES.terms} element={<PlaceholderScreen title="Termos" />} />
    </Routes>
  )
}
