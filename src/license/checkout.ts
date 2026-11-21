import { api } from '@/services/http/client'
import { AppError } from '@/services/errors'

export interface PlanView {
  id: string
  years: number
  price: number
  listPrice: number | null
  discountPercent: number
  perYear: number
  perMonth: number
  savesVsYearly: number
  highlight: 'BEST_VALUE' | null
}
export interface FeatureRow { key: string; trial: boolean | string; plans: Record<string, boolean | string> }
export interface PlansView {
  trialDays: number
  currency: 'INR'
  taxInclusive: boolean
  earlyBird: { active: boolean; label: string; endsOn: string | null }
  paymentsEnabled: boolean
  support: { phone: string; phoneDisplay: string }
  plans: PlanView[]
  features: FeatureRow[]
}
export interface PaymentRow { id: string; planId: string; amount: number; listPrice: number; paidAt: string; licenseFrom: string; licenseTo: string; reference: string }

export interface Order { orderId: string; provider: 'razorpay' | 'test'; keyId?: string; amount: number; currency: 'INR'; planId: string; testPayment?: { paymentId: string; signature: string } }
export interface PaidProof { orderId: string; paymentId: string; signature: string }

interface RazorpayResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
interface RazorpayCtor { new (o: Record<string, unknown>): { open(): void; on(ev: string, fn: () => void): void } }
declare global { interface Window { Razorpay?: RazorpayCtor } }

let loading: Promise<void> | null = null
/** Razorpay's own script, loaded only when someone is about to pay. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error('checkout script')) }
    document.head.appendChild(s)
  })
  return loading
}

export const createOrder = (planId: string) => api<Order>('/billing/orders', { method: 'POST', body: { planId }, timeoutMs: 20_000 })
export const verifyPayment = (proof: PaidProof) => api('/billing/verify', { method: 'POST', body: proof, timeoutMs: 20_000 })

/**
 * Open Razorpay's payment window for an order. Resolves with the proof of payment, or null if the person closed the window.
 * The proof is not trusted until the server checks it.
 */
export async function payWithRazorpay(order: Order, who: { name: string; email: string }, description: string): Promise<PaidProof | null> {
  try { await loadCheckout() } catch { throw new AppError('serverMessage', { message: '' }) }
  if (!window.Razorpay) throw new AppError('serverError')
  const Razorpay = window.Razorpay
  return new Promise((resolve) => {
    const rz = new Razorpay({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency, name: 'RapidBill', description,
      prefill: { name: who.name, email: who.email }, theme: { color: '#0f6b4f' },
      handler: (r: RazorpayResponse) => resolve({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    })
    rz.open()
  })
}
