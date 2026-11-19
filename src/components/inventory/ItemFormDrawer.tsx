import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { useHotkey } from '@/lib/hotkeys'
import { enterAsTab, focusFirstError } from '@/lib/formNav'
import { draftFromItem, emptyDraft, formatExpiryInput, msgText, nextItemCode, validateItemDraft, type ItemDraft, type ItemErrors } from '@/lib/itemForm'
import { parseRupees } from '@/lib/money'
import { services, GST_SLABS, UNITS, type Item } from '@/services'
import { useAsync } from '@/lib/useAsync'
import { toast } from '@/store/toast'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Modal'
import { Field, Input, Select } from '../ui/Field'

interface Props {
  open: boolean
  /** Present = edit mode. */
  item?: Item
  /** Pre-fill the name (used by billing's F2 quick-add in Phase 3). */
  initialName?: string
  existingItems: Item[]
  onClose: () => void
  onSaved: (item: Item) => void
}

export function ItemFormDrawer({ open, item, initialName, existingItems, onClose, onSaved }: Props) {
  const { t } = useTranslation('inventory')
  const err = (k: keyof ItemDraft) => (errors[k] ? msgText(t, errors[k]!, 'inventory') : undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const listId = useId()
  const codes = useMemo(() => existingItems.map((i) => i.code), [existingItems])
  const categories = useMemo(() => [...new Set(existingItems.map((i) => i.category).filter(Boolean))].sort(), [existingItems])
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft('ITM-1001'))
  const [errors, setErrors] = useState<ItemErrors>({})
  const [saving, setSaving] = useState(false)
  const editing = !!item
  const { data: settings } = useAsync(() => services.settings.get())
  const gstOn = settings?.gstEnabled !== false

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(item ? draftFromItem(item) : { ...emptyDraft(nextItemCode(codes)), name: initialName ?? '', gstPercent: settings?.gstEnabled === false ? '0' : '12' })
    // codes intentionally excluded: only seed the draft when the drawer opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, settings?.gstEnabled])

  const set = (k: keyof ItemDraft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = k === 'expiry' ? formatExpiryInput(e.target.value) : e.target.value
    setDraft((d) => ({ ...d, [k]: v }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }

  const { warnings } = validateItemDraft(draft, codes.filter((c) => c !== item?.code))
  const issue = parseRupees(draft.issueRate)
  const cost = parseRupees(draft.purchaseRate)
  const margin = issue && cost && issue > 0 ? ((issue - cost) / issue) * 100 : null

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const res = validateItemDraft(draft, codes.filter((c) => c !== item?.code))
    setErrors(res.errors)
    if (!res.value) return focusFirstError(formRef.current, Object.keys(res.errors))
    setSaving(true)
    try {
      const saved = item
        ? await services.inventory.updateItem(item.id, (({ currentStock: _s, ...rest }) => (void _s, rest))(res.value))
        : await services.inventory.createItem(res.value)
      toast.success(t(item ? 'form.updated' : 'form.added', { name: saved.name }))
      onSaved(saved)
    } catch (e2) {
      toast.error(errorText(t, e2, t('form.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  useHotkey('mod+enter', () => submit(), { scope: 'modal', enabled: open })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? t('form.titleEdit') : t('form.titleNew')}
      width="520px"
      footer={
        <>
          <Button onClick={onClose}>{t('form.cancel')}</Button>
          <Button variant="primary" hotkey="mod+enter" onClick={() => submit()} disabled={saving}>{editing ? t('form.saveChanges') : t('form.addItem')}</Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} onKeyDown={enterAsTab} noValidate className="grid grid-cols-2 gap-x-3 gap-y-3">
        <div className="col-span-2">
          <Field label={t('form.name')} error={err('name')}>
            <Input name="name" value={draft.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} />
          </Field>
        </div>
        <Field label={t('form.code')} error={err('code')} hint={t('form.codeHint')}>
          <Input name="code" value={draft.code} onChange={set('code')} className="font-mono" />
        </Field>
        <Field label={t('form.category')}>
          <Input name="category" value={draft.category} onChange={set('category')} list={listId} />
          <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={t('form.hsn')} error={err('hsn')}>
          <Input name="hsn" value={draft.hsn} onChange={set('hsn')} inputMode="numeric" maxLength={8} className="font-mono" />
        </Field>
        <Field label={t('form.unit')}>
          <Select name="unit" value={draft.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
        </Field>
        <Field label={t('form.batchNo')}>
          <Input name="batchNo" value={draft.batchNo} onChange={set('batchNo')} className="font-mono" />
        </Field>
        <Field label={t('form.expiry')} error={err('expiry')}>
          <Input name="expiry" value={draft.expiry} onChange={set('expiry')} placeholder="08/27" inputMode="numeric" className="font-mono" />
        </Field>
        <Field label={t('form.mrp')} error={err('mrp')}>
          <Input name="mrp" value={draft.mrp} onChange={set('mrp')} inputMode="decimal" className="num" />
        </Field>
        <Field label={t('form.purchaseRate')} error={err('purchaseRate')}>
          <Input name="purchaseRate" value={draft.purchaseRate} onChange={set('purchaseRate')} inputMode="decimal" className="num" />
        </Field>
        <Field label={t('form.issueRate')} error={err('issueRate')} hint={margin !== null ? t('form.margin', { pct: margin.toFixed(1) }) : undefined}>
          <Input name="issueRate" value={draft.issueRate} onChange={set('issueRate')} inputMode="decimal" className="num" />
        </Field>
        {gstOn && <Field label={t('form.gst')} error={err('gstPercent')}>
          <Select name="gstPercent" value={draft.gstPercent} onChange={set('gstPercent')}>{GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}</Select>
        </Field>}
        <Field label={editing ? t('form.currentStock') : t('form.openingStock')} error={err('currentStock')} hint={editing ? t('form.stockHint') : undefined}>
          <Input name="currentStock" value={draft.currentStock} onChange={set('currentStock')} inputMode="decimal" disabled={editing} className="num" />
        </Field>
        <Field label={t('form.lowStock')} error={err('lowStockThreshold')}>
          <Input name="lowStockThreshold" value={draft.lowStockThreshold} onChange={set('lowStockThreshold')} inputMode="decimal" className="num" />
        </Field>
        {warnings.length > 0 && (
          <ul className="col-span-2 space-y-1 rounded border border-line bg-warn-soft px-3 py-2 text-sm text-warn">
            {warnings.map((w) => <li key={w.key}>{msgText(t, w, 'inventory')}</li>)}
          </ul>
        )}
      </form>
    </Drawer>
  )
}
