// Tells subscribed screens which scopes changed. A subscriber is notified once per
// invalidation, however many of its scopes match.
export function createInvalidationBus() {
  const subscribers = new Set()

  return {
    subscribe(scopes, notify) {
      const subscriber = { scopes: new Set(scopes), notify }
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    },
    invalidate(scopes) {
      const changed = new Set(scopes)
      if (changed.size === 0) return
      for (const subscriber of [...subscribers]) {
        if ([...subscriber.scopes].some((scope) => changed.has(scope))) subscriber.notify()
      }
    },
    invalidateAll() {
      for (const subscriber of [...subscribers]) subscriber.notify()
    },
  }
}

// Only the latest run may publish its result: a slow, older request never overwrites a newer one.
export function createLatestRunner() {
  let current = 0

  return {
    // Resolves { value }, { error } or { stale: true } when a newer run (or cancel) came first.
    async run(task) {
      const id = ++current
      try {
        const value = await task()
        return id === current ? { value } : { stale: true }
      } catch (error) {
        return id === current ? { error } : { stale: true }
      }
    },
    cancel() {
      current += 1
    },
  }
}
