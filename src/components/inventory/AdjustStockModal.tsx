import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { enterAsTab } from '@/lib/formNav'
import { formatQty } from '@/lib/format'
import { roundQty } from '@/lib/qty'
import { services, type Item } from '@/services'
import { toast } from '@/store/toast'
import { useHotkey } from '@/lib/hotkeys'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { sellingUnit, unitsOf } from '@/lib/units'
import { Modal } from '../ui/Modal'

interface Props { open: boolean; item?: Item; onClose: () => void; onSaved: () => void }

/** Stock-take style: type the physical count; we work out the difference and log it. */
export function AdjustStockModal({ open, item, onClose, onSaved }: Props) {
  const { t } = useTranslation('inventory')
  const [count, setCount] = useState('')
  /** The unit the physical count is typed in: the item's own unit, or one it is also sold in. */
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const countRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && item) { setUnit(item.unit); setCount(String(item.currentStock)); setNote(''); setError(''); setTimeout(() => countRef.current?.select(), 0) }
  }, [open, item])

  const per = item ? sellingUnit(item, unit)?.per ?? 1 : 1
  const typed = count.trim() === '' ? NaN : Number(count)
  const next = typed / per // the counted stock in the item's own unit
  const delta = item && Number.isFinite(next) ? roundQty(next - item.currentStock) : 0 // always in the item's own unit
  const changeUnit = (u: string) => {
    if (!item) return
    const p = sellingUnit(item, u)?.per ?? 1
    setUnit(u); setCount(String(roundQty(item.currentStock * p))); setError('')
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!item) return
    if (!Number.isFinite(next) || next < 0) return setError(t('adjust.errCount'))
    if (delta === 0) return setError(t('adjust.errSame'))
    try {
      await services.inventory.adjustStock(item.id, delta, note.trim() || 'Manual stock adjustment')
      toast.success(t('adjust.done', { name: item.name, qty: formatQty(next), unit: item.unit }))
      onSaved()
    } catch (err) {
      toast.error(errorText(t, err, t('adjust.failed')))
    }
  }
  useHotkey('mod+enter', () => submit(), { scope: 'modal', enabled: open })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('adjust.title')}
      width="440px"
      footer={<><Button onClick={onClose}>{t('adjust.cancel')}</Button><Button variant="primary" hotkey="mod+enter" onClick={() => submit()}>{t('adjust.save')}</Button></>}
    >
      {item && (
        <form onSubmit={submit} onKeyDown={enterAsTab} className="space-y-3">
          <p className="text-base"><span className="font-medium">{item.name}</span> <span className="font-mono text-ink-400">{item.code}</span></p>
          {(item.altUnits?.length ?? 0) > 0 && (
            <Field label={t('adjust.countIn')}>
              <Select value={unit} onChange={(e) => changeUnit(e.target.value)}>{unitsOf(item).map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-sm text-ink-400">{t('adjust.inSystem')}</div><div className="num !text-left text-lg">{formatQty(roundQty(item.currentStock * per))}</div></div>
            <Field label={t('adjust.physical', { unit })} error={error}>
              <Input ref={countRef} value={count} onChange={(e) => { setCount(e.target.value); setError('') }} inputMode="decimal" className="num" autoFocus />
            </Field>
            <div>
              <div className="text-sm text-ink-400">{t('adjust.difference')}</div>
              <div className={`num !text-left text-lg ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-danger' : 'text-ink-400'}`}>{delta > 0 ? '+' : ''}{formatQty(roundQty(delta * per))}</div>
            </div>
          </div>
          <Field label={t('adjust.reason')}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('adjust.reasonPlaceholder')} /></Field>
        </form>
      )}
    </Modal>
  )
}
