const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
  { limit: 2629800, divisor: 604800, unit: 'week' },
  { limit: Number.POSITIVE_INFINITY, divisor: 2629800, unit: 'month' },
]

const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatRelativeTime(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const absSeconds = Math.abs(seconds)

  for (const { limit, divisor, unit } of UNITS) {
    if (absSeconds < limit) {
      const amount = Math.round(seconds / divisor)
      return formatter.format(amount, unit)
    }
  }

  return formatter.format(Math.round(seconds / 2629800), 'month')
}
