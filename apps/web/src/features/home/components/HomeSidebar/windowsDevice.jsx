import { useEffect, useState } from 'react'

const STORAGE_KEY = 'bridgit.windowsDevice.linked'

// A fresh Windows install names the PC DESKTOP- plus seven letters or digits.
export const WINDOWS_DEVICE_NAME = 'DESKTOP-6K2J8M1'

const listeners = new Set()

export function readWindowsLinked() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function linkWindowsDevice() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Storage can be unavailable; the in-memory listeners still update this tab.
  }
  listeners.forEach((listener) => listener())
}

export function useWindowsDevice() {
  const [linked, setLinked] = useState(readWindowsLinked)

  useEffect(() => {
    const listener = () => setLinked(readWindowsLinked())
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])

  return [linked, linkWindowsDevice]
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
