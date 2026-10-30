import { toEntry } from './format'

// A search needs this many letters; fewer reads as "keep typing".
export const SEARCH_MIN_LENGTH = 2

// The answer of /api/search as the screens use it: files and folders, each in the account it was found in.
export function searchEntries(data) {
  return (Array.isArray(data?.results) ? data.results : []).map((item) => toEntry(item, item.connectionId))
}

// Each queried account answers on its own: one can fail, or still be syncing, while another finds files.
export function summarizeSearch(providers) {
  const queried = Array.isArray(providers) ? providers : []
  const failed = queried.filter((entry) => entry.ok === false)
  const syncing = queried.filter((entry) => entry.ok !== false && entry.catalog?.coverage === 'partial')
  const allFailed = queried.length > 0 && failed.length === queried.length
  return { failed, syncing, allFailed, someFailed: failed.length > 0 && !allFailed }
}
