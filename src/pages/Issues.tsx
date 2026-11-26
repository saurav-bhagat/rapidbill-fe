import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { addDays, format, startOfMonth } from 'date-fns'
import { Ban, Copy, Pencil, Plus, Printer, Undo2 } from 'lucide-react'
import { formatAmount, formatDate, formatINR, todayISO } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { matchesQuery } from '@/lib/search'
import { isWaiting } from '@/lib/saved'
import { useAsync } from '@/lib/useAsync'
import { useSync } from '@/offline/state'
import { services, type Voucher } from '@/services'
import { errorText } from '@/lib/errors'
import { toast } from '@/store/toast'
import { dueToday, paymentLabel, voucherTypeLabel } from '@/lib/invoice'
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal'
import { ReturnDrawer } from '@/components/register/ReturnDrawer'
import { hasReturns } from '@/lib/returns'
import { useLicense } from '@/license/store'
import { Badge } from '@/components/ui/Badge'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Field'
import { SearchInput } from '@/components/ui/SearchInput'
import { VirtualTable, type SortState, type VColumn } from '@/components/ui/VirtualTable'

type Preset = 'today' | '7d' | 'month' | 'all' | 'custom'
const PRESETS: Preset[] = ['today', '7d', 'month', 'all', 'custom']

const SORT: Record<string, (a: Voucher, b: Voucher) => number> = {
  number: (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }),
  date: (a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, undefined, { numeric: true }),
  party: (a, b) => a.partyName.localeCompare(b.partyName),
  total: (a, b) => a.totals.grandTotal - b.totals.grandTotal,
}

function range(preset: Preset, from: string, to: string): [string, string] {
  const today = todayISO()
  const iso = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === 'today') return [today, today]
  if (preset === '7d') return [iso(addDays(new Date(), -6)), today]
  if (preset === 'month') return [iso(startOfMonth(new Date())), today]
  if (preset === 'custom') return [from || '0000-01-01', to || '9999-12-31']
  return ['0000-01-01', '9999-12-31']
}

export function Issues() {
  const { t } = useTranslation('register')
  const pendingIds = useSync((x) => x.pendingIds)
  const failedIds = useSync((x) => x.failedIds)
  const navigate = useNavigate()
  const { data: loaded, error: loadError, reload } = useAsync(() => services.vouchers.list())
  const vouchers = loaded ?? []
  const { data: parties = [] } = useAsync(() => services.parties.list())
  const { data: settings } = useAsync(() => services.settings.get())
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [partyF, setPartyF] = useState('')
  const [modeF, setModeF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<string>()
  const [preview, setPreview] = useState<Voucher>()
  // a reprint of a credit bill shows (and its UPI QR asks for) what is still due today: less returns on it, at most what the party owes now
  const { data: due } = useAsync(async () => {
    const v = preview
    if (!v || v.payment !== 'CREDIT' || !v.partyId || v.status === 'CANCELLED') return undefined
    const [rets, party] = await Promise.all([services.returns.listForBill(v.id).catch(() => []), services.parties.get(v.partyId).catch(() => undefined)])
    return { id: v.id, amount: dueToday(v, rets, party?.balance) }
  }, [preview?.id])
  const dueNow = due && due.id === preview?.id ? due.amount : undefined
  const [toCancel, setToCancel] = useState<Voucher>()
  const [keepPaid, setKeepPaid] = useState(false)
  const [returnId, setReturnId] = useState<string>()
  const canWrite = useLicense()?.canWrite ?? true
  const searchRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => {
    const [a, b] = range(preset, from, to)
    const f = vouchers.filter((v) =>
      v.date >= a && v.date <= b &&
      (!partyF || (partyF === 'cash' ? v.partyId === null : v.partyId === partyF)) &&
      (!modeF || v.mode === modeF) &&
      (!statusF || v.status === statusF) &&
      matchesQuery(query, [v.number, v.partyName, v.remarks, ...v.lines.map((l) => l.name)]),
    )
    const cmp = SORT[sort.key] ?? SORT.date
    return f.sort((x, y) => (sort.dir === 'asc' ? cmp(x, y) : cmp(y, x)))
  }, [vouchers, preset, from, to, partyF, modeF, statusF, query, sort])

  const selected = vouchers.find((v) => v.id === selectedId)
  const activeTotal = rows.reduce((s, v) => (v.status === 'ACTIVE' ? s + v.totals.grandTotal : s), 0)
  const cancelledCount = rows.filter((v) => v.status === 'CANCELLED').length

  const view = (v?: Voucher) => { if (v) { setSelectedId(v.id); setPreview(v) } }
  const edit = (v?: Voucher) => {
    if (!v) return
    if (v.status === 'CANCELLED') return toast.error(t('toast.cancelledNoEdit'))
    if (hasReturns(v)) return toast.error(t('billHasReturns', { ns: 'errors' }))
    navigate(`/issue/${v.id}/edit`)
  }
  const duplicate = (v?: Voucher) => { if (v) navigate(`/issue/new?from=${v.id}`) }
  const askCancel = (v?: Voucher) => {
    if (!v) return
    if (v.status === 'CANCELLED') return toast.error(t('toast.alreadyCancelled', { number: v.number }))
    if (hasReturns(v)) return toast.error(t('billHasReturns', { ns: 'errors' }))
    setKeepPaid(false)
    setToCancel(v)
  }
  const openReturn = (v?: Voucher) => {
    if (!v) return
    if (v.status === 'CANCELLED') return toast.error(t('returnBillCancelled', { ns: 'errors' }))
    setSelectedId(v.id); setReturnId(v.id)
  }
  const doCancel = async () => {
    const v = toCancel
    setToCancel(undefined)
    if (!v) return
    try {
      await services.billing.cancel(v.id, { keepPaid })
      toast.success(t(isWaiting(v.id) ? 'toast.cancelledOffline' : 'toast.cancelled', { number: v.number }))
      reload()
    } catch (e) {
      toast.error(errorText(t, e, t('toast.cancelFailed')))
    }
  }

  useHotkey('/', () => searchRef.current?.focus())
  useHotkey('n', () => navigate('/issue/new'))
  useHotkey('e', () => edit(selected))
  useHotkey('p', () => view(selected))
  useHotkey('c', () => askCancel(selected))
  useHotkey('mod+d', () => duplicate(selected))
  useHotkey('t', () => openReturn(selected))

  const columns: VColumn<Voucher>[] = [
    { key: 'number', header: t('columns.voucher'), width: '140px', sortable: true, cell: (v) => <span className={`font-mono font-medium ${v.status === 'CANCELLED' ? 'text-ink-400 line-through' : ''}`}>{v.number}</span> },
    { key: 'date', header: t('columns.date'), width: '110px', sortable: true, cell: (v) => formatDate(v.date) },
    { key: 'party', header: t('columns.party'), sortable: true, cell: (v) => <span className={v.partyId ? '' : 'text-ink-600'}>{v.partyName}</span> },
    { key: 'type', header: t('columns.type'), width: '120px', cell: (v) => <Badge tone={v.mode === 'TAX_INVOICE' && v.taxApplicable ? 'primary' : 'neutral'}>{voucherTypeLabel(v, t)}</Badge> },
    { key: 'items', header: t('columns.items'), width: '70px', align: 'right', cell: (v) => v.totals.itemCount },
    { key: 'payment', header: t('columns.payment'), width: '170px', cell: (v) => <span className="text-ink-600">{v.payment === 'CREDIT' && v.paidAmount ? t('partPaid', { label: paymentLabel(v.payment, t), paid: formatINR(v.paidAmount) }) : paymentLabel(v.payment, t)}</span> },
    { key: 'total', header: t('columns.total'), width: '130px', align: 'right', sortable: true, cell: (v) => <span className={v.status === 'CANCELLED' ? 'text-ink-400 line-through' : 'font-medium'}>{formatAmount(v.totals.grandTotal)}</span> },
    { key: 'status', header: t('columns.status'), width: '190px', cell: (v) => (
      <span className="flex flex-wrap items-center gap-1">
        <Badge tone={v.status === 'ACTIVE' ? 'ok' : 'danger'}>{v.status === 'ACTIVE' ? t('status.active') : t('status.cancelled')}</Badge>
        {hasReturns(v) && <Badge tone="warn">{t('status.returned')}</Badge>}
        {pendingIds.includes(v.id) && <Badge tone="warn">{t('sync.notSynced', { ns: 'common' })}</Badge>}
        {failedIds.includes(v.id) && <Badge tone="danger">{t('sync.refused', { ns: 'common' })}</Badge>}
      </span>
    ) },
  ]

  const has = !!selected
  if (loadError && !loaded) return <LoadFailed error={loadError} onRetry={reload} />

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} inputRef={searchRef} placeholder={t('filters.search')} onEnterResults={() => document.querySelector<HTMLElement>('[role=grid]')?.focus()} />
        <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="!w-36" aria-label={t('filters.dateRange')}>
          {PRESETS.map((p) => <option key={p} value={p}>{t(`presets.${p}`)}</option>)}
        </Select>
        {preset === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('filters.fromDate')} className="h-9 rounded border border-line bg-surface px-2 font-mono text-base" />
            <span className="text-ink-400">{t('filters.to')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('filters.toDate')} className="h-9 rounded border border-line bg-surface px-2 font-mono text-base" />
          </>
        )}
        <Select value={partyF} onChange={(e) => setPartyF(e.target.value)} className="!w-48" aria-label={t('filters.party')}>
          <option value="">{t('filters.allParties')}</option><option value="cash">{t('filters.cashCounter')}</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={modeF} onChange={(e) => setModeF(e.target.value)} className="!w-36" aria-label={t('filters.type')}>
          <option value="">{t('filters.allTypes')}</option><option value="TAX_INVOICE">{settings?.gstEnabled === false ? t('filters.invoice') : t('filters.taxInvoice')}</option><option value="CHALLAN">{t('filters.challan')}</option>
        </Select>
        <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="!w-32" aria-label={t('filters.status')}>
          <option value="">{t('filters.allStatus')}</option><option value="ACTIVE">{t('status.active')}</option><option value="CANCELLED">{t('status.cancelled')}</option>
        </Select>
        <div className="ml-auto"><Button variant="primary" icon={<Plus size={14} />} hotkey="n" onClick={() => navigate('/issue/new')}>{t('actions.newIssue')}</Button></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Printer size={14} />} hotkey="enter" disabled={!has} onClick={() => view(selected)}>{t('actions.viewPrint')}</Button>
        <Button icon={<Pencil size={14} />} hotkey="e" disabled={!has || selected?.status === 'CANCELLED'} onClick={() => edit(selected)}>{t('actions.edit')}</Button>
        <Button icon={<Copy size={14} />} hotkey="mod+d" disabled={!has} onClick={() => duplicate(selected)}>{t('actions.duplicate')}</Button>
        <Button icon={<Ban size={14} />} hotkey="c" disabled={!has || selected?.status === 'CANCELLED'} onClick={() => askCancel(selected)}>{t('actions.cancelVoucher')}</Button>
        <Button icon={<Undo2 size={14} />} hotkey="t" disabled={!has || selected?.status === 'CANCELLED'} onClick={() => openReturn(selected)}>{t('actions.returnItems')}</Button>
        <p className="ml-auto text-sm text-ink-600">
          {t('summary.count', { count: rows.length })}{cancelledCount > 0 && ` ${t('summary.cancelled', { count: cancelledCount })}`}
          <span className="mx-2 text-line">|</span>{t('summary.activeTotal')} <span className="font-mono text-ink-900">₹{formatAmount(activeTotal)}</span>
        </p>
      </div>

      <VirtualTable
        label={t('tableLabel')}
        columns={columns}
        rows={rows}
        rowKey={(v) => v.id}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onActivate={view}
        sort={sort}
        onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'number' ? 'desc' : 'asc' }))}
        empty={vouchers.length === 0 ? t('empty.none') : t('empty.filtered')}
      />
      <p className="text-sm text-ink-400">{t('hint')}</p>

      <PrintPreviewModal voucher={preview} settings={settings} dueNow={dueNow} onClose={() => setPreview(undefined)} />
      <ReturnDrawer open={!!returnId} bill={vouchers.find((v) => v.id === returnId)} settings={settings} canWrite={canWrite} onClose={() => setReturnId(undefined)} onChanged={reload} />
      <ConfirmDialog open={!!toCancel} title={t('cancel.title')} confirmLabel={t('actions.cancelVoucher')} danger onConfirm={doCancel} onCancel={() => setToCancel(undefined)}>
        {toCancel && (
          <div className="space-y-2">
            <p><span className="font-mono font-medium text-ink-900">{toCancel.number}</span> {t('cancel.summary', { party: toCancel.partyName, amount: formatAmount(toCancel.totals.grandTotal) })}</p>
            <p>{t(toCancel.payment === 'CREDIT' && toCancel.partyId ? 'cancel.bodyCredit' : 'cancel.body', { count: toCancel.totals.itemCount })}</p>
            {toCancel.payment === 'CREDIT' && toCancel.partyId && (toCancel.paidAmount ?? 0) > 0 && (
              <fieldset className="space-y-1 rounded border border-line p-2" data-testid="cancel-paid">
                <legend className="px-1 text-sm text-ink-600">{t('cancel.paidQuestion', { amount: formatINR(toCancel.paidAmount ?? 0) })}</legend>
                <label className="flex items-center gap-2"><input type="radio" name="keepPaid" checked={!keepPaid} onChange={() => setKeepPaid(false)} />{t('cancel.paidBack')}</label>
                <label className="flex items-center gap-2"><input type="radio" name="keepPaid" checked={keepPaid} onChange={() => setKeepPaid(true)} />{t('cancel.paidKeep', { party: toCancel.partyName })}</label>
              </fieldset>
            )}
            {toCancel.mode === 'TAX_INVOICE' && toCancel.date.slice(0, 7) < todayISO().slice(0, 7) && <p role="alert" className="rounded bg-warn-soft px-2 py-1 text-warn">{t('cancel.filedWarn')}</p>}
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
