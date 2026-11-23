import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Clock, Gift, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { formatINR } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { longDate } from '@/license/format'
import { fetchHistory, fetchPeople, type HistoryRow, type PeopleFilter, type ReferralPerson } from './api'
import { exampleReward, initialsOf } from './share'

const EXAMPLE_PRICE = 159_900
const FILTERS: PeopleFilter[] = ['all', 'paid', 'unpaid']

/** The people who signed up with the person's code. When the page is locked, shows one example row so the screen is understood. */
export function EarnPeople({ locked, percent }: { locked: boolean; percent: number }) {
  const { t } = useTranslation('earn')
  const [filter, setFilter] = useState<PeopleFilter>('all')
  const [rows, setRows] = useState<ReferralPerson[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (cursor?: string) => {
    setBusy(true)
    try {
      const page = await fetchPeople(filter, cursor)
      setRows((r) => (cursor ? [...r, ...page.data] : page.data))
      setNext(page.next)
      setFailed(false)
    } catch { setFailed(true) } finally { setBusy(false); setLoaded(true) }
  }, [filter])
  useEffect(() => { if (!locked) { setLoaded(false); void load() } }, [load, locked])

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{t('people.title')}</h3>
        {!locked && (
          <div role="group" aria-label={t('people.title')} className="flex rounded-lg bg-sunken p-0.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`h-8 rounded-md px-3 text-sm font-medium ${filter === f ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>{t(`people.filter.${f}`)}</button>
            ))}
          </div>
        )}
      </div>

      {locked ? <SampleRow percent={percent} /> : !loaded ? (
        <p className="py-8 text-center text-ink-400" role="status">…</p>
      ) : failed && rows.length === 0 ? (
        <p className="py-8 text-center text-ink-600" role="alert">{t('history.empty')}</p>
      ) : rows.length === 0 ? (
        <Empty filtered={filter !== 'all'} percent={percent} />
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((p) => <PersonRow key={p.id} p={p} percent={percent} />)}
        </ul>
      )}
      {!locked && next && <div className="mt-3 text-center"><Button disabled={busy} onClick={() => void load(next)}>{t('people.more')}</Button></div>}
    </section>
  )
}

function Empty({ filtered, percent }: { filtered: boolean; percent: number }) {
  const { t } = useTranslation('earn')
  if (filtered) return <p className="py-8 text-center text-ink-600">{t('people.emptyFilter')}</p>
  return (
    <div className="mx-auto mt-4 max-w-md py-4 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><Gift size={26} /></span>
      <h4 className="mt-3 text-lg font-semibold">{t('people.emptyTitle')}</h4>
      <p className="mt-1 text-ink-600">{t('people.emptyBody', { price: formatINR(EXAMPLE_PRICE).replace('.00', ''), reward: formatINR(exampleReward(EXAMPLE_PRICE, percent)) })}</p>
    </div>
  )
}

/** One clearly labelled example, so a person without a plan can see what the list will look like. */
function SampleRow({ percent }: { percent: number }) {
  const { t } = useTranslation('earn')
  return (
    <ul className="mt-3 opacity-60" aria-hidden>
      <li className="flex flex-wrap items-center gap-3 py-3">
        <Avatar name={t('locked.sampleName')} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('locked.sampleName')} <span className="font-normal text-ink-600">· {t('locked.sampleBusiness')}</span></div>
          <div className="text-sm text-ink-600">{t('people.paid')} · {t('people.payments', { count: 2 })}</div>
        </div>
        <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">{t('locked.sample')}</span>
        <span className="font-semibold tabular-nums text-ok">+ {formatINR(exampleReward(EXAMPLE_PRICE, percent) * 2)}</span>
      </li>
    </ul>
  )
}

function Avatar({ name }: { name: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initialsOf(name)}</span>
}

function PersonRow({ p, percent }: { p: ReferralPerson; percent: number }) {
  const { t } = useTranslation('earn')
  const { t: tl } = useTranslation('license')
  const [open, setOpen] = useState(false)
  const paid = p.status === 'PAID'
  const where = [p.businessName, p.stateCode ? stateName(p.stateCode) : ''].filter(Boolean).join(' · ')
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={p.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="truncate text-sm text-ink-600">{[where, t('people.joined', { date: longDate(p.signedUpAt) })].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="flex items-center gap-3 text-right">
          {paid ? (
            <>
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">{t('people.paid')}</span>
              <div>
                <div className="font-bold tabular-nums text-ok">+ {formatINR(p.earned)}</div>
                <div className="text-xs text-ink-600">{t('people.payments', { count: p.paymentsCount })}</div>
              </div>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-600"><Clock size={12} />{t('people.signedUp')}</span>
              <span className="hidden text-sm text-ink-400 sm:inline">{t('people.waiting')}</span>
            </>
          )}
        </div>
        {paid && (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary-soft">
            {open ? t('people.hide') : t('people.details')}{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {paid && open && (
        <ul className="ml-[52px] mt-2 space-y-1.5 rounded-lg bg-paper p-3 text-sm">
          {p.payments.map((x) => (
            <li key={x.paymentId} className="flex flex-wrap items-center justify-between gap-2">
              <span>{tl(`planName.${x.planId}`, { defaultValue: x.planId })} <span className="text-ink-400">· {longDate(x.paidAt)}</span></span>
              <span className="tabular-nums text-ink-600">{t('people.fee')}: {formatINR(x.fee)}</span>
              <span className={`font-semibold tabular-nums ${x.counted && x.reward > 0 ? 'text-ok' : 'text-ink-400'}`}>
                {x.counted && x.reward > 0 ? `${t('people.reward', { percent })}: + ${formatINR(x.reward)}` : t('people.noReward')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Credits earned, taken back and used, newest first. */
export function EarnHistory() {
  const { t } = useTranslation('earn')
  const { t: tl } = useTranslation('license')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (cursor?: string) => {
    setBusy(true)
    try {
      const page = await fetchHistory(cursor)
      setRows((r) => (cursor ? [...r, ...page.data] : page.data))
      setNext(page.next)
    } catch { /* the list just stays as it was */ } finally { setBusy(false); setLoaded(true) }
  }, [])
  useEffect(() => { void load() }, [load])

  const label = (r: HistoryRow) => (r.kind === 'EARN' ? t('history.earn', { name: r.businessName || r.friendName })
    : r.kind === 'REVERSAL' ? t('history.reversal', { name: r.businessName || r.friendName })
      : t('history.spend', { plan: tl(`planName.${r.planId}`, { defaultValue: r.planId }) }))

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h3 className="text-lg font-semibold">{t('history.title')}</h3>
      {!loaded ? <p className="py-6 text-center text-ink-400" role="status">…</p> : rows.length === 0 ? (
        <p className="py-6 text-center text-ink-600"><Users size={18} className="mx-auto mb-1 text-ink-400" />{t('history.empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => {
            const plus = r.kind === 'EARN'
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate">{label(r)}</div>
                  <div className="text-xs text-ink-400">{longDate(r.createdAt)}</div>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${plus ? 'text-ok' : 'text-ink-900'}`}>{plus ? '+' : '−'} {formatINR(r.amount)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {next && <div className="mt-3 text-center"><Button disabled={busy} onClick={() => void load(next)}>{t('history.more')}</Button></div>}
    </section>
  )
}
