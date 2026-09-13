import { ROUTES } from '../config/routes.js'

const SPACES_LOCATION = {
  pathname: ROUTES.spaces,
  search: '',
  hash: '',
  state: null,
}

export function isSettingsPath(pathname) {
  return pathname === ROUTES.settings || pathname.startsWith(`${ROUTES.settings}/`)
}

function toBackgroundLocation(location) {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    state: location.state ?? null,
  }
}

export function settingsNavState(location) {
  if (isSettingsPath(location.pathname)) {
    return location.state ?? null
  }

  return { backgroundLocation: toBackgroundLocation(location) }
}

export function resolveSettingsBackground(location) {
  const background = location.state?.backgroundLocation
  if (background?.pathname && !isSettingsPath(background.pathname)) {
    return background
  }

  return SPACES_LOCATION
}
