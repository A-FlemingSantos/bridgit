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
  space: '/spaces/:spaceRef',
  providers: '/providers',
  provider: '/providers/:provider',
  providerFolder: '/providers/:provider/folder/:folderRef',
  providerFile: '/providers/:provider/file/:fileRef',
  privacy: '/privacy',
  terms: '/terms',
}

export function spaceUrl(spaceRef) {
  return `/spaces/${spaceRef}`
}

export function providerUrl(provider) {
  return `/providers/${provider}`
}

export function providerFolderUrl(provider, folderRef) {
  return `/providers/${provider}/folder/${folderRef}`
}

export function providerFileUrl(provider, fileRef) {
  return `/providers/${provider}/file/${fileRef}`
}
