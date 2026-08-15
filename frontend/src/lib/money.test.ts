import { describe, expect, it } from 'vitest'
import { money } from './money'

/* Two figures sit side by side on the log book — what the collection is worth and what
   it cost — and a card sheet shows a third. They have to be formatted in one place or
   they drift into two different-looking euros. */
describe('money', () => {
  it('drops the cents when there are none', () => {
    expect(money(40)).toBe('40 €')
  })

  it('keeps both decimals when there are cents', () => {
    expect(money(12.5)).toBe('12,50 €')
  })

  it('uses the French decimal comma', () => {
    expect(money(0.15)).toBe('0,15 €')
  })

  it('groups the thousands the way a French reader expects', () => {
    // A narrow no-break space, not a plain one: that is what fr grouping emits.
    expect(money(11238.89).replace(/ | /g, ' ')).toBe('11 238,89 €')
  })

  it('does not round a price away', () => {
    expect(money(0.01)).toBe('0,01 €')
  })

  it('shows a free card as zero rather than as nothing', () => {
    expect(money(0)).toBe('0 €')
  })
})
