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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
