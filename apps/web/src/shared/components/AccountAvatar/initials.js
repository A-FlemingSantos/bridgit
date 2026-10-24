// Up to two letters for the avatar tile: first letters of the first and last word of the name,
// or of the email's local part (split on . _ - +). One word gives one letter.
export function accountInitials(account) {
  const source = (account?.name?.trim() || account?.email?.split('@')[0] || '').trim()
  const words = source.split(/[\s._+-]+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = Array.from(words[0])[0]
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return `${first}${last}`.toLocaleUpperCase()
}
