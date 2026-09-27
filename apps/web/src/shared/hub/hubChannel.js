export const HUB_CHANNEL_NAME = 'bridgit-hub'

export function broadcastHubEvent(event) {
  try {
    const BC = globalThis.BroadcastChannel
    if (typeof BC !== 'function') return
    const channel = new BC(HUB_CHANNEL_NAME)
    channel.postMessage(event)
    channel.close()
  } catch {
    // BroadcastChannel indisponível (jsdom/SSR); invalidação local segue valendo.
  }
}

export function subscribeHubEvents(handler) {
  try {
    const BC = globalThis.BroadcastChannel
    if (typeof BC !== 'function') return () => {}
    const channel = new BC(HUB_CHANNEL_NAME)
    channel.onmessage = (message) => {
      handler(message?.data)
    }
    return () => {
      try {
        channel.close()
      } catch {
        // ignora erro ao fechar
      }
    }
  } catch {
    return () => {}
  }
}

export function invalidateMessage(scope, providerId = null, keys = []) {
  return { type: 'invalidate', scope, providerId, keys }
}
