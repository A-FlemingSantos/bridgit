import { useEffect, useState } from 'react'

const STORAGE_KEY = 'bridgit.windowsDevice.linked'

// A fresh Windows install names the PC DESKTOP- plus seven letters or digits.
export const WINDOWS_DEVICE_NAME = 'DESKTOP-6K2J8M1'

// Click is the only way in. A previous build stored the click, which kept the
// Windows logo on screen after reload; drop that flag.
try {
  sessionStorage.removeItem(STORAGE_KEY)
} catch {
  // Storage can be unavailable.
}

let linked = false
const listeners = new Set()

export function resetWindowsDevice() {
  linked = false
  listeners.forEach((listener) => listener())
}

function linkWindowsDevice() {
  if (linked) return
  linked = true
  listeners.forEach((listener) => listener())
}

export function useWindowsDevice() {
  const [isLinked, setLinked] = useState(linked)

  useEffect(() => {
    const listener = () => setLinked(linked)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])

  return [isLinked, linkWindowsDevice]
}

export function LinkWindowsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18h18v-2h2v4H1v-4h2v2Zm2-4h14V6h2v10H3V6h2v8Zm14-8H5V4h14v2Z" />
    </svg>
  )
}

export function WindowsLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 4875 4875" aria-hidden="true">
      <path fill="#0078d4" d="M0 0h2311v2310H0zm2564 0h2311v2310H2564zM0 2564h2311v2311H0zm2564 0h2311v2311H2564" />
    </svg>
  )
}
