import type {
  Card,
  CardPage,
  CollectionEntry,
  CollectionStats,
  Condition,
  DeviceSession,
  Health,
  Language,
  AuthSession,
  Pack,
  PricePoint,
  RegistrationPolicy,
  ScanResult,
  ShareStatus,
  SharedCollection,
  SharedWishlist,
  UserProfile,
  ValuePoint,
  WishlistBulkResult,
  WishlistEntry,
} from './types'

/* In dev, Vite proxies /api to the local uvicorn. In a Capacitor build there is no
   proxy, so VITE_API_BASE must point at the deployed backend by absolute URL. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export function imageUrl(card: Pick<Card, 'image_url'>): string | null {
  return card.image_url ? `${API_BASE}${card.image_url}` : null
}

// Written out rather than using constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, so TypeScript-only syntax that emits runtime code is rejected.
/* The access token lives in a module variable, never in localStorage: anything
   reachable from JavaScript is reachable from an XSS. It is short-lived, and the
   refresh token that renews it sits in an httpOnly cookie the page cannot read.

   The auth provider installs both hooks below; api.ts stays unaware of React so the
   two modules do not import each other. */
let accessToken: string | null = null
let renew: (() => Promise<boolean>) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setTokenRenewer(fn: (() => Promise<boolean>) | null) {
  renew = fn
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function headers(init?: RequestInit): HeadersInit {
  const base: Record<string, string> = {}
  if (init?.body) base['Content-Type'] = 'application/json'
  if (accessToken) base.Authorization = `Bearer ${accessToken}`
  return base
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: headers(init),
    ...init,
    ...(init?.body ? { headers: headers(init) } : {}),
  })

  // A 15-minute access token will expire mid-session by design. Renew once and
  // replay the call, so the expiry is invisible rather than a spurious error.
  if (response.status === 401 && retry && renew && !path.startsWith('/auth/')) {
    if (await renew()) return request<T>(path, init, false)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new ApiError(response.status, detail || response.statusText)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export interface CardQuery {
  q?: string
  language?: Language
  pack_code?: string
  /* Repeatable: several rarities or several colours read as "any of these", the way
     a filter panel reads — ticking two should widen the result, not empty it. */
  rarity?: string[]
  category?: string
  color?: string[]
  owned?: boolean
  /* `set` orders by the printed code, `date` by the real release date -- the two
     differ, because the set codes of the OP, EB and PRB families interleave in time. */
  sort?: 'code' | 'set' | 'name' | 'date'
  offset?: number
  limit?: number
}

export const api = {
  health: () => request<Health>('/health'),

  cards(query: CardQuery = {}) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue
      // A list travels as a repeated key -- rarity=Rare&rarity=SuperRare -- which is
      // what FastAPI reads back as a list. `set` would keep only the last one.
      if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
      else params.set(key, String(value))
    }
    return request<CardPage>(`/cards?${params}`)
  },

  card: (id: string, language: Language) =>
    request<Card>(`/cards/${encodeURIComponent(id)}?language=${language}`),

  priceHistory: (id: string, language: Language) =>
    request<PricePoint[]>(`/cards/${encodeURIComponent(id)}/prices?language=${language}`),

  collectionValueHistory: () => request<ValuePoint[]>('/collection/value-history'),

  packs: (language?: Language) =>
    request<Pack[]>(`/packs${language ? `?language=${language}` : ''}`),

  collection: (language?: Language) =>
    request<CollectionEntry[]>(
      `/collection${language ? `?language=${language}` : ''}`,
    ),

  collectionStats: () => request<CollectionStats>('/collection/stats'),

  addToCollection: (body: {
    card_id: string
    language: Language
    quantity?: number
    condition?: Condition | null
    acquisition_price?: number | null
  }) =>
    request<CollectionEntry>('/collection', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateCollection: (
    id: number,
    body: {
      quantity?: number
      condition?: Condition | null
      acquisition_price?: number | null
      notes?: string | null
      date_added?: string
    },
  ) =>
    request<CollectionEntry>(`/collection/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  removeFromCollection: (id: number) =>
    request<void>(`/collection/${id}`, { method: 'DELETE' }),

  wishlist: () => request<WishlistEntry[]>('/wishlist'),

  addToWishlist: (body: {
    card_id: string
    language: Language
    priority?: number
    notes?: string | null
  }) => request<WishlistEntry>('/wishlist', { method: 'POST', body: JSON.stringify(body) }),

  /* One call for a whole set, rather than a loop over addToWishlist: that one treats
     a repeat as an edit, so looping would reset the priority, price and notes on
     every card already wanted. The server only ever inserts, and reports what it
     left alone. */
  wantEverythingMissing: (body: { pack_code: string; language: Language }) =>
    request<WishlistBulkResult>('/wishlist/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateWishlist: (
    id: number,
    body: { priority?: number; price?: number | null; notes?: string | null },
  ) =>
    request<WishlistEntry>(`/wishlist/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  removeFromWishlist: (id: number) =>
    request<void>(`/wishlist/${id}`, { method: 'DELETE' }),

  updateProfile: (
    body: {
      default_language?: Language
      grid_columns?: number
      display_name?: string
      /* Explicit null clears the goal; the pair moves together or not at all —
         the server refuses one without the other. */
      goal_pack_code?: string | null
      goal_language?: Language | null
    },
  ) =>
    request<UserProfile>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),

  searchHistory: () => request<string[]>('/search-history'),

  addSearchHistory: (query: string) =>
    request<string[]>('/search-history', { method: 'POST', body: JSON.stringify({ query }) }),

  clearSearchHistory: () => request<void>('/search-history', { method: 'DELETE' }),

  registrationPolicy: () => request<RegistrationPolicy>('/auth/registration'),

  register: (body: {
    email: string
    password: string
    display_name?: string
    invite_code?: string
  }) =>
    request<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  /* On native the token comes from secure storage and travels in the body; in a
     browser it rides the httpOnly cookie and this argument stays undefined. */
  refresh: (refreshToken?: string) =>
    request<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken ?? null }),
    }),

  logout: (refreshToken?: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken ?? null }),
    }),

  me: () => request<UserProfile>('/auth/me'),

  changePassword: (body: { current_password: string; new_password: string }) =>
    request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),

  deleteAccount: () => request<void>('/auth/me', { method: 'DELETE' }),

  sessions: () => request<DeviceSession[]>('/auth/sessions'),
  revokeSession: (id: number) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),

  collectionShareStatus: () => request<ShareStatus>('/collection/share'),
  enableCollectionShare: () => request<ShareStatus>('/collection/share', { method: 'POST' }),
  disableCollectionShare: () => request<void>('/collection/share', { method: 'DELETE' }),
  /* No token in module state to send here, so the request carries no Authorization
     header regardless of who is signed in — which is the point: this is what an
     anonymous visitor with only the link sees. */
  sharedCollection: (token: string) =>
    request<SharedCollection>(`/shared/collection/${encodeURIComponent(token)}`),

  wishlistShareStatus: () => request<ShareStatus>('/wishlist/share'),
  enableWishlistShare: () => request<ShareStatus>('/wishlist/share', { method: 'POST' }),
  disableWishlistShare: () => request<void>('/wishlist/share', { method: 'DELETE' }),
  sharedWishlist: (token: string) =>
    request<SharedWishlist>(`/shared/wishlist/${encodeURIComponent(token)}`),

  /* Language is always sent: the step-5 gate confirmed the edition cannot be read
     from the artwork, so leaving it out would let the wrong printing come back. */
  scan(file: File, language: Language) {
    const body = new FormData()
    body.append('file', file)
    // No Content-Type header: the browser must set the multipart boundary itself.
    return fetch(`${API_BASE}/scan?language=${language}`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body,
    }).then(async (response) => {
      if (!response.ok) {
        throw new ApiError(response.status, await response.text().catch(() => ''))
      }
      return (await response.json()) as ScanResult
    })
  },
}
