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
import { Download, ArrowUpCircle, Gift } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { formatINR } from '@/lib/format'
import { api, apiEnabled } from '@/services/http/client'
import { AppError } from '@/services/errors'
import { toast } from '@/store/toast'
import { createOrder, downloadInvoice, fetchQuote, payWithRazorpay, verifyPayment, type Order, type PaidProof, type PaymentRow, type PlansView, type PlanView, type UpgradeQuote } from './checkout'
import { longDate, rupees } from './format'
import { useBusinesses } from '@/businesses/store'
import { cardsFor, threeYearSavingPercent } from './pricing'
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
  const testPricing = plans?.testPricing
  const { data: history, reload: reloadHistory } = useAsync(() => api<{ data: PaymentRow[] }>('/billing/payments'))
  const [busy, setBusy] = useState<string>()
  const [test, setTest] = useState<Order>()
  const [pending, setPending] = useState<string>()
  const partial = lic?.status === 'ACTIVE' && (lic.platform === 'MOBILE' || lic.platform === 'DESKTOP') && lic.isOwner !== false
  // what upgrading costs for the days left; only asked when the plan running is a mobile-only or computer-only one
  const { data: quote, reload: reloadQuote } = useAsync(() => (partial ? fetchQuote().catch(() => null) : Promise.resolve(null)), [partial, lic?.planId])
  const [upgrading, setUpgrading] = useState(false)
  const [asUpgrade, setAsUpgrade] = useState(false)
  const businesses = useBusinesses((s) => s.list)
  const [years, setYears] = useState<1 | 3>(1)
  // referral credits pay a new plan or a renewal (not an upgrade); on by default when there are any
  const [useCredits, setUseCredits] = useState(true)

  useEffect(() => { void useLicenseStore.getState().refresh() }, [])

  const confirm = useCallback(async (proof: PaidProof) => {
    try {
      await verifyPayment(proof)
      await useLicenseStore.getState().refresh()
      reloadHistory(); reloadQuote(); reload()
      setPending(undefined)
      const end = useLicenseStore.getState().license?.endsAt
      // TEMPORARY test pricing: say plainly that this was the test payment
      if (testPricing) toast.success(t('pay.testSuccess', { amount: formatINR(testPricing.price), date: end ? longDate(end) : '' }))
      else toast.success(asUpgrade ? t('upgrade.success') : t('pay.success', { date: end ? longDate(end) : '' }))
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
  }, [reloadHistory, reloadQuote, reload, asUpgrade, t, testPricing])

  const buy = async (plan: PlanView) => {
    if (!user) return
    setBusy(plan.id)
    setAsUpgrade(false)
    try {
      const order = await createOrder(plan.id, false, useCredits && (plans?.credits?.available ?? 0) > 0)
      if (order.free) {
        // the credits paid for everything: the plan is already added, there is no payment window
        await useLicenseStore.getState().refresh()
        reloadHistory(); reloadQuote(); reload()
        const end = useLicenseStore.getState().license?.endsAt
        toast.success(t('pay.paidWithCredits', { date: end ? longDate(end) : '' }))
        return
      }
      if (order.provider === 'test') { setTest(order); return }
      const proof = await payWithRazorpay(order, { name: user.name, email: user.email }, `${t(`plan.name.${plan.id}`)} · ${t('plan.bothDevices')}`)
      if (proof) await confirm(proof)
      else toast.info(t('pay.failed'))
    } catch (e) {
      toast.error(e instanceof AppError && e.key === 'serverMessage' && !e.params.message ? t('pay.scriptFailed') : errorText(t, e))
    } finally { setBusy(undefined) }
  }

  const upgrade = async (q: UpgradeQuote) => {
    if (!user) return
    setUpgrading(true)
    setAsUpgrade(true)
    try {
      const order = await createOrder(q.toPlanId, true)
      if (order.provider === 'test') { setTest(order); return }
      const proof = await payWithRazorpay(order, { name: user.name, email: user.email }, t('upgrade.title'))
      if (proof) await confirm(proof)
      else toast.info(t('pay.failed'))
    } catch (e) {
      toast.error(e instanceof AppError && e.key === 'serverMessage' && !e.params.message ? t('pay.scriptFailed') : errorText(t, e))
    } finally { setUpgrading(false) }
  }

  if (lic?.isOwner === false) {
    // The plan belongs to the owner: staff only see whose it is, never prices or payments.
    return <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6"><h1 className="text-xl font-medium">{t('staff.title')}</h1><p className="mt-2 text-ink-600">{t('staff.body', { owner: lic.ownerName ?? '' })}</p></div>
  }

  if (error && !plans) return <LoadFailed error={error} onRetry={reload} />
  if (!plans) return <div className="p-6 text-ink-400">…</div>

  const maxOff = Math.max(0, ...plans.plans.map((p) => p.discountPercent))
  const cards = cardsFor(plans.plans, years)
  const canPay = plans.paymentsEnabled && online
  const creditsAvailable = plans.credits?.available ?? 0
  const creditsOn = useCredits && creditsAvailable > 0

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      {testPricing && (
        <div role="status" data-testid="test-pricing" className="rounded-xl border-2 border-warn bg-warn-soft px-5 py-4 text-warn">
          <p className="font-medium">{t('pay.testPricingTitle', { amount: formatINR(testPricing.price) })}</p>
          <p className="mt-1 text-sm">{t('pay.testPricingBody')}</p>
        </div>
      )}
      <CurrentLicense plans={plans} />
      <ReferBanner credits={creditsAvailable} />
      {quote && <UpgradeCard quote={quote} busy={upgrading} disabled={!canPay || !!busy || upgrading} onUpgrade={() => void upgrade(quote)} />}

      {/* Early Bird banner */}
      {plans.earlyBird.active && (
        <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-primary-soft to-section px-6 py-5 text-heading shadow-card">
          <Sparkles size={120} className="pointer-events-none absolute -right-4 -top-6 opacity-10" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-surface/80 px-3 py-1 text-sm font-medium uppercase tracking-wide text-primary">{t('offer.title')}</span>
            {maxOff > 0 && <span className="text-2xl font-medium">{t('offer.upTo', { percent: maxOff })}</span>}
          </div>
          <p className="mt-2 max-w-2xl text-ink-600">{t('offer.body')}</p>
          {plans.taxInclusive && <p className="mt-1 text-sm text-ink-600">{t('offer.taxes')}</p>}
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
      <TermToggle years={years} onChange={setYears} saves={threeYearSavingPercent(plans.plans, 'BOTH')} />
      {creditsAvailable > 0 && <CreditsToggle available={creditsAvailable} on={useCredits} onChange={setUseCredits} />}
      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        {cards.map((p) => <PlanCard key={p.id} plan={p} plans={plans} credits={creditsOn} active={lic?.status === 'ACTIVE'} busy={busy === p.id} disabled={!canPay || !!busy} onBuy={() => void buy(p)} />)}
      </div>

      {/* Highlights */}
      <section>
        <h2 className="mb-4 text-xl font-medium">{t('highlights.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ key, icon: Icon }) => (
            <div key={key} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={18} /></div>
              <div className="font-medium">{t(`highlights.${key}.title`)}</div>
              <p className="mt-1 text-sm text-ink-600">{t(`highlights.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <Compare plans={plans} years={years} />

      {/* History */}
      <section>
        <h2 className="mb-3 text-xl font-medium">{t('history.title')}</h2>
        {history && history.data.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] text-base">
              <thead><tr className="h-9 border-b border-line bg-sunken text-left text-sm text-ink-600"><th className="px-3 font-medium">{t('history.date')}</th><th className="px-3 font-medium">{t('history.plan')}</th><th className="px-3 text-right font-medium">{t('history.amount')}</th><th className="px-3 font-medium">{t('history.validity')}</th><th className="px-3 font-medium">{t('history.reference')}</th><th className="px-3 font-medium">{t('history.business')}</th><th className="px-3 font-medium">{t('history.invoice')}</th></tr></thead>
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id} className="h-9 border-b border-line last:border-b-0">
                    <td className="px-3">{longDate(h.paidAt)}</td><td className="px-3">{t(`planName.${h.planId}`, { defaultValue: h.planId })}{h.kind === 'UPGRADE' && <span className="ml-2 rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">{t('history.upgrade')}</span>}</td>
                    <td className="px-3 text-right font-medium">{(h.creditApplied ?? 0) > 0 ? formatINR(h.amount) : rupees(h.amount)}{(h.creditApplied ?? 0) > 0 && <div className="text-xs font-normal text-ok">{t('history.credits', { amount: formatINR(h.creditApplied!) })}</div>}</td><td className="px-3 text-ink-600">{longDate(h.licenseFrom)} → {longDate(h.licenseTo)}</td>
                    <td className="px-3 font-mono text-sm text-ink-600">{h.reference}</td>
                    <td className="px-3 text-ink-600">{businesses.find((b) => b.id === h.businessId)?.name ?? '–'}</td>
                    <td className="px-3">{h.hasInvoice && h.invoiceNumber ? <InvoiceButton id={h.id} number={h.invoiceNumber} /> : <span className="text-ink-400">–</span>}</td>
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
          footer={<><Button onClick={() => setTest(undefined)}>{t('pay.cancel')}</Button><Button variant="primary" onClick={() => { const o = test; setTest(undefined); if (o.testPayment) void confirm({ orderId: o.orderId, ...o.testPayment }) }}>{t('pay.testPay', { amount: test.amount % 100 === 0 ? rupees(test.amount) : formatINR(test.amount) })}</Button></>}>
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
          <h1 className="text-xl font-medium">
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
          {lic.platformBlocked && (
            // this plan is for the phone app only: say plainly what it covers; the upgrade card below sells the rest
            <p role="note" className="mt-3 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              {t('current.platformBlocked', { plan: t(`planName.${lic.planId}`, { defaultValue: '' }), covers: t('current.platformCovers.MOBILE'), blocked: t('current.platformBlockedOn.MOBILE'), date: longDate(lic.endsAt) })}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

/** "Use my credits": ticked by default when the person has some. */
function CreditsToggle({ available, on, onChange }: { available: number; on: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation('license')
  return (
    <label className="mx-auto flex max-w-xl cursor-pointer items-start gap-3 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--ok))]" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 font-medium">{t('credits.title')}<span className="text-ok">{t('credits.available', { amount: formatINR(available) })}</span></span>
        <span className="block text-sm text-ink-600">{t('credits.note')}</span>
      </span>
    </label>
  )
}

/** A nudge for someone with a running plan: they can earn by telling other shopkeepers. */
function ReferBanner({ credits }: { credits: number }) {
  const { t } = useTranslation('license')
  const lic = useLicense()
  if (lic?.status !== 'ACTIVE') return null
  return (
    <Link to="/earn" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary-soft px-5 py-3 hover:border-primary/50">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white"><Gift size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{t('refer.title', { percent: 10 })}</span>
        <span className="block text-sm text-ink-600">{credits > 0 ? t('refer.bodyCredits', { amount: formatINR(credits) }) : t('refer.body')}</span>
      </span>
      <span className="text-sm font-medium text-primary">{t('refer.cta')} →</span>
    </Link>
  )
}

function InvoiceButton({ id, number }: { id: string; number: string }) {
  const { t } = useTranslation('license')
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} aria-label={`${t('history.download')} ${number}`}
      onClick={() => { setBusy(true); downloadInvoice(id, number).catch(() => toast.error(t('history.invoiceFailed'))).finally(() => setBusy(false)) }}
      className="inline-flex h-7 items-center gap-1.5 rounded border border-line px-2 text-sm text-primary hover:bg-primary-soft disabled:opacity-50">
      <Download size={14} /> <span className="font-mono">{number}</span>
    </button>
  )
}

/** The plan running covers only one kind of device: pay the difference for the days left and get the other one too. */
function UpgradeCard({ quote, busy, disabled, onUpgrade }: { quote: UpgradeQuote; busy: boolean; disabled: boolean; onUpgrade: () => void }) {
  const { t } = useTranslation('license')
  return (
    <section aria-label={t('upgrade.title')} className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-surface p-5 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><ArrowUpCircle size={22} /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-medium">{t('upgrade.title')}</h2>
        <p className="text-ink-600">{t('upgrade.body', { days: quote.remainingDays, date: longDate(quote.endsAt) })}</p>
        <p className="mt-1 text-sm text-ink-600">{t('upgrade.maths', { price: rupees(quote.price), credit: rupees(quote.credit) })}</p>
      </div>
      <Button variant="primary" className="h-9 text-base" disabled={disabled} onClick={onUpgrade}>{busy ? t('pay.opening') : t('upgrade.pay', { amount: rupees(quote.amount) })}</Button>
    </section>
  )
}

function TermToggle({ years, onChange, saves }: { years: 1 | 3; onChange: (y: 1 | 3) => void; saves: number }) {
  const { t } = useTranslation('license')
  return (
    <div className="flex justify-center">
      <div role="radiogroup" aria-label={t('term.label')} className="inline-flex rounded-lg border border-line bg-surface p-1">
        {([1, 3] as const).map((y) => (
          <button key={y} type="button" role="radio" aria-checked={years === y} onClick={() => onChange(y)}
            className={`h-9 rounded-md px-5 text-base font-medium ${years === y ? 'bg-primary text-white' : 'text-ink-600 hover:bg-sunken'}`}>
            {t(`term.${y}`)}{y === 3 && saves > 0 && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${years === y ? 'bg-white/20' : 'bg-ok-soft text-ok'}`}>{t('term.save', { percent: saves })}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function PlanCard({ plan, plans, credits, active, busy, disabled, onBuy }: { plan: PlanView; plans: PlansView; credits: boolean; active: boolean; busy: boolean; disabled: boolean; onBuy: () => void }) {
  const { t } = useTranslation('license')
  const best = plan.highlight === 'BEST_VALUE'
  const name = t(`plan.name.${plan.id}`)
  const credit = credits ? plan.creditApplied ?? 0 : 0
  const payNow = credits ? plan.payNow ?? plan.price : plan.price
  return (
    <article className={`relative flex min-w-0 flex-col rounded-xl border bg-surface p-6 shadow-card ${best ? 'border-primary ring-1 ring-primary/20' : 'border-line'}`}>
      {best && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-sm font-medium text-white">{t('plan.bestValue')}</span>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-medium">{t(`platform.${plan.platform}.title`)}</h2>
          <p className="text-sm text-ink-600">{t(`platform.${plan.platform}.sub`)}</p>
        </div>
        {plan.discountPercent > 0 && <span className="shrink-0 rounded-md bg-primary-soft px-2 py-1 text-sm font-medium text-primary">{t('plan.off', { percent: plan.discountPercent })}</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-3">
        <span className="text-4xl font-normal tracking-tight text-heading">{rupees(plan.price)}</span>
        {plan.listPrice && <span className="text-lg text-ink-400 line-through" aria-label={`${t('plan.was')} ${rupees(plan.listPrice)}`}>{rupees(plan.listPrice)}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-600">{plan.years > 1 ? `${t('plan.perYear', { price: rupees(plan.perYear) })} · ` : ''}{t('plan.perMonth', { price: rupees(plan.perMonth) })}</p>
      {credit > 0 && (
        <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-sm">
          <div className="flex justify-between text-ink-600"><span>{t('credits.discount')}</span><span className="font-medium text-ok">− {formatINR(credit)}</span></div>
          <div className="mt-0.5 flex justify-between font-medium"><span>{t('credits.payNow')}</span><span>{formatINR(payNow)}</span></div>
        </div>
      )}
      {plan.savesVsYearly > 0 && <p className="mt-2 text-sm font-medium text-ok">{t('plan.saves', { amount: rupees(plan.savesVsYearly), years: plan.years })}</p>}

      <ul className="mt-5 flex-1 space-y-2" aria-label={t('plan.includes')}>
        <li className="flex items-start gap-2 font-medium"><Check size={16} className="mt-1 shrink-0 text-ok" />{t('plan.businessesUpTo', { n: plans.features.find((f) => f.key === 'businesses')?.plans[plan.id] ?? 10 })}</li>
        {PLAN_BULLETS.filter((k) => k !== 'mobileAndWeb').map((k) => <li key={k} className="flex items-start gap-2"><Check size={16} className="mt-1 shrink-0 text-ok" />{t(`compare.rows.${k}`)}</li>)}
        <li className="flex items-start gap-2 text-ink-600"><Check size={16} className="mt-1 shrink-0 text-ok" />{t(`platform.${plan.platform}.where`)}</li>
      </ul>

      <Button variant={best ? 'primary' : 'secondary'} className="mt-6 h-auto min-h-9 w-full justify-center whitespace-normal py-2 text-base" disabled={disabled} onClick={onBuy}>
        {busy ? t('pay.opening') : credit > 0 && payNow === 0 ? t('plan.renewWithCredits') : active ? t('plan.extend', { plan: name }) : t('plan.buy', { plan: name })}
      </Button>
      {!busy && !disabled && payNow > 0 && <p className="mt-2 text-center text-xs text-ink-400">{t('plan.pay', { amount: credit > 0 ? formatINR(payNow) : rupees(plan.price) })}</p>}
      {plans.taxInclusive && <p className="mt-1 text-center text-xs text-ink-400">{t('offer.taxes')}</p>}
    </article>
  )
}

function Compare({ plans, years }: { plans: PlansView; years: number }) {
  const { t } = useTranslation('license')
  const cell = (v: boolean | string, key: string, col: string) => {
    if (key === 'duration' && typeof v === 'string') return <span className="font-medium">{col === 'trial' ? t('compare.days', { count: Number(v) }) : t('compare.years', { count: Number(v) })}</span>
    if (v === true) return <Check size={18} className="mx-auto text-ok" aria-label={t('compare.yes')} />
    if (v === false) return <Minus size={18} className="mx-auto text-ink-400" aria-label={t('compare.no')} />
    return <span>{v}</span>
  }
  const head = cardsFor(plans.plans, years).map((p) => ({ id: p.id, label: t(`platform.${p.platform}.title`), best: p.highlight === 'BEST_VALUE' }))
  return (
    <section>
      <h2 className="mb-3 text-xl font-medium">{t('compare.title')}</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-base">
          <thead>
            <tr className="h-10 border-b border-line bg-sunken text-center text-sm">
              <th className="px-4 text-left font-medium text-ink-600">{t('compare.feature')}</th>
              <th className="px-3 font-medium">{t('compare.trial')}</th>
              {head.map((h) => <th key={h.id} className={`px-3 font-medium ${h.best ? 'bg-primary-soft text-primary' : ''}`}>{h.label}</th>)}
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
