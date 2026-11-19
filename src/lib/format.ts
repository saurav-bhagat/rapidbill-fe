import { format, parseISO } from 'date-fns'
import type { Paise } from './money'

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

/** 12345678 paise -> "1,23,456.78" (Indian grouping, no symbol). */
export const formatAmount = (paise: Paise): string => inr.format(paise / 100)

/** 12345678 paise -> "₹1,23,456.78" */
export const formatINR = (paise: Paise): string => `${paise < 0 ? '-' : ''}₹${inr.format(Math.abs(paise) / 100)}`

export const formatQty = (qty: number): string => qtyFmt.format(qty)

/** ISO yyyy-MM-dd -> DD-MM-YYYY */
export const formatDate = (iso: string): string => format(parseISO(iso), 'dd-MM-yyyy')

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd')
