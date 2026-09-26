export const STAGGER_LIMIT = 12
export const STAGGER_MAX_DELAY = 0.35

export function entryDelay(index, base = 0.06, step = 0.03) {
  if (!Number.isFinite(index) || index < 0 || index >= STAGGER_LIMIT) return null
  return Math.min(base + index * step, STAGGER_MAX_DELAY)
}
