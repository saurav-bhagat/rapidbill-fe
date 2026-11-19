export const STATES: { code: string; name: string }[] = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra & Nagar Haveli and Daman & Diu'],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'],
  ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman & Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
].map(([code, name]) => ({ code, name }))

export const stateName = (code: string | null | undefined): string => STATES.find((s) => s.code === code)?.name ?? ''

const FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** GSTIN check digit (mod-36 over the first 14 characters). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(v / 36) + (v % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36]
}

import type { ErrorKey, ErrorParams } from '@/services/errors'

/** `error`/`warning` are English; `errorKey`/`warningKey` + `params` index the `errors` catalogue for translated display. */
export interface GstinResult { error?: string; warning?: string; errorKey?: ErrorKey; warningKey?: ErrorKey; params?: ErrorParams; stateCode?: string }

/**
 * Blocking: wrong shape or unknown state code. Non-blocking: checksum mismatch
 * (typos are likely, but we should not stop billing over it).
 */
export function checkGstin(raw: string): GstinResult {
  const g = raw.trim().toUpperCase()
  if (!g) return {}
  if (g.length !== 15 || !FORMAT.test(g)) return { error: 'GSTIN must be 15 characters, like 29ABCDE1234F1Z5', errorKey: 'gstinShape' }
  const stateCode = g.slice(0, 2)
  if (!STATES.some((s) => s.code === stateCode)) return { error: `Unknown state code ${stateCode}`, errorKey: 'gstinState', params: { code: stateCode } }
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) return { stateCode, warning: 'Check digit does not match. Double-check the number.', warningKey: 'gstinCheck' }
  return { stateCode }
}
