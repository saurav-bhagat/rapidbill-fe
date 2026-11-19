/** Stock supports decimals (KG/LTR); round to 3dp to stop 0.1+0.2 drift. */
export const roundQty = (n: number): number => Math.round(n * 1000) / 1000
