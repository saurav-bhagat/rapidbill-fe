import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Check, CloudOff, Crown, Headset, Languages, Minus, Phone, RefreshCw, Rocket, ShieldCheck, Smartphone, Sparkles, WifiOff, Zap, FileText, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { errorText } from '@/lib/errors'
import { SUPPORT_PHONE_DISPLAY, supportTel, supportWhatsApp } from '@/lib/support'
import { useAsync } from '@/lib/useAsync'
import { useSync } from '@/offline/state'
import { Navigate } from 'react-router-dom'
import { api, apiEnabled } from '@/services/http/client'
import { AppError } from '@/services/errors'
import { toast } from '@/store/toast'
import { createOrder, payWithRazorpay, verifyPayment, type Order, type PaidProof, type PaymentRow, type PlansView, type PlanView } from './checkout'
import { longDate, rupees } from './format'
import { useLicense, useLicenseStore } from './store'

const HIGHLIGHTS: { key: string; icon: LucideIcon }[] = [
  { key: 'offline', icon: WifiOff }, { key: 'devices', icon: Smartphone }, { key: 'support', icon: Headset }, { key: 'updates', icon: Rocket },
  { key: 'gst', icon: FileText }, { key: 'language', icon: Languages }, { key: 'safe', icon: ShieldCheck }, { key: 'fast', icon: Zap },
]
const PLAN_BULLETS = ['offlineBilling', 'mobileAndWeb', 'support', 'updates', 'gstInvoices']

/** Plans only exist for an account; in browser-only mode there is nothing to buy. */
export function LicensePage() {
  return apiEnabled ? <LicenseContent /> : <Navigate to="/" replace />
}

function LicenseContent() {
  const { t } = useTranslation('license')
  const lic = useLicense()
  const user = useAuth((s) => s.user)
  const online = useSync((s) => s.online)
  const { data: plans, error, reload } = useAsync(() => api<PlansView>('/billing/plans'))
  const { data: history, reload: reloadHistory } = useAsync(() => api<{ data: PaymentRow[] }>('/billing/payments'))
  const [busy, setBusy] = useState<string>()
  const [test, setTest] = useState<Order>()
  const [pending, setPending] = useState<string>()

  useEffect(() => { void useLicenseStore.getState().refresh() }, [])

  const confirm = useCallback(async (proof: PaidProof) => {
    try {
      await verifyPayment(proof)
      await useLicenseStore.getState().refresh()
      reloadHistory()
      setPending(undefined)
      const end = useLicenseStore.getState().license?.endsAt
      toast.success(t('pay.success', { date: end ? longDate(end) : '' }))
    } catch (e) {
      // The money may have moved even though we could not confirm it here: say so, and keep checking in the background.
      if (e instanceof AppError && e.key === 'paymentNotConfirmed') { toast.error(errorText(t, e)); return }
      setPending(proof.paymentId)
      toast.warning(t('pay.pending', { ref: proof.paymentId }))
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 10_000))
        await useLicenseStore.getState().refresh()
        if (useLicenseStore.getState().license?.status === 'ACTIVE') { reloadHistory(); setPending(undefined); return }
      }
    }
  }, [reloadHistory, t])

  const buy = async (plan: PlanView) => {
    if (!user) return
    setBusy(plan.id)
    try {
      const order = await createOrder(plan.id)
      if (order.provider === 'test') { setTest(order); return }
      const proof = await payWithRazorpay(order, { name: user.name, email: user.email }, `${t(`plan.name.${plan.id}`)} · ${t('plan.bothDevices')}`)
      if (proof) await confirm(proof)
      else toast.info(t('pay.failed'))
    } catch (e) {
      toast.error(e instanceof AppError && e.key === 'serverMessage' && !e.params.message ? t('pay.scriptFailed') : errorText(t, e))
    } finally { setBusy(undefined) }
  }

  if (error && !plans) return <LoadFailed error={error} onRetry={reload} />
  if (!plans) return <div className="p-6 text-ink-400">…</div>

  const maxOff = Math.max(0, ...plans.plans.map((p) => p.discountPercent))
  const canPay = plans.paymentsEnabled && online

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <CurrentLicense plans={plans} />

      {/* Early Bird banner */}
      {plans.earlyBird.active && (
        <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-5 text-white shadow-sm">
          <Sparkles size={120} className="pointer-events-none absolute -right-4 -top-6 opacity-10" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold uppercase tracking-wide">{t('offer.title')}</span>
            {maxOff > 0 && <span className="text-2xl font-bold">{t('offer.upTo', { percent: maxOff })}</span>}
          </div>
          <p className="mt-2 max-w-2xl text-white/90">{t('offer.body')}</p>
          {plans.taxInclusive && <p className="mt-1 text-sm text-white/70">{t('offer.taxes')}</p>}
        </div>
      )}

      {!plans.paymentsEnabled && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded border border-warn/40 bg-warn-soft px-4 py-3 text-warn">
          <Phone size={16} /> <span className="flex-1">{t('pay.unavailable')}</span>
          <a href={supportTel} className="font-mono font-medium underline">{plans.support.phoneDisplay}</a>
        </div>
      )}
      {plans.paymentsEnabled && !online && (
        <div role="status" className="flex items-center gap-2 rounded border border-line bg-sunken px-4 py-3 text-ink-600"><CloudOff size={16} /> {t('pay.needInternet')}</div>
      )}
      {pending && <div role="alert" className="flex items-center gap-2 rounded border border-warn/40 bg-warn-soft px-4 py-3 text-warn"><RefreshCw size={16} className="animate-spin" /> {t('pay.pending', { ref: pending })}</div>}

      {/* Plan cards */}
      <div className="grid items-stretch gap-5 md:grid-cols-2">
        {plans.plans.map((p) => <PlanCard key={p.id} plan={p} plans={plans} active={lic?.status === 'ACTIVE'} busy={busy === p.id} disabled={!canPay || !!busy} onBuy={() => void buy(p)} />)}
      </div>

      {/* Highlights */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">{t('highlights.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ key, icon: Icon }) => (
            <div key={key} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={18} /></div>
              <div className="font-semibold">{t(`highlights.${key}.title`)}</div>
              <p className="mt-1 text-sm text-ink-600">{t(`highlights.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <Compare plans={plans} />

      {/* History */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('history.title')}</h2>
        {history && history.data.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-base">
              <thead><tr className="h-9 border-b border-line text-left text-sm text-ink-600"><th className="px-3 font-medium">{t('history.date')}</th><th className="px-3 font-medium">{t('history.plan')}</th><th className="px-3 text-right font-medium">{t('history.amount')}</th><th className="px-3 font-medium">{t('history.validity')}</th><th className="px-3 font-medium">{t('history.reference')}</th></tr></thead>
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id} className="h-9 border-b border-line last:border-b-0">
                    <td className="px-3">{longDate(h.paidAt)}</td><td className="px-3">{t(`plan.name.${h.planId}`, { defaultValue: h.planId })}</td>
                    <td className="px-3 text-right font-medium">{rupees(h.amount)}</td><td className="px-3 text-ink-600">{longDate(h.licenseFrom)} → {longDate(h.licenseTo)}</td>
                    <td className="px-3 font-mono text-sm text-ink-600">{h.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-ink-400">{t('history.none')}</p>}
      </section>

      <footer className="rounded-lg border border-line bg-surface p-4 text-center text-ink-600">
        <p>{t('footer.help')}: <a href={supportTel} className="font-mono font-medium text-primary underline">{SUPPORT_PHONE_DISPLAY}</a> · <a href={supportWhatsApp} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">WhatsApp</a></p>
        <p className="mt-1 text-sm">{t('footer.note')}</p>
      </footer>

      {test && (
        <Modal open onClose={() => setTest(undefined)} title={t('pay.testTitle')} width="420px"
          footer={<><Button onClick={() => setTest(undefined)}>{t('pay.cancel')}</Button><Button variant="primary" onClick={() => { const o = test; setTest(undefined); if (o.testPayment) void confirm({ orderId: o.orderId, ...o.testPayment }) }}>{t('pay.testPay', { amount: rupees(test.amount) })}</Button></>}>
          <p className="text-ink-600">{t('pay.testBody')}</p>
        </Modal>
      )}
    </div>
  )
}

function CurrentLicense({ plans }: { plans: PlansView }) {
  const { t } = useTranslation('license')
  const lic = useLicense()
  if (!lic) return null
  const ended = lic.status === 'EXPIRED'
  const tone = ended ? 'border-danger/40 bg-danger-soft' : lic.status === 'ACTIVE' ? 'border-ok/30 bg-ok-soft' : 'border-primary/30 bg-primary-soft'
  const Icon = ended ? WifiOff : lic.status === 'ACTIVE' ? BadgeCheck : Crown
  return (
    <section className={`rounded-xl border p-5 ${tone}`} aria-label={t('current.title')}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-11 shrink-0 place-items-center rounded-full bg-surface"><Icon size={22} className={ended ? 'text-danger' : lic.status === 'ACTIVE' ? 'text-ok' : 'text-primary'} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">
            {lic.status === 'ACTIVE' ? t(`planName.${lic.planId}`, { defaultValue: t('card.active') }) : ended ? t('current.expiredTitle') : t('current.trialTitle')}
          </h1>
          {lic.status === 'TRIAL' && <p className="mt-1 text-ink-600">{t('current.trialBody', { count: lic.daysLeft, total: plans.trialDays })}</p>}
          {ended && <p className="mt-1 text-ink-600">{t(lic.licenseEndsAt ? 'current.expiredPaid' : 'current.expiredTrial', { date: longDate(lic.endsAt) })}</p>}
          {lic.status === 'ACTIVE' && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <div><dt className="text-sm text-ink-600">{t('current.plan')}</dt><dd className="font-medium">{t(`planName.${lic.planId}`, { defaultValue: '' })}</dd></div>
              <div><dt className="text-sm text-ink-600">{t('current.validUntil')}</dt><dd className="font-medium">{longDate(lic.endsAt)}</dd></div>
              <div><dt className="text-sm text-ink-600">{t('current.daysLeft')}</dt><dd className="font-medium">{lic.daysLeft}</dd></div>
            </dl>
          )}
          {lic.status === 'ACTIVE' && <p className="mt-3 text-sm text-ink-600">{t('current.extendNote')}</p>}
        </div>
      </div>
    </section>
  )
}

function PlanCard({ plan, plans, active, busy, disabled, onBuy }: { plan: PlanView; plans: PlansView; active: boolean; busy: boolean; disabled: boolean; onBuy: () => void }) {
  const { t } = useTranslation('license')
  const best = plan.highlight === 'BEST_VALUE'
  const name = t(`plan.name.${plan.id}`)
  return (
    <article className={`relative flex flex-col rounded-xl border bg-surface p-6 ${best ? 'border-primary shadow-float ring-2 ring-primary' : 'border-line'}`}>
      {best && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-sm font-semibold text-white">{t('plan.bestValue')}</span>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{name}</h2>
          <p className="text-sm text-ink-600">{t('plan.bothDevices')}</p>
        </div>
        {plan.discountPercent > 0 && <span className="rounded-md bg-danger px-2 py-1 text-sm font-bold text-white">{t('plan.off', { percent: plan.discountPercent })}</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-3">
        <span className="text-4xl font-bold tracking-tight">{rupees(plan.price)}</span>
        {plan.listPrice && <span className="text-lg text-ink-400 line-through" aria-label={`${t('plan.was')} ${rupees(plan.listPrice)}`}>{rupees(plan.listPrice)}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-600">{plan.years > 1 ? `${t('plan.perYear', { price: rupees(plan.perYear) })} · ` : ''}{t('plan.perMonth', { price: rupees(plan.perMonth) })}</p>
      {plan.savesVsYearly > 0 && <p className="mt-2 text-sm font-medium text-ok">{t('plan.saves', { amount: rupees(plan.savesVsYearly), years: plan.years })}</p>}

      <ul className="mt-5 flex-1 space-y-2" aria-label={t('plan.includes')}>
        {PLAN_BULLETS.map((k) => <li key={k} className="flex items-start gap-2"><Check size={16} className="mt-1 shrink-0 text-ok" />{t(`compare.rows.${k}`)}</li>)}
      </ul>

      <Button variant={best ? 'primary' : 'secondary'} className="mt-6 h-9 w-full justify-center text-base" disabled={disabled} onClick={onBuy}>
        {busy ? t('pay.opening') : active ? t('plan.extend', { plan: name }) : t('plan.buy', { plan: name })}
      </Button>
      {!busy && !disabled && <p className="mt-2 text-center text-xs text-ink-400">{t('plan.pay', { amount: rupees(plan.price) })}</p>}
      {plans.taxInclusive && <p className="mt-1 text-center text-xs text-ink-400">{t('offer.taxes')}</p>}
    </article>
  )
}

function Compare({ plans }: { plans: PlansView }) {
  const { t } = useTranslation('license')
  const cell = (v: boolean | string, key: string, col: string) => {
    if (key === 'duration' && typeof v === 'string') return <span className="font-medium">{col === 'trial' ? t('compare.days', { count: Number(v) }) : t('compare.years', { count: Number(v) })}</span>
    if (v === true) return <Check size={18} className="mx-auto text-ok" aria-label={t('compare.yes')} />
    if (v === false) return <Minus size={18} className="mx-auto text-ink-400" aria-label={t('compare.no')} />
    return <span>{v}</span>
  }
  const head = plans.plans.map((p) => ({ id: p.id, label: t(`plan.name.${p.id}`), best: p.highlight === 'BEST_VALUE' }))
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{t('compare.title')}</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-base">
          <thead>
            <tr className="h-10 border-b border-line text-center text-sm">
              <th className="px-4 text-left font-medium text-ink-600">{t('compare.feature')}</th>
              <th className="px-3 font-semibold">{t('compare.trial')}</th>
              {head.map((h) => <th key={h.id} className={`px-3 font-semibold ${h.best ? 'bg-primary-soft text-primary' : ''}`}>{h.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {plans.features.map((f) => (
              <tr key={f.key} className="h-9 border-b border-line text-center last:border-b-0">
                <th scope="row" className="px-4 text-left font-normal">{t(`compare.rows.${f.key}`, { defaultValue: f.key })}</th>
                <td className="px-3">{cell(f.trial, f.key, 'trial')}</td>
                {head.map((h) => <td key={h.id} className={`px-3 ${h.best ? 'bg-primary-soft/50' : ''}`}>{cell(f.plans[h.id] ?? false, f.key, h.id)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
