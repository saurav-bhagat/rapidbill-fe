/**
 * Bill numbers run in a financial-year series (April to March), as GST expects: SI-2627-0001 is the first SI bill of 2026-27.
 * Same file in the backend (src/domain), the web app (src/lib) and the phone app (src/core): keep them identical.
 */

/** Indian financial year of a bill date (yyyy-MM-dd), as 4 digits: 2026-11-19 -> "2627", 2027-03-31 -> "2627", 2027-04-01 -> "2728". */
export function financialYearOf(dateISO: string): string {
  const y = Number(dateISO.slice(0, 4)), m = Number(dateISO.slice(5, 7))
  const start = m >= 4 ? y : y - 1
  return `${String(start % 100).padStart(2, '0')}${String((start + 1) % 100).padStart(2, '0')}`
}

export const formatVoucherNo = (prefix: string, fy: string, seq: number): string =>
  `${prefix}-${fy}-${String(seq).padStart(4, '0')}`

/** Next number in the series for prefix+financial year, given all existing voucher numbers. */
export function nextVoucherNo(existing: string[], prefix: string, fy: string): string {
  const head = `${prefix}-${fy}-`
  let max = 0
  for (const n of existing) {
    if (!n.startsWith(head)) continue
    const seq = parseInt(n.slice(head.length), 10)
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return formatVoucherNo(prefix, fy, max + 1)
}
