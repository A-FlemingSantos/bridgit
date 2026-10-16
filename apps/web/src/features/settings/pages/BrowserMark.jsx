import androidMark from '../assets/devices/android.svg'
import braveMark from '../assets/browsers/brave.svg'
import chromeMark from '../assets/browsers/chrome.svg'
import edgeMark from '../assets/browsers/edge.svg'
import firefoxMark from '../assets/browsers/firefox.svg'
import genericMark from '../assets/browsers/generic.svg'
import operaMark from '../assets/browsers/opera.svg'
import safariMark from '../assets/browsers/safari.svg'
import styles from './BrowserMark.module.css'

const MARKS = {
  Chrome: chromeMark,
  Edge: edgeMark,
  Firefox: firefoxMark,
  Safari: safariMark,
  Opera: operaMark,
  Brave: braveMark,
  Navegador: genericMark,
}

// The mobile app reports browser "App Bridgit"; its okhttp user agent yields device "Celular".
function isAndroid(browser, device) {
  return device === 'Android' || (browser === 'App Bridgit' && device === 'Celular')
}

export default function BrowserMark({ browser, device, size = 22 }) {
  const src = isAndroid(browser, device) ? androidMark : MARKS[browser]
  if (!src) return null

  return (
    <img
      className={styles.mark}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable="false"
    />
  )
}
