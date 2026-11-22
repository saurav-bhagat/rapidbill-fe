/** Stock supports decimals (KG/LTR); round to 6dp to stop 0.1+0.2 drift (6 places keep 5 PCS = 0.416667 DOZ usable). */
export const roundQty = (n: number): number => Math.round(n * 1_000_000) / 1_000_000
