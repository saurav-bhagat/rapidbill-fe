/** All money is stored as integer paise. Convert at the edges only. */
export type Paise = number

export const toPaise = (rupees: number): Paise => Math.round(rupees * 100)
export const toRupees = (paise: Paise): number => paise / 100

/** Parse user input like "1,250.50" or "₹ 99" into paise. Returns null if unparseable. */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '.' || cleaned === '-') return null
  return toPaise(parseFloat(cleaned))
}

/** Percentage of an amount, rounded to nearest paisa. */
export const pct = (amount: Paise, percent: number): Paise => Math.round((amount * percent) / 100)
