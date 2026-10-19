import { apiRequest } from './apiClient.js'

const MAX_LINK_ALIAS_LENGTH = 60

const ALIAS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
// New links carry a 4-char lowercase code; legacy links a 16-char base62 one (case matters).
const CODE_PATTERN = /^(?:[a-z0-9]{4}|[A-Za-z0-9]{16})$/

function linkBase(linkRef) {
  return `/api/public/links/${encodeURIComponent(linkRef)}`
}

export function getPublicLinkMetadata(linkRef) {
  return apiRequest(linkBase(linkRef))
}

export function listPublicLinkFolder(linkRef, { folder, cursor } = {}) {
  const query = {}

  if (folder != null && folder !== '') {
    query.folder = folder
  }

  if (cursor) {
    query.cursor = cursor
  }

  return apiRequest(`${linkBase(linkRef)}/items`, { query })
}

export function getPublicLinkItem(linkRef, itemRef) {
  return apiRequest(`${linkBase(linkRef)}/items/${encodeURIComponent(itemRef)}`)
}

function isValidLinkAlias(alias) {
  if (typeof alias !== 'string') return false
  const value = alias.toLowerCase()
  return value.length >= 1 && value.length <= MAX_LINK_ALIAS_LENGTH && ALIAS_PATTERN.test(value)
}

// Splits "<apelido>-<codigo>" at the last dash; the alias itself may contain dashes.
export function parseLinkRef(linkRef) {
  if (typeof linkRef !== 'string') return null
  const index = linkRef.lastIndexOf('-')
  if (index < 1) return null

  const alias = linkRef.slice(0, index).toLowerCase()
  const code = linkRef.slice(index + 1)
  if (!isValidLinkAlias(alias) || !CODE_PATTERN.test(code)) return null

  return { alias, code }
}
