const DAY_MS = 24 * 60 * 60 * 1000

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
const FULL = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

// Caption under a file or folder: weekday and time within the last week, day and month this year, full date before that.
export function formatItemDate(value, now = new Date()) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const age = now.getTime() - date.getTime()
  if (age >= 0 && age < 6 * DAY_MS) {
    return `${WEEKDAY.format(date)} às ${TIME.format(date)}`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return DAY_MONTH.format(date)
  }
  return FULL.format(date)
}
