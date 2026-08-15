import { describe, expect, it } from 'vitest'
import { EMPTY, appliedLabels, isFiltered, type FilterState } from './Filters'
import type { Language } from '../lib/types'

/* Which choices count as "a filter you set" and which are just the baseline. Getting
   this wrong is not cosmetic: a chip the clear button cannot remove makes the clear
   button look broken, which is exactly what happened when the account's own edition
   was listed as an active filter. */

function state(over: Partial<FilterState> = {}): FilterState {
  return { language: 'en', ...EMPTY, sort: 'code', columns: 2, ...over }
}

describe('appliedLabels', () => {
  it('ne compte pas l’édition du compte comme un filtre', () => {
    expect(appliedLabels(state({ language: 'en' }), 'en')).toEqual([])
    expect(isFiltered(state({ language: 'en' }), 'en')).toBe(false)
  })

  it('compte l’autre édition comme un filtre', () => {
    expect(appliedLabels(state({ language: 'jp' }), 'en')).toEqual(['JP'])
  })

  it('compte « les deux » comme un filtre quand le compte est sur une seule', () => {
    expect(appliedLabels(state({ language: null }), 'en')).toEqual(['Les deux'])
  })

  it('ne compte pas « les deux » là où c’est la base, comme sur les recherchées', () => {
    expect(appliedLabels(state({ language: null }), null)).toEqual([])
  })

  it('liste les raretés, les couleurs et la possession', () => {
    const labels = appliedLabels(
      state({ owned: true, colors: ['Red'], rarities: ['Rare'] }),
      'en',
    )
    expect(labels).toEqual(['Possédées', 'Red', 'Rare'])
  })

  it('distingue possédées de manquantes', () => {
    expect(appliedLabels(state({ owned: false }), 'en')).toEqual(['Manquantes'])
  })

  it('ne compte ni le tri ni le nombre de colonnes', () => {
    /* Ils changent l’ordre et la taille de la réponse, jamais quelles cartes y sont. */
    expect(appliedLabels(state({ sort: 'date', columns: 3 }), 'en')).toEqual([])
  })

  it('sans base fournie, une édition choisie reste un filtre', () => {
    const languages: Language[] = ['en', 'jp']
    for (const language of languages) {
      expect(appliedLabels(state({ language })).length).toBe(1)
    }
  })
})
