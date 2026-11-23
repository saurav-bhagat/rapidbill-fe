import { api } from '@/services/http/client'

/** What `GET /referral` returns. Money is in paise. `code` and `link` are null unless the person has a running paid plan. */
export interface ReferralOverview {
  eligible: boolean
  code: string | null
  link: string | null
  percent: number
  balance: number
  onHold: number
  totals: { signedUp: number; paid: number; earned: number; spent: number }
}
export interface ReferralPayment { paymentId: string; planId: string; paidAt: string; cash: number; fee: number; reward: number; counted: boolean }
export interface ReferralPerson {
  id: string
  name: string
  businessName: string
  stateCode: string
  signedUpAt: string
  status: 'SIGNED_UP' | 'PAID'
  paymentsCount: number
  earned: number
  lastPaidAt: string | null
  payments: ReferralPayment[]
}
export interface HistoryRow { id: string; kind: 'EARN' | 'REVERSAL' | 'SPEND'; amount: number; createdAt: string; planId: string; friendName: string; businessName: string; note: string | null }
export type PeopleFilter = 'all' | 'paid' | 'unpaid'
export interface Page<T> { data: T[]; next: string | null }

export const fetchOverview = () => api<ReferralOverview>('/referral')
export const fetchPeople = (status: PeopleFilter, cursor?: string) => api<Page<ReferralPerson>>(`/referral/people?status=${status}&limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
export const fetchHistory = (cursor?: string) => api<Page<HistoryRow>>(`/referral/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
