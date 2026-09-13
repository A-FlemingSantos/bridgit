import { useState } from 'react'
import Toggle from '../components/Toggle.jsx'
import styles from './SettingsPage.module.css'

export default function SyncTab() {
  const [mirror, setMirror] = useState(false)
  const [notify, setNotify] = useState(true)

  return (
    <section className={styles.pane}>
      <h1>Sincronização</h1>
      <p className={styles.lead}>
        Nada é espelhado por padrão. O hub só orquestra o que você ligar — a cópia continua no
        provedor.
      </p>

      <div className={styles.cards}>
        <div className={styles.pref}>
          <span>
            <span className={styles.prefTitle}>Espelhar itens marcados</span>
            <span className={styles.hint}>Bidirecional entre as nuvens já conectadas.</span>
          </span>
          <Toggle label="Espelhar itens marcados" checked={mirror} onChange={setMirror} />
        </div>
        <div className={styles.pref}>
          <span>
            <span className={styles.prefTitle}>Avisar se a sincronização falhar</span>
            <span className={styles.hint}>Só para os itens que você marcou.</span>
          </span>
          <Toggle label="Avisar se a sincronização falhar" checked={notify} onChange={setNotify} />
        </div>
      </div>
    </section>
  )
}
