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
  image_url: string | null
  printings: string[]
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
  card: Card | null
}

export interface CollectionStats {
  distinct_cards: number
  total_quantity: number
  by_language: Record<string, number>
  by_rarity: Record<string, number>
  acquisition_total: number
}

export interface Health {
  status: string
  catalogue: Record<string, number>
  hashed_cards: number
  scan_enabled: boolean
  scan_threshold?: number
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
