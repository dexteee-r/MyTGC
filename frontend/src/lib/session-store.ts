import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

/* Where the refresh token lives, which differs by platform on purpose.

   In a browser it lives nowhere the page can reach: the server sets it as an
   httpOnly cookie, so an XSS cannot read it and this module has nothing to do.

   A native build cannot rely on that cookie — the WebView's origin is
   capacitor://localhost and iOS restricts cross-site cookies — so the token comes
   back in the response body instead and has to be kept somewhere. Keychain on iOS,
   the Keystore on Android: hardware-backed, and not readable by another app.

   `localStorage` and `@capacitor/preferences` are both wrong here. Preferences maps
   to UserDefaults and SharedPreferences, which are plain files: on a rooted or
   jailbroken device a thirty-day token sits there in the clear. */

const KEY = 'refresh_token'

export const isNative = Capacitor.isNativePlatform()

export async function saveRefreshToken(token: string): Promise<void> {
  if (!isNative) return
  try {
    await SecureStorage.set(KEY, token)
  } catch {
    // A device with no usable keystore is not a reason to break the sign-in; the
    // session simply will not survive a restart.
  }
}

export async function loadRefreshToken(): Promise<string | null> {
  if (!isNative) return null
  try {
    const value = await SecureStorage.get(KEY)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (!isNative) return
  try {
    await SecureStorage.remove(KEY)
  } catch {
    /* nothing stored, nothing to clear */
  }
}
