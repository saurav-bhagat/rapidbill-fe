import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { formatAmount, formatDate, formatINR, formatQty, todayISO } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useSync } from '@/offline/state'
import { billInterState, buildReturn, defaultSettlement, returnableLeft } from '@/lib/returns'
import { services, type ReturnSettlement, type SalesReturn, type Settings, type Voucher } from '@/services'
import { toast } from '@/store/toast'
import { CreditNoteModal } from '../print/CreditNoteModal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Field, Input } from '../ui/Field'
import { Drawer } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'

interface Props {
  open: boolean
  bill?: Voucher
  settings?: Settings
  canWrite: boolean
  onClose: () => void
  /** A return was saved or cancelled: stock, balances and the bill's counts changed. */
  onChanged: () => void
}

/** Goods coming back on a bill: how many of each line, how the money is settled, and the credit notes already made against it. */
export function ReturnDrawer({ open, bill, settings, canWrite, onClose, onChanged }: Props) {
  const { t } = useTranslation('register')
  const { t: te } = useTranslation('errors')
  const [qty, setQty] = useState<string[]>([])
  const [settle, setSettle] = useState<ReturnSettlement>('CASH')
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [list, setList] = useState<SalesReturn[]>([])
  const [listError, setListError] = useState('')
  const [printing, setPrinting] = useState<SalesReturn>()
  const [cancelling, setCancelling] = useState<SalesReturn>()
  // goes up after every sync: a return made offline gets its number then, so the list is read again
  const version = useSync((s) => s.version)

  const load = async (b: Voucher) => {
    setListError('')
    try { setList(await services.returns.listForBill(b.id)) } catch (e) { setList([]); setListError(errorText(te, e)) }
  }
  useEffect(() => {
    if (!open || !bill) return
    setQty(bill.lines.map(() => '')); setSettle(defaultSettlement(bill)); setDate(todayISO()); setReason(''); setError('')
  }, [open, bill?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && bill) void load(bill) }, [open, bill?.id, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const left = bill ? returnableLeft(bill) : []
  const parsed = qty.map((q) => (q.trim() === '' ? 0 : Number(q.replace(',', '.'))))
  const want = parsed.map((q, line) => ({ line, qty: q })).filter((w) => w.qty !== 0)
  const built = useMemo(() => (bill && want.length ? buildReturn(bill, want, billInterState(bill)) : undefined), [bill, JSON.stringify(want)]) // eslint-disable-line react-hooks/exhaustive-deps
  const problem = built && 'key' in built ? te(built.key, built) : ''
  const ok = built && !('key' in built) ? built : undefined
  const nothingLeft = left.every((l) => l === 0)
  const settlements: ReturnSettlement[] = bill?.partyId ? ['ADJUST', 'CASH', 'UPI', 'BANK'] : ['CASH', 'UPI', 'BANK']

  const save = async () => {
    if (!bill || saving) return
    if (!ok) return setError(problem || te('returnNothing'))
    if (date < bill.date) return setError(te('returnBeforeBill', { date: formatDate(bill.date) }))
    setSaving(true); setError('')
    try {
      const r = await services.returns.create({ invoiceId: bill.id, date, lines: want, settlement: settle, reason: reason.trim() })
      toast.success(t(r.waiting ? 'returns.savedOffline' : 'returns.saved', { number: r.number, amount: formatINR(r.totals.grandTotal) }))
      onChanged()
      setPrinting(r)
      setQty(bill.lines.map(() => '')); setReason('')
      void load(bill)
    } catch (e) { setError(errorText(te, e)) } finally { setSaving(false) }
  }
  useHotkey('mod+enter', () => void save(), { scope: 'modal', enabled: open && !printing && !cancelling })

  const doCancel = async () => {
    const r = cancelling
    setCancelling(undefined)
    if (!r || !bill) return
    try {
      await services.returns.cancel(r.id)
      toast.success(t('returns.cancelled', { number: r.number || formatINR(r.totals.grandTotal) }))
      onChanged()
      void load(bill)
    } catch (e) { toast.error(errorText(te, e)) }
  }

  if (!bill) return null
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('returns.title', { number: bill.number })}
      width="760px"
      footer={<><Button onClick={onClose}>{t('returns.close')}</Button><Button variant="primary" hotkey="mod+enter" onClick={() => void save()} disabled={saving || !canWrite || nothingLeft}>{t('returns.save')}</Button></>}
    >
      <p className="mb-3 text-base text-ink-600">{t('returns.intro', { party: bill.partyName, date: formatDate(bill.date), amount: formatINR(bill.totals.grandTotal) })}</p>

      {nothingLeft ? <p className="mb-3 rounded bg-sunken px-3 py-2">{t('returns.nothingLeft')}</p> : (
        <>
          <table className="mb-2 w-full border-collapse text-base">
            <thead>
              <tr className="border-b border-line text-left text-sm text-ink-600">
                <th className="py-1 pr-2 font-medium">{t('returns.item')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('returns.sold')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('returns.left')}</th>
                <th className="w-28 py-1 text-right font-medium">{t('returns.back')}</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-1 pr-2">{l.name}</td>
                  <td className="num py-1 pr-2 text-right">{formatQty(l.qty)} {l.unit}</td>
                  <td className="num py-1 pr-2 text-right">{formatQty(left[i]!)}</td>
                  <td className="py-1 text-right">
                    <Input aria-label={t('returns.backFor', { name: l.name })} inputMode="decimal" className="num !h-8 text-right" disabled={left[i] === 0} placeholder="0"
                      value={qty[i] ?? ''} onChange={(e) => { const v = e.target.value; setQty((q) => q.map((x, n) => (n === i ? v : x))); setError('') }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mb-3" onClick={() => setQty(left.map((x) => (x > 0 ? String(x) : '')))}>{t('returns.all')}</Button>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label={t('returns.date')}><Input type="date" value={date} min={bill.date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={t('returns.reason')}><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t('returns.reasonPlaceholder')} /></Field>
          </div>
          <div className="mb-3">
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('returns.settle')}</span>
            <Segmented label={t('returns.settle')} value={settle} onChange={setSettle} options={settlements.map((s) => ({ value: s, label: t(`returns.settleShort.${s}`) }))} />
            <p className="mt-1 text-sm text-ink-400">{t(`returns.settleHint.${settle}`)}</p>
            {bill.payment === 'CREDIT' && bill.partyId && settle !== 'ADJUST' && <p role="alert" className="mt-1 rounded bg-warn-soft px-2 py-1 text-sm text-warn">{t('returns.creditRefundWarn')}</p>}
          </div>

          <div className="mb-3 rounded bg-sunken px-3 py-2" aria-live="polite">
            {ok ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-base">
                <span>{t('returns.taxable')} <span className="num">{formatAmount(ok.totals.taxable)}</span></span>
                {bill.taxApplicable && <span>{t('returns.tax')} <span className="num">{formatAmount(ok.totals.cgst + ok.totals.sgst + ok.totals.igst)}</span></span>}
                <span className="ml-auto font-medium">{t('returns.total')} <span className="num text-lg">{formatINR(ok.totals.grandTotal)}</span></span>
              </div>
            ) : <span className="text-ink-400">{problem || t('returns.pick')}</span>}
          </div>
          {error && <p role="alert" className="mb-3 text-danger">{error}</p>}
        </>
      )}

      <h3 className="mb-1 mt-4 text-base font-medium">{t('returns.made')}</h3>
      {listError && <p className="text-sm text-danger">{listError}</p>}
      {list.length === 0 && !listError && <p className="text-sm text-ink-400">{t('returns.none')}</p>}
      <ul className="divide-y divide-line">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2">
            <span className="font-mono">{r.number || t('returns.notSent')}</span>
            <span className="text-ink-600">{formatDate(r.date)} · {t(`returns.settleShort.${r.settlement}`)}</span>
            {r.status === 'CANCELLED' && <Badge tone="danger">{t('status.cancelled')}</Badge>}
            {r.waiting && <Badge tone="warn">{t('sync.notSynced', { ns: 'common' })}</Badge>}
            <span className="num ml-auto font-medium">{formatINR(r.totals.grandTotal)}</span>
            <Button onClick={() => setPrinting(r)}>{t('returns.print')}</Button>
            {r.status === 'ACTIVE' && <Button disabled={!canWrite} onClick={() => setCancelling(r)}>{t('returns.cancel')}</Button>}
          </li>
        ))}
      </ul>

      <CreditNoteModal ret={printing} settings={settings} onClose={() => setPrinting(undefined)} />
      <ConfirmDialog open={!!cancelling} danger title={t('returns.cancelTitle')} confirmLabel={t('returns.cancel')} onConfirm={() => void doCancel()} onCancel={() => setCancelling(undefined)}>
        {cancelling && t(cancelling.settlement === 'ADJUST' ? 'returns.cancelBodyAdjust' : 'returns.cancelBody', { amount: formatINR(cancelling.totals.grandTotal) })}
      </ConfirmDialog>
    </Drawer>
  )
}
