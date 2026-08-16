import { describe, expect, it } from 'vitest'
import { computeGeometry } from './PriceChart'
import type { PricePoint } from '../lib/types'

/* La géométrie du graphique de prix est le seul endroit du composant où une erreur
   se verrait sans se voir — une courbe légèrement fausse ne casse rien à l'écran,
   elle raconte juste le mauvais historique. Ces tests fixent ce qu'un coup d'œil
   dans le navigateur a déjà vérifié une fois, pour que ça ne se reproduise pas
   qu'une seule fois. */

const point = (captured_at: string, price: number): PricePoint => ({ captured_at, price })

describe('computeGeometry', () => {
  it('ne trace rien avec moins de deux points', () => {
    expect(computeGeometry([])).toBeNull()
    expect(computeGeometry([point('2026-08-01', 5)])).toBeNull()
  })

  it('espace les points par le temps écoulé, pas par leur rang', () => {
    /* Trois points à 0, 1 et 10 jours : le troisième doit être bien plus loin du
       deuxième que le deuxième ne l'est du premier, exactement dans le rapport 9:1
       que donnent les dates -- un espacement par index les aurait mis à distance
       égale et aurait aplati l'écart réel. */
    const geometry = computeGeometry([
      point('2026-08-01', 10),
      point('2026-08-02', 10),
      point('2026-08-11', 10),
    ])!
    const [x0, x1, x2] = geometry.xy.map((p) => p.x)
    const gapA = x1 - x0
    const gapB = x2 - x1
    expect(gapB / gapA).toBeCloseTo(9, 1)
  })

  it('ne divise jamais par zéro quand le prix ne bouge pas', () => {
    const geometry = computeGeometry([
      point('2026-08-01', 5),
      point('2026-08-05', 5),
      point('2026-08-10', 5),
    ])!
    expect(geometry.xy.every((p) => Number.isFinite(p.y))).toBe(true)
    expect(geometry.min).toBe(5)
    expect(geometry.max).toBe(5)
  })

  it('place le prix le plus bas en bas du graphique et le plus haut en haut', () => {
    /* Le repère SVG grandit vers le bas : le prix le plus haut doit donc avoir le
       plus petit y, pas le plus grand -- une erreur de signe ici afficherait la
       courbe à l'envers sans qu'aucune autre vérification ne le remarque. */
    const geometry = computeGeometry([
      point('2026-08-01', 2),
      point('2026-08-05', 20),
      point('2026-08-10', 8),
    ])!
    const [yLow, yHigh, yMid] = geometry.xy.map((p) => p.y)
    expect(yHigh).toBeLessThan(yMid)
    expect(yMid).toBeLessThan(yLow)
  })

  it('garde le premier et le dernier point dans la largeur du graphique', () => {
    const geometry = computeGeometry([
      point('2026-08-01', 3),
      point('2026-08-15', 9),
    ])!
    const xs = geometry.xy.map((p) => p.x)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(320)
  })

  it('rapporte le vrai minimum et le vrai maximum, pas les bornes avec la marge', () => {
    /* La marge de 8 % élargit l'échelle du dessin mais ne doit jamais fuiter dans
       les chiffres affichés en euros au-dessus et en dessous du graphique. */
    const geometry = computeGeometry([
      point('2026-08-01', 4.5),
      point('2026-08-05', 11.2),
      point('2026-08-10', 7.0),
    ])!
    expect(geometry.min).toBe(4.5)
    expect(geometry.max).toBe(11.2)
  })
})
