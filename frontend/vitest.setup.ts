import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/* Capacitor's native bridge does not exist under jsdom, and the secure-storage
   plugin reaches for it at import time. The web build never calls into it — the
   refresh token is a cookie there — so a stub is honest rather than a shortcut. */
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
}))

/* jsdom ships no matchMedia, and the app asks it whether motion should be reduced —
   the sky, the compass and the scan moment all read the preference live. Reporting
   "no preference" is what a default browser would say, so the tests exercise the
   same branch a phone does. */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
