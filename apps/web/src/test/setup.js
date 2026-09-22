import * as matchers from '@testing-library/jest-dom/matchers'
import { afterEach, beforeAll, expect, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

expect.extend(matchers)

export function clearBrowserCookies() {
  document.cookie = 'bridgit.browser=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
}

afterEach(() => {
  vi.useRealTimers()

  if (typeof window === 'undefined') return

  cleanup()
  clearBrowserCookies()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

beforeAll(() => {
  if (typeof window === 'undefined') return

  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!window.scrollTo) {
    window.scrollTo = vi.fn()
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
})
