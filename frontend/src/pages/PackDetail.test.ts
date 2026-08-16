import { describe, expect, it } from 'vitest'
import { summarise } from './PackDetail'

/* Le bouton ajoute d'un geste tout ce qui manque à une extension. Ce qu'il en dit
   ensuite est la seule preuve que l'utilisateur en a : annoncer le nombre demandé au
   lieu du nombre réellement ajouté ferait passer un second appui pour une panne — il
   proclamerait 150 ajouts alors que la liste n'a pas bougé. */

describe('summarise', () => {
  it('annonce ce qui a été ajouté quand tout était nouveau', () => {
    expect(summarise({ missing: 3, added: 3, already_listed: 0 })).toBe(
      '3 cartes ajoutées aux recherchées.',
    )
  })

  it('accorde au singulier', () => {
    expect(summarise({ missing: 1, added: 1, already_listed: 0 })).toBe(
      '1 carte ajoutée aux recherchées.',
    )
  })

  it('distingue les ajoutées de celles qui y étaient déjà', () => {
    expect(summarise({ missing: 3, added: 2, already_listed: 1 })).toBe(
      '2 cartes ajoutées, 1 y était déjà.',
    )
    expect(summarise({ missing: 5, added: 2, already_listed: 3 })).toBe(
      '2 cartes ajoutées, 3 y étaient déjà.',
    )
  })

  it('ne prétend rien avoir fait quand tout y était déjà', () => {
    /* Le second appui. Sans ce cas, le bouton mentirait.  */
    expect(summarise({ missing: 3, added: 0, already_listed: 3 })).toBe(
      '3 cartes déjà dans tes recherchées.',
    )
  })

  it('le dit autrement quand il ne manque rien', () => {
    expect(summarise({ missing: 0, added: 0, already_listed: 0 })).toBe(
      'Rien ne manque dans cette extension.',
    )
  })
})
