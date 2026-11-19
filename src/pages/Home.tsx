import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react'
import { formatAmount, formatDate, formatINR, formatQty, todayISO } from '@/lib/format'
import { buildDashboard, changePct } from '@/lib/dashboard'
import { useHotkey } from '@/lib/hotkeys'
import { voucherTypeLabel } from '@/lib/invoice'
import { useAsync } from '@/lib/useAsync'
import { services, type Item } from '@/services'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'

function Change({ now, before }: { now: number; before: number }) {
  const { t } = useTranslation('home')
  const c = changePct(now, before)
  if (c === null) return <span className="text-xs text-ink-400">{t('noBillsYesterday')}</span>
  const up = c >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-ok' : 'text-danger'}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{t('vsYesterday', { pct: Math.abs(c) })}
    </span>
  )
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-sm text-ink-600">{label}</div>
      <div className="num mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 min-h-[18px] text-xs text-ink-400">{sub}</div>
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-md border border-line bg-surface">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="font-semibold">{title}</h2>{right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-6 text-center text-sm text-ink-400">{children}</p>

function StockList({ items, tone }: { items: Item[]; tone: 'warn' | 'danger' }) {
  const { t } = useTranslation('home')
  if (!items.length) return <Empty>{t('attention.nothing')}</Empty>
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, 5).map((i) => (
        <li key={i.id} className="flex h-9 items-center gap-2 px-4">
          <span className="min-w-0 flex-1 truncate">{i.name}</span>
          <span className={`num text-sm font-medium ${tone === 'danger' ? 'text-danger' : 'text-warn'}`}>{formatQty(i.currentStock)} {i.unit}</span>
        </li>
      ))}
      {items.length > 5 && <li className="px-4 py-1.5 text-xs text-ink-400">{t('attention.more', { count: items.length - 5 })}</li>}
    </ul>
  )
}

export function Home() {
  const { t } = useTranslation('home')
  const tc = useTranslation('common').t
  const navigate = useNavigate()
  const [days, setDays] = useState<'7' | '30'>('7')
  const { data: vouchers } = useAsync(() => services.vouchers.list())
  const { data: items } = useAsync(() => services.items.list())
  const { data: settings } = useAsync(() => services.settings.get())
  useHotkey('n', () => navigate('/issue/new'))

  const d = useMemo(() => (vouchers && items ? buildDashboard(vouchers, items, todayISO(), Number(days)) : null), [vouchers, items, days])
  if (!d || !settings) return <div className="text-ink-400">{tc('status.loading')}</div>

  const gstOn = settings.gstEnabled !== false
  const max = Math.max(1, ...d.series.map((p) => p.amount))
  const attention = d.negativeStock.length + d.outOfStock.length + d.lowStock.length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{settings.companyName || t('welcome')}</p>
          <p className="text-sm text-ink-600">{formatDate(todayISO())}</p>
        </div>
        <Link to="/issue/new" tabIndex={-1}>
          <Button variant="primary" icon={<Plus size={16} />} hotkey="n" className="h-10 px-4 text-md">{t('newIssue')}</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('tile.todayBilling')} value={formatINR(d.today.amount)} sub={<Change now={d.today.amount} before={d.yesterday.amount} />} />
        <Tile label={t('tile.billsToday')} value={d.today.bills} sub={t('tile.unitsIssued', { qty: formatQty(d.today.qty) })} />
        <Tile label={t('tile.thisMonth')} value={formatINR(d.month.amount)} sub={t('tile.monthSub', { count: d.month.bills, qty: formatQty(d.month.qty) })} />
        {gstOn
          ? <Tile label={t('tile.taxMonth')} value={formatINR(d.month.tax)} sub="CGST + SGST + IGST" />
          : <Tile label={t('tile.stockValue')} value={formatINR(d.stockValue)} sub={t('tile.itemCount', { count: d.itemCount })} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title={t('trend.title')}
            right={<Segmented label={t('trend.range')} value={days} onChange={setDays} options={[{ value: '7', label: t('trend.days7') }, { value: '30', label: t('trend.days30') }]} />}
          >
            {d.series.every((p) => !p.amount)
              ? <Empty>{t('trend.empty')}</Empty>
              : (
                <div className="flex h-44 items-end gap-1 px-4 pb-6 pt-4" role="img" aria-label={t('trend.aria', { days })}>
                  {d.series.map((p) => (
                    <div key={p.date} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={t('trend.bar', { date: formatDate(p.date), amount: formatINR(p.amount), count: p.bills })}>
                      <div className={`w-full rounded-t-sm ${p.date === todayISO() ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/70'}`} style={{ height: `${Math.max(p.amount ? 3 : 0, (p.amount / max) * 100)}%` }} />
                      {(days === '7' || p.date.endsWith('-01') || p.date === todayISO()) && (
                        <span className="num absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-400">{p.date.slice(8)}/{p.date.slice(5, 7)}</span>
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
                  <div className="bg-sunken px-4 py-1 text-xs font-medium uppercase tracking-wide text-ink-600">{t('attention.section', { label: t(`attention.${label}`), count: list.length })}</div>
                  <StockList items={list} tone={tone} />
                </div>
              ))}
            {!attention && <Empty>{t('attention.allAbove')}</Empty>}
          </div>
          {gstOn && <div className="border-t border-line px-4 py-2 text-xs text-ink-600">{t('attention.stockValueCost')} <span className="num font-medium">{formatINR(d.stockValue)}</span></div>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('top.title')} right={<span className="text-xs text-ink-400">{t('top.byValue')}</span>}>
          {d.topItems.length === 0 ? <Empty>{t('top.empty')}</Empty> : (
            <ol className="divide-y divide-line">
              {d.topItems.map((t, n) => (
                <li key={t.itemId} className="flex h-9 items-center gap-3 px-4">
                  <span className="num w-4 text-ink-400">{n + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="num text-sm text-ink-600">{formatQty(t.qty)} {t.unit}</span>
                  <span className="num w-24 text-right font-medium">₹{formatAmount(t.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={t('recent.title')} right={<Link to="/issues" className="text-sm text-primary hover:underline">{t('recent.viewRegister')}</Link>}>
          {d.recent.length === 0 ? <Empty>{t('recent.empty')}</Empty> : (
            <ul className="divide-y divide-line">
              {d.recent.map((v) => (
                <li key={v.id}>
                  <Link to="/issues" className="flex h-9 items-center gap-3 px-4 hover:bg-sunken">
                    <span className="num w-28 shrink-0 font-medium">{v.number}</span>
                    <span className="min-w-0 flex-1 truncate">{v.partyName || t('recent.walkIn')}</span>
                    <span className="hidden shrink-0 whitespace-nowrap text-xs text-ink-400 xl:inline">{voucherTypeLabel(v, tc)} · {formatDate(v.date)}</span>
                    <span className="num w-24 text-right font-medium">₹{formatAmount(v.totals.grandTotal)}</span>
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
