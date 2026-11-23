import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Gift, Link2, Lock, MessageCircle, Share2, Sparkles, Users, Wallet, BadgeCheck, Send } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { useBusinesses } from '@/businesses/store'
import { Button } from '@/components/ui/Button'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { formatINR } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useLicense } from '@/license/store'
import { apiEnabled } from '@/services/http/client'
import { toast } from '@/store/toast'
import { fetchOverview, type ReferralOverview } from './api'
import { EarnHistory, EarnPeople } from './EarnPeople'
import { canNativeShare, copyText, nativeShare, whatsappShareUrl } from './share'
import { readSeen, useEarn } from './store'
import { useCountUp } from './useCountUp'

export function EarnPage() {
  const role = useBusinesses((s) => s.list.find((b) => b.current)?.role)
  // Only the owner earns (the plan and its credits are the owner's). Staff, and browser-only mode, go back home.
  if (!apiEnabled || (role && role !== 'OWNER')) return <Navigate to="/" replace />
  return <EarnContent />
}

function EarnContent() {
  const { t } = useTranslation('earn')
  const { data, error, reload } = useAsync(fetchOverview)
  const lic = useLicense()
  if (error && !data) return <LoadFailed error={error} onRetry={reload} />
  if (!data) return <div className="p-6 text-ink-400" role="status">{t('title')}…</div>
  const hadPlan = !!lic?.licenseEndsAt
  return <Earn ov={data} hadPlan={hadPlan} />
}

function Earn({ ov, hadPlan }: { ov: ReferralOverview; hadPlan: boolean }) {
  const { t } = useTranslation('earn')
  const locked = !ov.eligible
  // what was earned since the person last looked (read once, then marked as seen so the sidebar dot goes away)
  const userId = useAuth((s) => s.user?.id)
  const news = useRef<number | null>(null)
  if (news.current === null) news.current = userId ? Math.max(0, ov.totals.earned - readSeen(userId)) : 0
  useEffect(() => { if (userId) useEarn.getState().markSeen(userId, ov.totals.earned) }, [userId, ov.totals.earned])
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="mt-1 text-ink-600">{t('sub', { percent: ov.percent })}</p>
      </header>

      {!locked && news.current > 0 && (
        <p role="status" className="rounded-2xl border border-ok/30 bg-ok-soft px-5 py-3 text-lg font-semibold text-ok">{t('newReward', { amount: formatINR(news.current) })}</p>
      )}
      {locked && <LockedBanner hadPlan={hadPlan} percent={ov.percent} />}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <CreditsCard ov={ov} />
        <CodeCard ov={ov} />
      </div>

      <div className={locked && !hadPlan ? 'opacity-60' : ''} aria-hidden={locked && !hadPlan ? true : undefined}>
        <Stats ov={ov} />
      </div>

      <HowItWorks percent={ov.percent} />

      <EarnPeople locked={locked && !hadPlan} percent={ov.percent} />
      {!locked || hadPlan ? <EarnHistory /> : null}
    </div>
  )
}

function LockedBanner({ hadPlan, percent }: { hadPlan: boolean; percent: number }) {
  const { t } = useTranslation('earn')
  const navigate = useNavigate()
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/25 bg-primary-soft px-5 py-4" role="status">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white"><Lock size={20} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold">{t(hadPlan ? 'locked.endedTitle' : 'locked.title')}</h3>
        <p className="text-ink-600">{hadPlan ? t('locked.endedBody') : t('locked.body', { percent })}</p>
      </div>
      <Button variant="primary" onClick={() => navigate('/license')}>{t(hadPlan ? 'locked.endedCta' : 'locked.cta')}</Button>
    </section>
  )
}

/** The big blue card: what the person has earned and can use. */
function CreditsCard({ ov }: { ov: ReferralOverview }) {
  const { t } = useTranslation('earn')
  const navigate = useNavigate()
  const shown = useCountUp(Math.max(0, ov.balance))
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#2438a6] p-6 text-white shadow-[0_24px_50px_-24px_rgb(53_86_216/0.8)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 right-10 h-36 w-36 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80"><Wallet size={16} />{t('credits.label')}</div>
      <div className="relative mt-3 text-5xl font-extrabold tabular-nums tracking-tight" aria-label={formatINR(Math.max(0, ov.balance))}>{formatINR(shown)}</div>
      <p className="relative mt-1 text-white/85">{t('credits.available')}</p>
      {ov.onHold > 0 && <p className="relative mt-2 text-sm text-white/80">{t('credits.onHold', { amount: formatINR(ov.onHold) })}</p>}
      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button" disabled={ov.balance <= 0} onClick={() => navigate('/license')}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 font-bold text-primary shadow-lg transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
        ><Sparkles size={18} />{t('credits.use')}</button>
        <p className="min-w-0 flex-1 text-sm text-white/75">{t('credits.note')}</p>
      </div>
    </section>
  )
}

/** The code, and the buttons that send it. Hidden behind a lock until the person has a paid plan. */
function CodeCard({ ov }: { ov: ReferralOverview }) {
  const { t, i18n } = useTranslation('earn')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const code = ov.code
  const link = ov.link
  const defaultText = code && link ? t('shareText', { code, link }) : ''
  const [text, setText] = useState(defaultText)
  // the message follows the language and the code until the person edits it
  const [edited, setEdited] = useState(false)
  useEffect(() => { if (!edited) setText(defaultText) }, [defaultText, edited, i18n.language])
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(id) }, [copied])

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? code! : link!)
    if (ok) setCopied(what); else toast.error(t('code.copyFailed'))
  }

  if (!code || !link) {
    return (
      <section className="flex flex-col justify-center rounded-2xl border-2 border-dashed border-line bg-surface p-6" aria-label={t('code.label')}>
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-600"><Lock size={16} />{t('code.label')}</div>
        <div className="mt-3 select-none font-mono text-3xl font-bold tracking-[0.25em] text-ink-400" aria-hidden>RB-••••••</div>
        <p className="mt-2 text-ink-600">{t('locked.codeHidden')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled icon={<Copy size={14} />}>{t('code.copy')}</Button>
          <Button disabled icon={<MessageCircle size={14} />}>{t('code.whatsapp')}</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-primary/40 bg-surface p-6 shadow-card" aria-label={t('code.label')}>
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary"><Gift size={16} />{t('code.label')}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-4xl font-extrabold tracking-[0.18em] text-ink-900" data-testid="referral-code">{code}</span>
        <button type="button" onClick={() => void copy('code')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink-600 hover:bg-sunken hover:text-ink-900">
          {copied === 'code' ? <Check size={15} className="text-ok" /> : <Copy size={15} />}{copied === 'code' ? t('code.copied') : t('code.copy')}
        </button>
      </div>

      <a
        href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer"
        className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-ok text-base font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:opacity-95"
      ><MessageCircle size={20} />{t('code.whatsapp')}</a>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button className="flex-1 justify-center" onClick={() => void copy('link')} icon={copied === 'link' ? <Check size={14} className="text-ok" /> : <Link2 size={14} />}>{copied === 'link' ? t('code.linkCopied') : t('code.copyLink')}</Button>
        {canNativeShare() && <Button className="flex-1 justify-center" onClick={() => void nativeShare(text, t('title'))} icon={<Share2 size={14} />}>{t('code.share')}</Button>}
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-ink-600">{t('code.message')}</span>
        <textarea
          value={text} onChange={(e) => { setText(e.target.value); setEdited(true) }} rows={3} maxLength={500}
          className="mt-1 w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-[15px] leading-snug text-ink-900 focus:border-primary"
        />
        <span className="text-xs text-ink-400">{t('code.messageHint')}</span>
      </label>
    </section>
  )
}

function Tile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'neutral' | 'primary' | 'ok' }) {
  const tones = { neutral: 'bg-sunken text-ink-600', primary: 'bg-primary-soft text-primary', ok: 'bg-ok-soft text-ok' }
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
      <div className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight">{value}</div>
      <div className="text-sm text-ink-600">{label}</div>
    </div>
  )
}

function Stats({ ov }: { ov: ReferralOverview }) {
  const { t } = useTranslation('earn')
  const signed = useCountUp(ov.totals.signedUp, 600)
  const paid = useCountUp(ov.totals.paid, 600)
  const earned = useCountUp(Math.max(0, ov.totals.earned), 800)
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-5" aria-label={t('stats.signedUp')}>
      <Tile icon={<Users size={18} />} label={t('stats.signedUp')} value={String(signed)} tone="neutral" />
      <Tile icon={<BadgeCheck size={18} />} label={t('stats.paid')} value={String(paid)} tone="primary" />
      <Tile icon={<Wallet size={18} />} label={t('stats.earned')} value={formatINR(earned)} tone="ok" />
    </div>
  )
}

function HowItWorks({ percent }: { percent: number }) {
  const { t } = useTranslation('earn')
  const steps = [
    { icon: <Send size={20} />, k: 's1' },
    { icon: <Users size={20} />, k: 's2' },
    { icon: <Wallet size={20} />, k: 's3' },
  ] as const
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h3 className="text-lg font-semibold">{t('how.title')}</h3>
      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.k} className="flex gap-3">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              {s.icon}
              <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
            </span>
            <div>
              <div className="font-semibold">{t(`how.${s.k}.t`, { percent })}</div>
              <p className="text-[15px] text-ink-600">{t(`how.${s.k}.d`, { percent })}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

