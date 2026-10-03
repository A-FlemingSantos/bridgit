import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventPoller } from './eventPoller'

function setup(overrides = {}) {
  const delivered = []
  const options = {
    getToken: () => 'token',
    fetchHead: vi.fn(async () => 10),
    fetchEvents: vi.fn(async () => []),
    onEvents: (events) => delivered.push(...events),
    onUnauthorized: vi.fn(),
    intervalMs: 1000,
    retryMs: 300,
    ...overrides,
  }
  return { poller: createEventPoller(options), options, delivered }
}

describe('createEventPoller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts from the current head and never replays older events', async () => {
    const { poller, options, delivered } = setup()
    options.fetchEvents.mockResolvedValueOnce([{ sequence: 9 }, { sequence: 10 }, { sequence: 11 }])

    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(options.fetchHead).toHaveBeenCalledTimes(1)
    expect(options.fetchEvents).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(options.fetchEvents).toHaveBeenCalledWith('token', 10)
    expect(delivered.map((event) => event.sequence)).toEqual([11])
    poller.stop()
  })

  it('delivers each event once and advances the cursor', async () => {
    const { poller, options, delivered } = setup()
    options.fetchEvents
      .mockResolvedValueOnce([{ sequence: 11 }, { sequence: 12 }])
      .mockResolvedValueOnce([{ sequence: 12 }, { sequence: 13 }])

    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(delivered.map((event) => event.sequence)).toEqual([11, 12, 13])
    expect(options.fetchEvents).toHaveBeenLastCalledWith('token', 12)
    poller.stop()
  })

  it('retries after a network error without losing its place', async () => {
    const { poller, options, delivered } = setup()
    options.fetchEvents
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }))
      .mockResolvedValueOnce([{ sequence: 11 }])

    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(300)

    expect(delivered.map((event) => event.sequence)).toEqual([11])
    poller.stop()
  })

  it('stops and reports a rejected token', async () => {
    const { poller, options } = setup()
    options.fetchEvents.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 401 }))

    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(options.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(options.fetchEvents).toHaveBeenCalledTimes(1)
  })

  it('does nothing after stop', async () => {
    const { poller, options } = setup()
    poller.start()
    poller.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(options.fetchHead).not.toHaveBeenCalled()
  })
})
