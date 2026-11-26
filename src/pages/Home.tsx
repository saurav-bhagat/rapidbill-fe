import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, CalendarDays, FileText, IndianRupee, Percent, Plus, Warehouse, type LucideIcon } from 'lucide-react'
import { formatAmount, formatDate, formatINR, formatQty, todayISO } from '@/lib/format'
import { buildDashboard, changePct } from '@/lib/dashboard'
import { useHotkey } from '@/lib/hotkeys'
import { voucherTypeLabel } from '@/lib/invoice'
import { useAsync } from '@/lib/useAsync'
import { services, type Item } from '@/services'
import { apiEnabled } from '@/services/http/client'
import { httpReturns } from '@/services/http/services'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'

function Change({ now, before }: { now: number; before: number }) {
  const { t } = useTranslation('home')
  const c = changePct(now, before)
  if (c === null) return <span className="text-sm text-ink-600">{t('noBillsYesterday')}</span>
  const up = c >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${up ? 'text-ok' : 'text-danger'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{t('vsYesterday', { pct: Math.abs(c) })}
    </span>
  )
}

const TONES = { blue: 'bg-primary-soft text-primary', green: 'bg-ok-soft text-ok', violet: 'bg-[#efe9fe] text-[#6d3fd1]', amber: 'bg-warn-soft text-warn' }
function Tile({ label, value, sub, icon: Icon, tone = 'blue' }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <div className="rounded-xl border border-line/70 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-ink-600">{label}</div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}><Icon size={18} /></div>
      </div>
      <div className="num mt-3 !text-left text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 min-h-[18px] text-sm text-ink-600">{sub}</div>
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line/70 bg-surface shadow-card">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <h2 className="text-base font-semibold">{title}</h2>{right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-8 text-center text-base text-ink-600">{children}</p>

function StockList({ items, tone }: { items: Item[]; tone: 'warn' | 'danger' }) {
  const { t } = useTranslation('home')
  if (!items.length) return <Empty>{t('attention.nothing')}</Empty>
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, 5).map((i) => (
        <li key={i.id} className="flex h-11 items-center gap-3 px-5">
          <span className="min-w-0 flex-1 truncate">{i.name}</span>
          <span className={`num font-semibold ${tone === 'danger' ? 'text-danger' : 'text-warn'}`}>{formatQty(i.currentStock)} {i.unit}</span>
        </li>
      ))}
      {items.length > 5 && <li className="px-5 py-2 text-sm text-ink-600">{t('attention.more', { count: items.length - 5 })}</li>}
    </ul>
  )
}

export function Home() {
  const { t } = useTranslation('home')
  const tc = useTranslation('common').t
  const navigate = useNavigate()
  const [days, setDays] = useState<'7' | '30'>('7')
  // The last month kept on this device: instant, works offline, and covers every figure on this screen.
  const q1 = useAsync(() => (services.vouchers.recent ?? services.vouchers.list)())
  const q2 = useAsync(() => services.items.list())
  const q3 = useAsync(() => services.settings.get())
  // who owes money: a nice-to-have, so a failure here never blocks the screen
  const { data: parties } = useAsync(() => services.parties.list())
  // goods that came back this month: only known online (returns are kept on the server); offline the figures are as billed
  const { data: rets } = useAsync(() => (apiEnabled ? httpReturns.listRange(`${todayISO().slice(0, 7)}-01`, todayISO()).catch(() => undefined) : Promise.resolve(undefined)))
  const { data: vouchers } = q1
  const { data: items } = q2
  const { data: settings } = q3
  useHotkey('n', () => navigate('/issue/new'))

  const d = useMemo(() => (vouchers && items ? buildDashboard(vouchers, items, todayISO(), Number(days)) : null), [vouchers, items, days])
  const failed = q1.error ?? q2.error ?? q3.error
  if (failed && (!d || !settings)) return <LoadFailed error={failed} onRetry={() => { q1.reload(); q2.reload(); q3.reload() }} />
  if (!d || !settings) return <div className="text-ink-400">{tc('status.loading')}</div>

  const gstOn = settings.gstEnabled !== false
  const max = Math.max(1, ...d.series.map((p) => p.amount))
  const back = (only?: string) => { const rs = (rets ?? []).filter((r) => !only || r.date === only); return { count: rs.length, amount: rs.reduce((s, r) => s + r.totals.grandTotal, 0), tax: rs.reduce((s, r) => s + r.totals.cgst + r.totals.sgst + r.totals.igst, 0) } }
  const backMonth = back()
  const backToday = back(todayISO())
  const owing = (parties ?? []).filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance)
  const owed = owing.reduce((s, p) => s + p.balance, 0)
  const attention = d.negativeStock.length + d.outOfStock.length + d.lowStock.length

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-bold tracking-tight">{settings.companyName || t('welcome')}</p>
          <p className="mt-0.5 text-base text-ink-600">{formatDate(todayISO())}</p>
        </div>
        <Link to="/issue/new" tabIndex={-1}>
          <Button variant="primary" icon={<Plus size={18} />} hotkey="n" className="h-10 px-4">{t('newIssue')}</Button>
        </Link>
      </div>

      {(!settings.address.trim() || !settings.stateCode) && (
        <Link to="/settings?tab=profile" className="flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-base text-warn hover:brightness-95">
          <span><b>{t('profileNudge.title')}</b> {t('profileNudge.body')}</span>
          <span className="shrink-0 font-semibold underline">{t('profileNudge.cta')}</span>
        </Link>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={IndianRupee} label={t('tile.todayBilling')} value={formatINR(d.today.amount - backToday.amount)} sub={backToday.count ? t('tile.afterReturns', { amount: formatINR(backToday.amount) }) : <Change now={d.today.amount} before={d.yesterday.amount} />} />
        <Tile icon={FileText} tone="green" label={t('tile.billsToday')} value={d.today.bills} sub={t('tile.unitsIssued', { qty: formatQty(d.today.qty) })} />
        <Tile icon={CalendarDays} tone="violet" label={t('tile.thisMonth')} value={formatINR(d.month.amount - backMonth.amount)} sub={backMonth.count ? t('tile.afterReturns', { amount: formatINR(backMonth.amount) }) : t('tile.monthSub', { count: d.month.bills, qty: formatQty(d.month.qty) })} />
        {gstOn
          ? <Tile icon={Percent} tone="amber" label={t('tile.taxMonth')} value={formatINR(d.month.tax - backMonth.tax)} sub={backMonth.count ? t('tile.afterReturns', { amount: formatINR(backMonth.tax) }) : 'CGST + SGST + IGST'} />
          : <Tile icon={Warehouse} label={t('tile.stockValue')} value={formatINR(d.stockValue)} sub={t('tile.itemCount', { count: d.itemCount })} />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card
            title={t('trend.title')}
            right={<Segmented label={t('trend.range')} value={days} onChange={setDays} options={[{ value: '7', label: t('trend.days7') }, { value: '30', label: t('trend.days30') }]} />}
          >
            {d.series.every((p) => !p.amount)
              ? <Empty>{t('trend.empty')}</Empty>
              : (
                <div className="flex h-52 items-end gap-1.5 px-5 pb-8 pt-5" role="img" aria-label={t('trend.aria', { days })}>
                  {d.series.map((p) => (
                    <div key={p.date} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={t('trend.bar', { date: formatDate(p.date), amount: formatINR(p.amount), count: p.bills })}>
                      <div className={`mx-auto w-full max-w-[56px] rounded-t-md ${p.date === todayISO() ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/70'}`} style={{ height: `${Math.max(p.amount ? 3 : 0, (p.amount / max) * 100)}%` }} />
                      {(days === '7' || p.date.endsWith('-01') || p.date === todayISO()) && (
                        <span className="num absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-ink-600">{p.date.slice(8)}/{p.date.slice(5, 7)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </div>

        <Card title={t('attention.title')} right={attention ? <Badge tone="warn">{attention}</Badge> : <Badge tone="ok">{t('attention.allGood')}</Badge>}>
          <div className="divide-y divide-line">
            {([['negative', d.negativeStock, 'danger'], ['out', d.outOfStock, 'danger'], ['low', d.lowStock, 'warn']] as const)
              .filter(([, list]) => list.length)
              .map(([label, list, tone]) => (
                <div key={label}>
                  <div className="bg-sunken px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600">{t('attention.section', { label: t(`attention.${label}`), count: list.length })}</div>
                  <StockList items={list} tone={tone} />
                </div>
              ))}
            {!attention && <Empty>{t('attention.allAbove')}</Empty>}
          </div>
          {gstOn && <div className="border-t border-line px-5 py-3 text-sm text-ink-600">{t('attention.stockValueCost')} <span className="num font-medium">{formatINR(d.stockValue)}</span></div>}
        </Card>
      </div>

      {owing.length > 0 && (
        <Card title={t('owed.title')} right={<Link to="/parties" className="text-base font-medium text-primary hover:underline">{t('owed.viewAll')}</Link>}>
          <div className="flex items-baseline gap-3 border-b border-line px-5 py-3">
            <span className="num text-2xl font-bold">{formatINR(owed)}</span>
            <span className="text-base text-ink-600">{t('owed.from', { count: owing.length })}</span>
          </div>
          <ul className="divide-y divide-line">
            {owing.slice(0, 5).map((p) => (
              <li key={p.id} className="flex h-11 items-center gap-3 px-5">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="num font-semibold">{formatINR(p.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('top.title')} right={<span className="text-sm text-ink-600">{t('top.byValue')}</span>}>
          {d.topItems.length === 0 ? <Empty>{t('top.empty')}</Empty> : (
            <ol className="divide-y divide-line">
              {d.topItems.map((t, n) => (
                <li key={t.itemId} className="flex h-11 items-center gap-3 px-5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken text-sm font-semibold text-ink-600">{n + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="num text-ink-600">{formatQty(t.qty)} {t.unit}</span>
                  <span className="num w-28 text-right font-semibold">₹{formatAmount(t.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={t('recent.title')} right={<Link to="/issues" className="text-base font-medium text-primary hover:underline">{t('recent.viewRegister')}</Link>}>
          {d.recent.length === 0 ? <Empty>{t('recent.empty')}</Empty> : (
            <ul className="divide-y divide-line">
              {d.recent.map((v) => (
                <li key={v.id}>
                  <Link to="/issues" className="flex h-14 items-center gap-3 px-5 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{v.partyName || t('recent.walkIn')}</span>
                      <span className="block truncate text-sm text-ink-600"><span className="font-mono">{v.number}</span> · {voucherTypeLabel(v, tc)} · {formatDate(v.date)}</span>
                    </span>
                    <span className="num shrink-0 text-base font-semibold">₹{formatAmount(v.totals.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
