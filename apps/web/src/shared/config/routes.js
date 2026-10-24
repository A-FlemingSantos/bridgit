export const ROUTES = {
  landing: '/',
  home: '/home',
  login: '/login',
  register: '/register',
  settings: '/settings',
  settingsProviders: '/settings/providers',
  settingsSecurity: '/settings/security',
  settingsAbout: '/settings/about',
  spaces: '/spaces',
  space: '/s/:spaceRef',
  legacySpace: '/spaces/:spaceRef',
  providers: '/providers',
  provider: '/providers/:provider',
  providerFolder: '/providers/:provider/folder/:folderRef',
  providerFile: '/providers/:provider/file/:fileRef',
  drive: '/drives/:connectionId',
  driveFolder: '/drives/:connectionId/folder/:folderRef',
  driveFile: '/drives/:connectionId/file/:fileRef',
  privacy: '/privacy',
  terms: '/terms',
  publicLink: '/p/:linkRef',
}

const PUBLIC_ROUTE_PREFIXES = ['/p/']

export function spaceUrl(spaceRef) {
  return `/s/${spaceRef}`
}

// A connected account (one of possibly several per provider), keyed by its connection id.
export function driveUrl(connectionId) {
  return `/drives/${connectionId}`
}

export function driveFolderUrl(connectionId, folderRef) {
  return `/drives/${connectionId}/folder/${encodeURIComponent(folderRef)}`
}

export function driveFileUrl(connectionId, fileRef) {
  return `/drives/${connectionId}/file/${encodeURIComponent(fileRef)}`
}

// Legacy provider-keyed URLs: they redirect to the provider's oldest account.
export function providerUrl(provider) {
  return `/providers/${provider}`
}

export function providerFolderUrl(provider, folderRef) {
  return `/providers/${provider}/folder/${encodeURIComponent(folderRef)}`
}

export function providerFileUrl(provider, fileRef) {
  return `/providers/${provider}/file/${encodeURIComponent(fileRef)}`
}

export const PUBLIC_ROUTES = new Set([
  ROUTES.landing,
  ROUTES.login,
  ROUTES.register,
  ROUTES.privacy,
  ROUTES.terms,
])

export function isPublicRoute(pathname) {
  return PUBLIC_ROUTES.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function sanitizeInternalAppRedirect(value) {
  if (!value || typeof value !== 'string') {
    return ROUTES.home
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) {
    return ROUTES.home
  }

  return value
}
