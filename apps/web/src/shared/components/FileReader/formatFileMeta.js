export function formatFileMeta({ extension, providerName }) {
  const parts = []

  if (extension) {
    parts.push(extension.replace(/^\./, '').toUpperCase())
  }

  if (providerName) {
    parts.push(providerName)
  }

  return parts.filter(Boolean).join(' · ')
}
