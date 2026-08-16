import { describe, expect, it } from 'vitest'
import { byClosest } from './Packs'
import type { Pack } from '../lib/types'

/* L'écran Extensions répond à une seule question : quelle île viser ensuite. Trier par
   ratio décroissant y répond mal — il met en tête celles qui sont déjà finies, qui sont
   précisément celles qu'on ne vise plus. Ces tests fixent la règle. */

function pack(code: string, owned: number, total: number): Pack {
  return {
    pack_id: code,
    language: 'en',
    pack_code: code,
    pack_name: code,
    card_count: total,
    owned_count: owned,
  }
}

const codes = (list: Pack[]) => [...list].sort(byClosest).map((p) => p.pack_code)

describe('byClosest', () => {
  it('met la plus proche d’être finie en tête', () => {
    const list = [pack('OP-01', 10, 100), pack('OP-02', 90, 100), pack('OP-03', 50, 100)]
    expect(codes(list)).toEqual(['OP-02', 'OP-03', 'OP-01'])
  })

  it('fait couler les extensions terminées sous les inachevées', () => {
    /* Le cas qui motive tout : 100 % a le meilleur ratio et la plus mauvaise place. */
    const list = [pack('OP-01', 100, 100), pack('OP-02', 3, 100)]
    expect(codes(list)).toEqual(['OP-02', 'OP-01'])
  })

  it('compare des extensions de tailles différentes par leur avancement', () => {
    /* 8 sur 10 est plus proche du bout que 40 sur 100, même si 40 cartes > 8. */
    const list = [pack('OP-01', 40, 100), pack('ST-01', 8, 10)]
    expect(codes(list)).toEqual(['ST-01', 'OP-01'])
  })

  it('laisse les ex æquo dans l’ordre reçu', () => {
    /* Des dizaines d'extensions sont à 0 %. Sans la stabilité du tri, elles
       changeraient de place à chaque rendu. */
    const list = [pack('OP-03', 0, 100), pack('OP-01', 0, 100), pack('OP-02', 0, 100)]
    expect(codes(list)).toEqual(['OP-03', 'OP-01', 'OP-02'])
  })

  it('ne prend pas une extension vide pour une extension finie', () => {
    /* card_count à zéro : 0/0 ne doit ni diviser par zéro ni compter comme terminée. */
    const list = [pack('VIDE', 0, 0), pack('OP-01', 99, 100)]
    expect(codes(list)).toEqual(['OP-01', 'VIDE'])
  })

  it('classe une extension à une carte près devant une à moitié faite', () => {
    const list = [pack('OP-01', 50, 100), pack('OP-02', 99, 100)]
    expect(codes(list)).toEqual(['OP-02', 'OP-01'])
  })
})
