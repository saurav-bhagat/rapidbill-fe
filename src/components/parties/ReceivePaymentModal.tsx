import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { formatINR, todayISO } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { parseRupees, toRupees } from '@/lib/money'
import { services, type Party, type Receipt, type ReceiptMode } from '@/services'
import { toast } from '@/store/toast'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'

interface Props {
  open: boolean
  party?: Party
  onClose: () => void
  onSaved: (r: Receipt) => void
}

/** Money received from a party: lowers what they owe. Paying more than is owed is allowed and shows as an advance. */
export function ReceivePaymentModal({ open, party, onClose, onSaved }: Props) {
  const { t } = useTranslation('parties')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<ReceiptMode>('CASH')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setAmount(''); setMode('CASH'); setDate(todayISO()); setNote(''); setError('') } }, [open, party?.id])

  const paise = parseRupees(amount)
  const valid = paise !== null && paise > 0
  const after = party && valid ? party.balance - paise : undefined

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!party || saving) return
    if (!valid) return setError(t('receive.badAmount'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) return setError(t('receive.badDate'))
    setError('')
    setSaving(true)
    try {
      const r = await services.receipts.create({ partyId: party.id, date, amount: paise, mode, note: note.trim() })
      toast.success(t(r.waiting ? 'receive.savedOffline' : 'receive.saved', { amount: formatINR(paise), name: party.name, number: r.number }))
      onSaved(r)
    } catch (err) {
      setError(errorText(t, err, t('receive.failed')))
    } finally { setSaving(false) }
  }
  useHotkey('mod+enter', () => submit(), { scope: 'modal', enabled: open })

  if (!party) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('receive.title', { name: party.name })}
      width="460px"
      footer={<><Button onClick={onClose}>{t('form.cancel')}</Button><Button variant="primary" hotkey="mod+enter" onClick={() => submit()} disabled={saving}>{t('receive.save')}</Button></>}
    >
      <form onSubmit={submit} noValidate className="space-y-3">
        <p className="text-base text-ink-600">
          {party.balance > 0 ? t('receive.owes', { amount: formatINR(party.balance) }) : party.balance < 0 ? t('receive.advance', { amount: formatINR(-party.balance) }) : t('receive.nothingOwed')}
        </p>
        <Field label={t('receive.amount')} error={error}>
          <div className="flex gap-2">
            <Input name="amount" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} inputMode="decimal" placeholder="0" autoFocus className="num" aria-invalid={!!error} />
            {party.balance > 0 && <Button type="button" onClick={() => { setAmount(String(toRupees(party.balance))); setError('') }}>{t('receive.fullBalance')}</Button>}
          </div>
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">{t('receive.how')}</span>
          <Segmented label={t('receive.how')} value={mode} onChange={setMode} options={[{ value: 'CASH', label: t('receive.mode.CASH') }, { value: 'UPI', label: t('receive.mode.UPI') }, { value: 'BANK', label: t('receive.mode.BANK') }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('receive.date')}><Input type="date" name="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('receive.note')}><Input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        </div>
        {after !== undefined && (
          <p className="rounded bg-sunken px-3 py-2 text-base" aria-live="polite">
            {after > 0 ? t('receive.after', { amount: formatINR(after) }) : after < 0 ? t('receive.afterAdvance', { amount: formatINR(-after) }) : t('receive.afterClear')}
          </p>
        )}
      </form>
    </Modal>
  )
}
