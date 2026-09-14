export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  settings: '/settings',
  settingsProviders: '/settings/providers',
  settingsSecurity: '/settings/security',
  settingsSync: '/settings/sync',
  settingsAbout: '/settings/about',
  spaces: '/spaces',
  space: '/spaces/:space',
  spaceFolder: '/spaces/:space/folder/:folderRef',
  spaceFile: '/spaces/:space/file/:fileRef',
  provider: '/providers/:provider',
  providerFolder: '/providers/:provider/folder/:folderRef',
  providerFile: '/providers/:provider/file/:fileRef',
  privacy: '/privacy',
  terms: '/terms',
}

export function spaceUrl(space) {
  return `/spaces/${space}`
}

export function spaceFolderUrl(space, folderRef) {
  return `/spaces/${space}/folder/${folderRef}`
}

export function spaceFileUrl(space, fileRef) {
  return `/spaces/${space}/file/${fileRef}`
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
