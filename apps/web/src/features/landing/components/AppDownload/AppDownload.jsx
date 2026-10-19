import { ArrowRight } from 'lucide-react'
import androidMark from '../../../settings/assets/devices/android.svg'
import { QR_PATH, QR_VIEWBOX } from './qrPath.js'
import styles from './AppDownload.module.css'

const APK_URL =
  'https://expo.dev/accounts/a-flemingsantos/projects/bridgit-mobile/builds/b25965d8-32d4-452f-aa75-d3966dcb2cb1'

export default function AppDownload() {
  return (
    <section className={styles.section} aria-labelledby="landing-app">
      <h2 id="landing-app" className={styles.heading}>
        App mobile
      </h2>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h3 className={styles.title}>Seus arquivos também no Android</h3>
          <p className={styles.body}>
            Escaneie o código com a câmera do celular ou toque no botão para baixar o app. Na
            instalação, o Android pode pedir para permitir fontes desconhecidas.
          </p>
          <a className={styles.button} href={APK_URL} target="_blank" rel="noopener noreferrer">
            <img className={styles.buttonIcon} src={androidMark} alt="" draggable="false" />
            Baixar para Android
            <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.qr}>
          <svg
            className={styles.qrImage}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${QR_VIEWBOX} ${QR_VIEWBOX}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label="QR Code para baixar o app Bridgit para Android"
          >
            <path stroke="#000" d={QR_PATH} />
          </svg>
        </div>
      </div>
    </section>
  )
}
