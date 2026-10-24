import {
  ROUTES,
  driveFolderUrl,
  driveUrl,
} from '../../shared/config/routes.js'

// folder.ancestry lists the folders above the current one (root excluded, folder itself excluded).
// `connection` is the account being browsed; `rootLabel` names it (the provider, plus the account when the
// provider has several) and defaults to the provider name.
export function buildProviderBreadcrumbItems({ connection, rootLabel = null, folder = null, fileName = null }) {
  const { connectionId } = connection
  const items = [
    { label: 'Início', to: ROUTES.home },
    {
      label: rootLabel ?? connection.providerName,
      to: driveUrl(connectionId),
      // The mark drawn beside the title is the provider's.
      providerId: connection.provider,
    },
  ]

  const ancestry = folder?.ancestry ?? []
  ancestry.forEach((crumb, index) => {
    items.push({
      label: crumb.name,
      to: driveFolderUrl(connectionId, crumb.ref),
      state: { folderName: crumb.name, folderTrail: ancestry.slice(0, index) },
    })
  })

  if (folder?.ref) {
    items.push({
      label: folder.name ?? '…',
      to: fileName ? driveFolderUrl(connectionId, folder.ref) : null,
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
