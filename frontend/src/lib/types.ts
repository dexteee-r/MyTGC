export type Language = 'en' | 'jp'

export type Condition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

export interface Card {
  id: string
  language: Language
  name: string
  pack_id: string
  pack_code: string | null
  pack_name: string | null
  rarity: string | null
  category: string | null
  colors: string[]
  cost: number | null
  power: number | null
  counter: number | null
  attributes: string[]
  types: string[]
  effect: string | null
  trigger: string | null
  release_date: string | null
  market_price: number | null
  image_url: string | null
  printings: string[]
}

/* One snapshot. The importer stamps at most one row per card per day, so points are
   already deduplicated by the time they reach here -- nothing to collapse client
   side. */
export interface PricePoint {
  captured_at: string
  price: number
}

/* The same shape as PricePoint with a different name for what the number means: a
   collection's total on that date, not one card's price. PriceChart only cares
   about captured_at and a number, so callers map { captured_at, price: total }
   into it rather than the chart growing a second, near-identical prop shape. */
export interface ValuePoint {
  captured_at: string
  total: number
}

export interface CardPage {
  items: Card[]
  total: number
  offset: number
  limit: number
}

export interface Pack {
  pack_id: string
  language: Language
  pack_code: string | null
  pack_name: string | null
  card_count: number
  owned_count: number
}

export interface CollectionEntry {
  id: number
  card_id: string
  language: Language
  quantity: number
  condition: Condition | null
  date_added: string
  acquisition_price: number | null
  /* About this specific copy -- "signée", "achetée à Paris" -- not about the card,
     which every account shares. */
  notes: string | null
  card: Card | null
}

/* What adding a whole set at once actually did. `already_listed` is not noise: it is
   the difference between "150 cartes ajoutées" and the truth, and saying the wrong
   one makes the button look broken the day it adds nothing. */
export interface WishlistBulkResult {
  missing: number
  added: number
  already_listed: number
}

export interface WishlistEntry {
  id: number
  card_id: string
  language: Language
  priority: number
  alert_threshold: number | null
  /* What the card costs where it was seen, typed in by hand. There is no price feed
     behind the app, and a plausible number nobody entered would read as real data. */
  price: number | null
  notes: string | null
  card: Card | null
}

export interface CollectionStats {
  distinct_cards: number
  total_quantity: number
  by_language: Record<string, number>
  by_rarity: Record<string, number>
  acquisition_total: number
  market_total: number
  market_priced: number
  market_currency: string
}

export interface Health {
  status: string
  catalogue: Record<string, number>
  hashed_cards: number
  scan_enabled: boolean
  scan_threshold?: number
  scan_rate_limit?: number
  scan_window_seconds?: number
}

export interface ScanPrinting {
  card_id: string
  distance: number
  pack_code: string | null
  rarity: string | null
}

export interface ScanCandidate {
  card_number: string
  language: Language
  name: string
  distance: number
  printings: ScanPrinting[]
  ambiguous_printing: boolean
  card: Card | null
}

export interface ScanResult {
  detected: boolean
  confident: boolean
  margin: number | null
  candidates: ScanCandidate[]
  message: string | null
  /* Why nothing came back, when nothing came back. The server measures it from the
     frame it already decoded; 'none' means the picture was fine and the card simply
     was not in it, which is more useful than inventing a fault. */
  reason?: 'light' | 'blur' | 'glare' | 'unknown' | 'none' | null
}

export const CONDITION_LABELS: Record<Condition, string> = {
  near_mint: 'Near Mint',
  lightly_played: 'Lightly Played',
  moderately_played: 'Moderately Played',
  heavily_played: 'Heavily Played',
  damaged: 'Abîmée',
}

/* Card colours as printed. Used for the filter chips and the dots on a card. */
export const COLOR_SWATCHES: Record<string, string> = {
  Red: '#d0021b',
  Green: '#1e9e5a',
  Blue: '#1f7ae0',
  Purple: '#8b4fc0',
  Black: '#2b2b2b',
  Yellow: '#e8c33a',
}

export interface UserProfile {
  id: number
  email: string
  display_name: string | null
  created_at: string | null
  /* Which edition this account browses by default. Server-side rather than local:
     PROJECT_CONTEXT.md section 2 rules out localStorage, and the choice has to
     survive a reload — the two printings of a card cannot be told apart by sight, so
     resetting to 'en' every time is simply wrong for a Japanese collection. */
  default_language: Language
  /* How many cards per row on the grids. A taste, not a viewport question. */
  grid_columns: number
  /* The one set the binder opens on. Both null or both set: a code alone cannot say
     which printing, since the catalogue holds each set in both editions. */
  goal_pack_code: string | null
  goal_language: Language | null
}

export type RegistrationMode = 'open' | 'invite' | 'closed'

export interface RegistrationPolicy {
  mode: RegistrationMode
  first_account: boolean
}

export interface AuthSession {
  access_token: string
  token_type: string
  expires_in: number
  /* Returned for a native client to place in Keychain/Keystore. The browser build
     ignores it and relies on the httpOnly cookie — putting it in localStorage would
     undo the XSS protection the cookie exists to provide. */
  refresh_token: string
  user: UserProfile
}
