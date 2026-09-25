import {
  ROUTES,
  providerFolderUrl,
  providerUrl,
} from '../../shared/config/routes.js'

// folder.ancestry lists the folders above the current one (root excluded, folder itself excluded).
export function buildProviderBreadcrumbItems({ provider, folder = null, fileName = null }) {
  const items = [
    { label: 'Início', to: ROUTES.home },
    {
      label: provider.name,
      to: providerUrl(provider.id),
      providerId: provider.id,
    },
  ]

  const ancestry = folder?.ancestry ?? []
  ancestry.forEach((crumb, index) => {
    items.push({
      label: crumb.name,
      to: providerFolderUrl(provider.id, crumb.ref),
      state: { folderName: crumb.name, folderTrail: ancestry.slice(0, index) },
    })
  })

  if (folder?.ref) {
    items.push({
      label: folder.name ?? '…',
      to: fileName ? providerFolderUrl(provider.id, folder.ref) : null,
      state: fileName ? { folderName: folder.name, folderTrail: ancestry } : undefined,
      current: !fileName,
    })
  }

  if (fileName) {
    items.push({ label: fileName, to: null, current: true })
  } else if (!folder?.ref) {
    items[items.length - 1] = {
      ...items[items.length - 1],
      to: null,
      current: true,
    }
  }

  return items
}

// Trail handed to a child folder link so its header renders before the listing loads.
export function childFolderTrail(folder) {
  if (!folder?.ref) return []
  return [...(folder.ancestry ?? []), { ref: folder.ref, name: folder.name }]
}
