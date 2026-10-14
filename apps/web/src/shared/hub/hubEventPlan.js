// What a server event makes stale, so only that is fetched again. A full provider refresh
// reloads every open folder and replays their lists; keep it for the cases that really need it.
export function planEventRefresh(event) {
  const payload = event?.payload ?? {}
  if (event?.type === 'hub_entries') return { home: true }
  if (event?.type === 'catalog') {
    if (payload.refresh) return { all: true }
    if (Object.prototype.hasOwnProperty.call(payload, 'parentRef')) return { folders: [payload.parentRef || null] }
    // A removed or changed item whose folder the event does not name: the folders showing it, and the
    // home lists that may carry its name.
    if (payload.ref) return { containing: [payload.ref], home: true }
  }
  return { all: true }
}

// Merges plans of several events into one per provider.
export function mergeRefreshPlans(current, plan) {
  const next = current ?? { all: false, home: false, folders: new Set(), containing: new Set() }
  if (plan.all) next.all = true
  if (plan.home) next.home = true
  for (const folder of plan.folders ?? []) next.folders.add(folder)
  for (const ref of plan.containing ?? []) next.containing.add(ref)
  return next
}
