import { useState } from 'react'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { linkedProviders } from '../data/mock.js'
import styles from './SettingsPage.module.css'

export default function ProvidersTab() {
  const [providers, setProviders] = useState(() => [...linkedProviders])

  function toggleProvider(id) {
    setProviders((prev) =>
      prev.map((provider) =>
        provider.id === id ? { ...provider, connected: !provider.connected } : provider,
      ),
    )
  }

  return (
    <section className={styles.pane}>
      <h1>Provedores</h1>
      <p className={styles.lead}>A conexão é global. Cada space só escolhe o que entra nele.</p>
      <div className={styles.cards}>
        {providers.map((provider) => (
          <div key={provider.id} className={styles.service}>
            <span className={styles.serviceMark} data-off={!provider.connected || undefined}>
              <ProviderMark id={provider.id} size={36} />
            </span>
            <div className={styles.who}>
              <p className={styles.whoName}>{provider.name}</p>
              <p className={styles.whoHint}>
                {provider.connected ? provider.account : 'Não conectado'}
              </p>
            </div>
            <button
              type="button"
              className={provider.connected ? styles.secondary : styles.primary}
              onClick={() => toggleProvider(provider.id)}
            >
              {provider.connected ? 'Desconectar' : 'Conectar'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
