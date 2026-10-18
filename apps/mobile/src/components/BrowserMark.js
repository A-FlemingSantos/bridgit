import { android, brave, chrome, edge, firefox, generic, opera, safari } from '../assets/browserMarks'
import SvgMark from './SvgMark'

const MARKS = {
  Chrome: chrome,
  Edge: edge,
  Firefox: firefox,
  Safari: safari,
  Opera: opera,
  Brave: brave,
  Navegador: generic,
}

// The mobile app reports browser "App Bridgit"; its okhttp user agent yields device "Celular"
// (same rule as the web's BrowserMark).
function isAndroid(browser, device) {
  return device === 'Android' || (browser === 'App Bridgit' && device === 'Celular')
}

export default function BrowserMark({ browser, device, size = 28 }) {
  const source = isAndroid(browser, device) ? android : MARKS[browser] ?? generic
  return <SvgMark source={source} size={size} />
}
