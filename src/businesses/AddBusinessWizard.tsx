import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { switchBusiness } from '@/auth/switchBusiness'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { errorText } from '@/lib/errors'
import { checkGstin, STATES } from '@/lib/gst'
import { BUSINESS_TYPES } from '@/services'
import { createBusiness } from './api'
import { buildCreateBody, useBusinesses, type WizardAnswers } from './store'

const blank = (sourceId: string): WizardAnswers => ({ name: '', businessType: '', stateCode: '', gstin: '', address: '', start: 'EMPTY', copySettings: false, sourceId })
const newId = () => crypto.randomUUID()

/**
 * Three short steps in one dialog: name and type, where, what to start with. Every step after the first can be skipped.
 * If the plan does not allow another business, the dialog says why and points to the Plans page instead of asking questions.
 */
export function AddBusinessWizard() {
  const { t } = useTranslation('business')
  const { t: tType } = useTranslation('settings')
  const { t: tErr } = useTranslation()
  const { addOpen, setAddOpen, account, list } = useBusinesses()
  const current = list.find((b) => b.current)
  const mine = list.filter((b) => b.role === 'OWNER')
  const [step, setStep] = useState(1)
  const [a, setA] = useState<WizardAnswers>(blank(''))
  const [err, setErr] = useState<{ name?: string; gstin?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [id, setId] = useState(newId) // one id for the whole attempt, so pressing Create twice makes one business

  useEffect(() => { if (addOpen) { setStep(1); setA(blank(current?.role === 'OWNER' ? current.id : mine[0]?.id ?? '')); setErr({}); setId(newId()); void useBusinesses.getState().load() } }, [addOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { if (!busy) setAddOpen(false) }
  const set = (p: Partial<WizardAnswers>) => { setA((x) => ({ ...x, ...p })); setErr({}) }

  const blocked = account && !account.canAddBusiness
  if (blocked) {
    const key = account.status === 'EXPIRED' ? 'blocked.ended' : account.status === 'TRIAL' ? 'blocked.trial' : 'blocked.cap'
    return (
      <Modal open={addOpen} onClose={close} title={t('add.title')} width="440px"
        footer={<><Button onClick={close}>{t('add.cancel')}</Button>{account.status !== 'ACTIVE' && <Link to="/license" onClick={close}><Button variant="primary">{t('blocked.plans')}</Button></Link>}</>}>
        <p role="alert" className="text-base">{t(key, { n: account.maxBusinesses })}</p>
      </Modal>
    )
  }

  const next = (e?: FormEvent) => {
    e?.preventDefault()
    if (step === 1) { if (!a.name.trim()) { setErr({ name: t('add.nameNeeded') }); return } setStep(2) }
    else if (step === 2) {
      const g = a.gstin.trim().toUpperCase()
      if (g) {
        const r = checkGstin(g)
        if ('error' in r && r.error) { setErr({ gstin: r.errorKey ? tErr(r.errorKey, { ns: 'errors', ...r.params }) : r.error }); return }
        if (r.stateCode && a.stateCode && r.stateCode !== a.stateCode) { setErr({ gstin: tErr('gstinState', { ns: 'errors', code: r.stateCode }) }); return }
        if (r.stateCode && !a.stateCode) set({ stateCode: r.stateCode })
      }
      setStep(3)
    } else void create()
  }

  const skip = () => { if (step === 2) setA((x) => ({ ...x, stateCode: '', gstin: '', address: '' })); if (step === 3) setA((x) => ({ ...x, start: 'EMPTY', copySettings: false })); if (step < 3) setStep(step + 1); else void create(true) }

  async function create(empty = false) {
    if (busy) return
    setBusy(true)
    try {
      const body = buildCreateBody(id, empty ? { ...a, start: 'EMPTY', copySettings: false } : a)
      const made = await createBusiness(body)
      await useBusinesses.getState().load()
      setAddOpen(false)
      const row = useBusinesses.getState().list.find((b) => b.id === made.id)
      useBusinesses.setState({ switching: { id: made.id, name: made.name, color: row?.color ?? made.color } })
      try { await switchBusiness(made.id) } catch (e) { useBusinesses.setState({ switching: undefined }); throw e }
    } catch (e) {
      setErr({ form: errorText(tErr, e) })
      void useBusinesses.getState().load()
    } finally { setBusy(false) }
  }

  const last = step === 3
  return (
    <Modal open={addOpen} onClose={close} title={t('add.title')} width="520px"
      footer={
        <>
          {step > 1 && <Button onClick={() => setStep(step - 1)} disabled={busy}>{t('add.back')}</Button>}
          {step > 1 && <Button onClick={skip} disabled={busy}>{t('add.skip')}</Button>}
          <Button variant="primary" onClick={() => next()} disabled={busy}>{busy ? t('add.creating') : last ? t('add.create') : t('add.next')}</Button>
        </>
      }>
      <form onSubmit={next} noValidate className="space-y-4">
        <p className="text-sm font-medium text-ink-600" aria-live="polite">{t('add.step', { n: step, total: 3 })}</p>
        {step === 1 && (
          <>
            <Field label={t('add.name')} error={err.name}><Input autoFocus value={a.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} aria-label={t('add.name')} /></Field>
            <Field label={t('add.type')}>
              <Select value={a.businessType} onChange={(e) => set({ businessType: e.target.value })}>
                <option value="">{tType('business.typeSelect')}</option>
                {BUSINESS_TYPES.map((k) => <option key={k} value={k}>{tType(`businessTypes.${k}`)}</option>)}
              </Select>
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label={t('add.state')} hint={t('add.stateHint')}>
              <Select autoFocus value={a.stateCode} onChange={(e) => set({ stateCode: e.target.value })}>
                <option value="">{t('add.statePlaceholder')}</option>
                {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t('add.gstin')} error={err.gstin} hint={t('add.gstinHint')}>
              <Input value={a.gstin} maxLength={15} className="font-mono uppercase" onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            </Field>
            <Field label={t('add.address')}><Textarea rows={2} value={a.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} /></Field>
          </>
        )}
        {step === 3 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-ink-600">{t('add.startWith')}</legend>
            {(['EMPTY', 'ITEMS', 'ITEMS_PARTIES'] as const).map((k) => {
              const off = k !== 'EMPTY' && mine.length === 0
              return (
                <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 ${a.start === k ? 'border-primary bg-primary-soft' : 'border-line'} ${off ? 'opacity-50' : ''}`}>
                  <input type="radio" name="start" className="mt-1 accent-[rgb(var(--primary))]" checked={a.start === k} disabled={off} onChange={() => set({ start: k })} />
                  <span><span className="block font-medium">{t(`add.start.${k}.title`)}</span><span className="block text-sm text-ink-600">{t(`add.start.${k}.body`)}</span></span>
                </label>
              )
            })}
            {(a.start !== 'EMPTY' || a.copySettings) && mine.length > 1 && (
              <Field label={t('add.source')}>
                <Select value={a.sourceId} onChange={(e) => set({ sourceId: e.target.value })}>{mine.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              </Field>
            )}
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-base">
              <input type="checkbox" disabled={mine.length === 0} checked={a.copySettings} onChange={(e) => set({ copySettings: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--primary))]" />
              {t('add.copySettings')}
            </label>
            <p className="text-sm text-ink-600">{t('add.copyNote')}</p>
          </fieldset>
        )}
        {err.form && <p role="alert" className="text-sm text-danger">{err.form}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
