export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return ''

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const formatted =
    Number.isInteger(value) || value >= 10 || unitIndex === 0
      ? value.toFixed(0)
      : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}
