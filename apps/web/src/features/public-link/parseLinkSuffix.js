export function parseLinkSuffix(linkRef) {
  if (!linkRef) return ''

  const dashIndex = linkRef.lastIndexOf('-')
  if (dashIndex === -1) {
    return linkRef.slice(-16)
  }

  return linkRef.slice(dashIndex + 1)
}
