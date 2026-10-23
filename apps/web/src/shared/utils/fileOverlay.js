import { matchPath, useLocation } from 'react-router-dom'
import { ROUTES } from '../config/routes.js'
import { isSettingsPath, resolveSettingsBackground, toBackgroundLocation } from './settingsOverlay.js'

export function isFilePath(pathname) {
  return matchPath({ path: ROUTES.providerFile, end: true }, pathname) !== null
}

// A file opened from a page rides on top of it: the route is the file's, the page behind stays in state.
// Without that state (a direct visit, a new tab) the file is a page of its own.
export function resolveFileBackground(location) {
  if (!isFilePath(location.pathname)) return null

  const background = location.state?.backgroundLocation
  if (!background?.pathname || isFilePath(background.pathname) || isSettingsPath(background.pathname)) {
    return null
  }

  return background
}

export function fileNavState(location) {
  if (isFilePath(location.pathname)) {
    return location.state ?? null
  }

  if (isSettingsPath(location.pathname)) {
    return null
  }

  return { backgroundLocation: toBackgroundLocation(location) }
}

// The page the user is on, looking through whichever overlay (settings, an open file) is above it.
export function resolvePageLocation(location) {
  if (isSettingsPath(location.pathname)) return resolveSettingsBackground(location)
  return resolveFileBackground(location) ?? location
}

export function usePageLocation() {
  return resolvePageLocation(useLocation())
}
