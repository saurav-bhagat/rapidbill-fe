export const formatVoucherNo = (prefix: string, year: number, seq: number): string =>
  `${prefix}-${year}-${String(seq).padStart(4, '0')}`

/** Next number in the series for prefix+year, given all existing voucher numbers. */
export function nextVoucherNo(existing: string[], prefix: string, year: number): string {
  const head = `${prefix}-${year}-`
  let max = 0
  for (const n of existing) {
    if (!n.startsWith(head)) continue
    const seq = parseInt(n.slice(head.length), 10)
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return formatVoucherNo(prefix, year, max + 1)
}
