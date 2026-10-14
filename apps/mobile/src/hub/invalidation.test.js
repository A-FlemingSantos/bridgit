import { describe, expect, it, vi } from 'vitest'
import { createInvalidationBus, createLatestRunner } from './invalidation'

describe('createInvalidationBus', () => {
  it('notifies only subscribers of an invalidated scope, once each', () => {
    const bus = createInvalidationBus()
    const home = vi.fn()
    const folder = vi.fn()
    bus.subscribe(['home'], home)
    bus.subscribe(['folder:g:a', 'folders:g'], folder)

    bus.invalidate(['folder:g:a', 'folders:g'])
    expect(folder).toHaveBeenCalledTimes(1)
    expect(home).not.toHaveBeenCalled()

    bus.invalidate(['folder:g:b'])
    expect(folder).toHaveBeenCalledTimes(1)

    bus.invalidate(['home', 'x'])
    expect(home).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe and notifies everyone on invalidateAll', () => {
    const bus = createInvalidationBus()
    const a = vi.fn()
    const b = vi.fn()
    const unsubscribe = bus.subscribe(['a'], a)
    bus.subscribe([], b)

    unsubscribe()
    bus.invalidate(['a'])
    expect(a).not.toHaveBeenCalled()

    bus.invalidateAll()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('ignores an empty invalidation', () => {
    const bus = createInvalidationBus()
    const listener = vi.fn()
    bus.subscribe(['a'], listener)
    bus.invalidate([])
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('createLatestRunner', () => {
  const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  it('drops a slow older response that settles after a newer one', async () => {
    const runner = createLatestRunner()
    const slow = deferred()
    const fast = deferred()

    const first = runner.run(() => slow.promise)
    const second = runner.run(() => fast.promise)
    fast.resolve('new')
    expect(await second).toEqual({ value: 'new' })
    slow.resolve('old')
    expect(await first).toEqual({ stale: true })
  })

  it('drops an older failure as well', async () => {
    const runner = createLatestRunner()
    const slow = deferred()
    const first = runner.run(() => slow.promise)
    const second = runner.run(async () => 'ok')
    slow.reject(new Error('boom'))
    expect(await second).toEqual({ value: 'ok' })
    expect(await first).toEqual({ stale: true })
  })

  it('reports the error of the latest run', async () => {
    const runner = createLatestRunner()
    const error = new Error('boom')
    expect(await runner.run(async () => { throw error })).toEqual({ error })
  })

  it('ignores a run that settles after cancel', async () => {
    const runner = createLatestRunner()
    const pending = deferred()
    const run = runner.run(() => pending.promise)
    runner.cancel()
    pending.resolve('late')
    expect(await run).toEqual({ stale: true })
  })
})
