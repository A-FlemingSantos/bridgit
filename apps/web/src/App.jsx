import { Route, Routes } from 'react-router-dom'
import LandingPage from './features/landing/pages/LandingPage.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import { ROUTES } from './shared/config/routes.js'

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<LandingPage />} />
      <Route path={ROUTES.login} element={<PlaceholderScreen title="Entrar" />} />
      <Route path={ROUTES.register} element={<PlaceholderScreen title="Criar conta" />} />
      <Route path={ROUTES.privacy} element={<PlaceholderScreen title="Privacidade" />} />
      <Route path={ROUTES.terms} element={<PlaceholderScreen title="Termos" />} />
    </Routes>
  )
}
