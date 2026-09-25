export const ROUTES = {
  landing: '/',
  home: '/home',
  login: '/login',
  register: '/register',
  settings: '/settings',
  settingsProviders: '/settings/providers',
  settingsSecurity: '/settings/security',
  settingsSync: '/settings/sync',
  settingsAbout: '/settings/about',
  spaces: '/spaces',
  space: '/s/:spaceRef',
  legacySpace: '/spaces/:spaceRef',
  providers: '/providers',
  provider: '/providers/:provider',
  providerFolder: '/providers/:provider/folder/:folderRef',
  providerFile: '/providers/:provider/file/:fileRef',
  privacy: '/privacy',
  terms: '/terms',
  publicLink: '/p/:linkRef',
}

const PUBLIC_ROUTE_PREFIXES = ['/p/']

export function spaceUrl(spaceRef) {
  return `/s/${spaceRef}`
}

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
