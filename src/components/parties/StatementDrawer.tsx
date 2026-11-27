import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { reminderText } from '@/lib/statement'
import { billWhatsAppLink } from '@/lib/whatsapp'
import { useAsync } from '@/lib/useAsync'
import { formatAmount, formatDate, formatINR, todayISO } from '@/lib/format'
import { useSync } from '@/offline/state'
import { services, type Party, type Receipt, type Statement } from '@/services'
import { toast } from '@/store/toast'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Select } from '../ui/Field'
import { Drawer } from '../ui/Modal'
import { StatementView } from '../print/StatementView'

type Range = 'fy' | 'd90' | 'all'

/** First day of the Indian financial year (1 April) that `today` falls in. */
const fyStart = (today: string) => { const y = Number(today.slice(0, 4)); return `${Number(today.slice(5, 7)) >= 4 ? y : y - 1}-04-01` }
const rangeOf = (r: Range): { from?: string } => {
  const today = todayISO()
  if (r === 'fy') return { from: fyStart(today) }
  if (r === 'd90') { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - 90); return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` } }
  return {}
}

interface Props {
  open: boolean
  party?: Party
  onClose: () => void
  onReceive: () => void
  /** false after the plan ends: payments cannot be recorded or cancelled. */
  canWrite?: boolean
  /** Called after a receipt was cancelled, so the party list shows the new balance. */
  onChanged: () => void
}

const Sum = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="rounded border border-line px-3 py-2">
    <div className="text-sm text-ink-600">{label}</div>
    <div className={`num text-lg ${strong ? 'font-medium' : 'font-medium'}`}>{value}</div>
  </div>
)

/** What a party owes, row by row: bills, money received, cancellations and corrections, with a running balance. */
export function StatementDrawer({ open, party, onClose, onReceive, onChanged, canWrite = true }: Props) {
  const { t } = useTranslation('parties')
  const version = useSync((s) => s.version)
  const [range, setRange] = useState<Range>('fy')
  const [data, setData] = useState<Statement>()
  const [waiting, setWaiting] = useState<Receipt[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState<{ id: string; number: string; amount?: number }>()

  const load = useCallback(async () => {
    if (!party) return
    setLoading(true); setError('')
    try {
      // receipts made here with no connection are shown even when the statement itself cannot be loaded
      const mine = (await services.receipts.listForParty(party.id).catch(() => [])).filter((r) => r.waiting)
      setWaiting(mine)
      setData(await services.receipts.statement(party.id, rangeOf(range)))
    } catch (e) {
      setData(undefined); setError(errorText(t, e, t('statement.failed')))
    } finally { setLoading(false) }
  }, [party, range, t])

  useEffect(() => { if (open) void load() }, [open, load, version])
  const { data: settings } = useAsync(() => (open ? services.settings.get() : Promise.resolve(undefined)), [open])

  // the printout is A4 with its own margins (the page itself has none)
  useEffect(() => {
    if (!open) return
    const el = document.createElement('style')
    el.textContent = '@page { size: A4; margin: 0; }'
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [open])

  // the reminder uses the balance on this device, so a payment saved here and not sent yet already counts
  const remind = party && settings ? reminderText(party, settings.companyName, settings.upiId, todayISO(), (k, o) => t(`statement.${k}`, o ?? {})) : ''
  const sendReminder = () => { if (remind && party) window.open(billWhatsAppLink(party.phone, remind), '_blank', 'noopener') }

  const doCancel = async () => {
    const c = cancelling
    setCancelling(undefined)
    if (!c) return
    try {
      await services.receipts.cancel(c.id)
      toast.success(t('statement.cancelled', { number: c.number }))
      onChanged()
      void load()
    } catch (e) { toast.error(errorText(t, e, t('statement.cancelFailed'))) }
  }

  // a payment that was already cancelled shows its own cancellation row, so it must not offer Cancel again
  const cancelled = new Set((data?.rows ?? []).filter((r) => r.type === 'RECEIPT_CANCEL' && r.receiptId).map((r) => r.receiptId))
  const label = (r: Statement['rows'][number]) => {
    const base = t(`statement.type.${r.type}`)
    return r.number ? `${base} · ${r.number}` : base
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={party ? t('statement.title', { name: party.name }) : ''}
      width="760px"
      footer={<>
        <Button icon={<Printer size={14} />} onClick={() => window.print()} disabled={!data || !settings}>{t('statement.print')}</Button>
        <Button icon={<MessageCircle size={14} />} onClick={sendReminder} disabled={!remind} title={remind ? undefined : t('statement.noDue')}>{t('statement.remind')}</Button>
        <span className="flex-1" />
        <Button onClick={onClose}>{t('statement.close')}</Button><Button variant="primary" onClick={onReceive} disabled={!canWrite}>{t('statement.receive')}</Button>
      </>}
    >
      <div className="mb-3 flex items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="!w-56" aria-label={t('statement.range')}>
          <option value="fy">{t('statement.fy')}</option>
          <option value="d90">{t('statement.d90')}</option>
          <option value="all">{t('statement.all')}</option>
        </Select>
        {loading && <span className="text-sm text-ink-400">{t('statement.loading')}</span>}
      </div>

      {waiting.length > 0 && (
        <div className="mb-3 rounded border border-warn/40 bg-warn/10 p-3">
          <p className="mb-2 text-base font-medium">{t('statement.waitingTitle')}</p>
          <ul className="space-y-1">
            {waiting.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-base">
                <span>{formatINR(r.amount)} · {t(`receive.mode.${r.mode}`)} · {formatDate(r.date)}</span>
                <Button disabled={!canWrite} onClick={() => setCancelling({ id: r.id, number: formatINR(r.amount) })}>{t('statement.cancel')}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded border border-danger/40 p-3 text-base">
          <p className="text-danger">{error}</p>
          <Button className="mt-2" onClick={() => void load()}>{t('statement.retry')}</Button>
        </div>
      )}

      {data && (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2">
            <Sum label={t('statement.opening')} value={formatINR(data.opening)} />
            <Sum label={t('statement.billed')} value={formatINR(data.debit)} />
            <Sum label={t('statement.received')} value={formatINR(data.credit)} />
            <Sum label={data.closing >= 0 ? t('statement.closing') : t('statement.closingAdvance')} value={formatINR(Math.abs(data.closing))} strong />
          </div>
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="border-b border-line text-left text-sm text-ink-600">
                <th className="py-1 pr-2 font-medium">{t('statement.date')}</th>
                <th className="py-1 pr-2 font-medium">{t('statement.details')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('statement.debit')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('statement.credit')}</th>
                <th className="py-1 text-right font-medium">{t('statement.balance')}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink-400">{t('statement.empty')}</td></tr>}
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="py-1 pr-2">
                    <div>{label(r)}</div>
                    {r.type === 'BILL' && (r.paidNow ?? 0) > 0 && r.billTotal !== undefined && <div className="text-sm text-ink-600">{t('statement.partPaid', { total: formatINR(r.billTotal), paid: formatINR(r.paidNow ?? 0) })}</div>}
                    {r.type === 'BILL_CANCEL' && r.paidKept !== undefined && (r.paidNow ?? 0) > 0 && <div className="text-sm text-ink-600">{t(r.paidKept ? 'statement.paidKept' : 'statement.paidBack', { paid: formatINR(r.paidNow ?? 0) })}</div>}
                    {r.note && <div className="text-sm text-ink-600">{r.note}</div>}
                  </td>
                  <td className="num py-1 pr-2 text-right">{r.debit ? formatAmount(r.debit) : ''}</td>
                  <td className="num py-1 pr-2 text-right">{r.credit ? formatAmount(r.credit) : ''}</td>
                  <td className="num py-1 text-right">{formatAmount(r.balance)}</td>
                  <td className="py-1 text-right">
                    {r.type === 'RECEIPT' && r.receiptId && !cancelled.has(r.receiptId) && <Button disabled={!canWrite} onClick={() => setCancelling({ id: r.receiptId!, number: r.number ?? '' })}>{t('statement.cancel')}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.some((r) => r.type.endsWith('CANCEL')) && <p className="mt-2 text-sm text-ink-400"><Badge tone="neutral">{t('statement.note')}</Badge> {t('statement.cancelNote')}</p>}
        </>
      )}

      <ConfirmDialog open={!!cancelling} danger title={t('statement.cancelTitle')} confirmLabel={t('statement.cancel')} onConfirm={doCancel} onCancel={() => setCancelling(undefined)}>
        {t('statement.cancelBody', { number: cancelling?.number ?? '' })}
      </ConfirmDialog>
      {open && data && settings && createPortal(<div id="print-root" className="hidden"><StatementView st={data} settings={settings} today={todayISO()} /></div>, document.body)}
    </Drawer>
  )
}
