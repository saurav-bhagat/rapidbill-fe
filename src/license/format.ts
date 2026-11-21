import { format, parseISO } from 'date-fns'

/** ₹1,299 (paise in, no decimals: plan prices are whole rupees). */
export const rupees = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
export const longDate = (iso: string): string => format(parseISO(iso), 'dd MMM yyyy')
