import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { configureApiClient } from '@bridgit/shared-client'
import App from './App.jsx'
import { getApiBaseUrl } from './shared/config/apiBase.js'
import '@fontsource-variable/geist'
import './shared/styles/globals.css'

const apiBaseUrl = getApiBaseUrl()
if (apiBaseUrl) configureApiClient({ baseUrl: apiBaseUrl })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
