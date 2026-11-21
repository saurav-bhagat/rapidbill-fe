import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { isWaiting } from '@/lib/saved'
import { checkGstin, STATES } from '@/lib/gst'
import { enterAsTab, focusFirstError } from '@/lib/formNav'
import { useHotkey } from '@/lib/hotkeys'
import { parseRupees, toRupees } from '@/lib/money'
import { services, type Party, type PartyType } from '@/services'
import { toast } from '@/store/toast'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Drawer } from '../ui/Modal'

interface Draft { name: string; type: PartyType; gstin: string; stateCode: string; phone: string; address: string; balance: string }
const empty: Draft = { name: '', type: 'CUSTOMER', gstin: '', stateCode: '', phone: '', address: '', balance: '' }
const fromParty = (p: Party): Draft => ({ name: p.name, type: p.type, gstin: p.gstin, stateCode: p.stateCode, phone: p.phone, address: p.address, balance: p.balance ? String(toRupees(p.balance)) : '' })

interface Props {
  open: boolean
  party?: Party
  existing: Party[]
  /** Default state for new parties (the seller's own state). */
  defaultState?: string
  onClose: () => void
  onSaved: (p: Party) => void
}

export function PartyFormDrawer({ open, party, existing, defaultState = '', onClose, onSaved }: Props) {
  const { t } = useTranslation('parties')
  const ref = useRef<HTMLFormElement>(null)
  const [d, setD] = useState<Draft>(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setErrors({}); setD(party ? fromParty(party) : { ...empty, stateCode: defaultState }) }
  }, [open, party, defaultState])

  const gst = checkGstin(d.gstin)
  const set = (k: keyof Draft, v: string) => {
    setD((x) => {
      const next = { ...x, [k]: v }
      if (k === 'gstin') {
        next.gstin = v.toUpperCase().replace(/\s/g, '')
        const r = checkGstin(next.gstin)
        if (r.stateCode) next.stateCode = r.stateCode // GSTIN's first two digits are the state
      }
      return next
    })
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const errs: typeof errors = {}
    const name = d.name.trim()
    if (!name) errs.name = t('form.nameRequired')
    else if (existing.some((p) => p.id !== party?.id && p.name.toLowerCase() === name.toLowerCase())) errs.name = t('form.nameExists')
    if (gst.error) errs.gstin = gst.errorKey ? t(gst.errorKey, { ns: 'errors', ...gst.params }) : gst.error
    if (!d.stateCode) errs.stateCode = t('form.stateRequired')
    else if (d.gstin && gst.stateCode && gst.stateCode !== d.stateCode) errs.stateCode = t('form.stateMismatch')
    let balance = 0
    if (d.balance.trim()) {
      const b = parseRupees(d.balance)
      if (b === null) errs.balance = t('form.invalidAmount')
      else balance = b
    }
    setErrors(errs)
    if (Object.keys(errs).length) return focusFirstError(ref.current, Object.keys(errs))
    setSaving(true)
    try {
      const data = { name, type: d.type, gstin: d.gstin, stateCode: d.stateCode, phone: d.phone.trim(), address: d.address.trim(), balance }
      const saved = party ? await services.parties.update(party.id, data) : await services.parties.create(data)
      toast.success(t(isWaiting(saved.id) ? (party ? 'toast.updatedOffline' : 'toast.addedOffline') : (party ? 'toast.updated' : 'toast.added'), { name: saved.name }))
      onSaved(saved)
    } catch (err) {
      toast.error(errorText(t, err, t('toast.saveFailed')))
    } finally { setSaving(false) }
  }
  useHotkey('mod+enter', () => submit(), { scope: 'modal', enabled: open })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={party ? t('form.editTitle') : t('form.newTitle')}
      width="480px"
      footer={<><Button onClick={onClose}>{t('form.cancel')}</Button><Button variant="primary" hotkey="mod+enter" onClick={() => submit()} disabled={saving}>{party ? t('form.saveChanges') : t('form.addParty')}</Button></>}
    >
      <form ref={ref} onSubmit={submit} onKeyDown={enterAsTab} noValidate className="grid grid-cols-2 gap-x-3 gap-y-3">
        <div className="col-span-2">
          <Field label={t('form.name')} error={errors.name}><Input name="name" value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        </div>
        <Field label={t('form.type')}>
          <Select name="type" value={d.type} onChange={(e) => set('type', e.target.value)}>
            <option value="CUSTOMER">{t('type.customer')}</option><option value="DEPARTMENT">{t('type.department')}</option><option value="BRANCH">{t('type.branch')}</option>
          </Select>
        </Field>
        <Field label={t('form.phone')}><Input name="phone" value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></Field>
        <div className="col-span-2">
          <Field label={t('form.gstin')} error={errors.gstin} hint={!errors.gstin && gst.warning ? (gst.warningKey ? t(gst.warningKey, { ns: 'errors', ...gst.params }) : gst.warning) : t('form.gstinHint')}>
            <Input name="gstin" value={d.gstin} onChange={(e) => set('gstin', e.target.value)} maxLength={15} className="font-mono uppercase" />
          </Field>
        </div>
        <Field label={t('form.state')} error={errors.stateCode}>
          <Select name="stateCode" value={d.stateCode} onChange={(e) => set('stateCode', e.target.value)}>
            <option value="">{t('form.stateSelect')}</option>
            {STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
          </Select>
        </Field>
        <Field label={t('form.balance')} error={errors.balance} hint={t('form.balanceHint')}>
          <Input name="balance" value={d.balance} onChange={(e) => set('balance', e.target.value)} inputMode="decimal" className="num" />
        </Field>
        <div className="col-span-2"><Field label={t('form.address')}><Textarea name="address" rows={3} value={d.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
      </form>
    </Drawer>
  )
}
