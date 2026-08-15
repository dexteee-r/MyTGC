/* Cents only when there are cents. A collection worth 40 € should not read 40,00 €
   beside a count of cards, and a card at 12,50 € must not round to 13. Shared so the
   card sheet and the log book cannot drift into two different-looking euros. */
export function money(amount: number): string {
  return `${amount.toLocaleString('fr', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`
}
