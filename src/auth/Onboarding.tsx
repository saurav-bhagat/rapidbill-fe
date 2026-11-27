import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { checkGstin, STATES } from '@/lib/gst'
import { BUSINESS_TYPES, services, type BusinessType } from '@/services'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useAuth } from './session'

/** Step 2 of creating an account: where the business is. Everything but the state is optional, and the whole step can be skipped. */
export function Onboarding() {
  const { t } = useTranslation('auth')
  const { t: tType } = useTranslation('settings')
  const finish = useAuth((s) => s.finishOnboarding)
  const business = useAuth((s) => s.workspace?.name)
  const [v, setV] = useState<{ address: string; stateCode: string; gstin: string; phone: string; noGst: boolean; businessType: BusinessType | '' }>({ businessType: '', address: '', stateCode: '', gstin: '', phone: '', noGst: false })
  const [errs, setErrs] = useState<{ stateCode?: string; gstin?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof v>) => { setV((x) => ({ ...x, ...patch })); setErrs({}); setFormError('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const gstin = v.gstin.trim().toUpperCase()
    const g = gstin ? checkGstin(gstin) : {}
    const bad: typeof errs = {}
    if (!v.stateCode) bad.stateCode = t('onboarding.stateNeeded')
    if (gstin && !v.noGst && 'error' in g && g.error) bad.gstin = g.errorKey ? t(g.errorKey, { ns: 'errors', ...g.params }) : g.error
    else if (gstin && !v.noGst && g.stateCode && g.stateCode !== v.stateCode) bad.stateCode = t('onboarding.stateMismatch', { code: g.stateCode })
    setErrs(bad)
    if (Object.keys(bad).length) return
    setBusy(true)
    try {
      await services.settings.save({ businessType: v.businessType, address: v.address.trim(), stateCode: v.stateCode, phone: v.phone.trim(), ...(v.noGst ? { gstEnabled: false } : gstin ? { gstin } : {}) })
      finish()
    } catch (err) { setFormError(errorText(t, err)); setBusy(false) }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-paper p-6">
      <div className="w-full max-w-lg rounded-xl bg-surface p-8 shadow-card">
        <div className="text-sm font-medium uppercase tracking-wide text-primary">{t('onboarding.step')}</div>
        <h1 className="mt-1 text-2xl font-medium">{t('onboarding.title')}</h1>
        <p className="mb-5 mt-1 text-base text-ink-600">{t('onboarding.sub', { name: business })}</p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t('onboarding.type')}>
            <Select name="businessType" value={v.businessType} onChange={(e) => set({ businessType: e.target.value as BusinessType | '' })}>
              <option value="">{tType('business.typeSelect')}</option>
              {BUSINESS_TYPES.map((k) => <option key={k} value={k}>{tType(`businessTypes.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('onboarding.address')}><Textarea name="address" rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} /></Field>
          <Field label={t('onboarding.state')} error={errs.stateCode}>
            <Select name="stateCode" value={v.stateCode} onChange={(e) => set({ stateCode: e.target.value })}>
              <option value="">{t('onboarding.statePlaceholder')}</option>
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </Select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-base">
            <input type="checkbox" checked={v.noGst} onChange={(e) => set({ noGst: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            {t('onboarding.noGst')}
          </label>
          {!v.noGst && (
            <Field label={t('onboarding.gstin')} error={errs.gstin} hint={t('onboarding.gstinHint')}>
              <Input name="gstin" value={v.gstin} onChange={(e) => { const g = e.target.value.toUpperCase().replace(/\s/g, ''); const r = g.length === 15 ? checkGstin(g) : {}; set({ gstin: g, ...(r.stateCode ? { stateCode: r.stateCode } : {}) }) }} maxLength={15} className="font-mono uppercase" />
            </Field>
          )}
          <Field label={t('onboarding.phone')}><Input name="phone" value={v.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" maxLength={20} /></Field>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={finish} className="h-11 rounded px-3 text-base font-medium text-ink-600 hover:bg-sunken">{t('onboarding.skip')}</button>
            <Button type="submit" variant="primary" className="h-11 px-6 text-base" disabled={busy}>{busy ? t('working') : t('onboarding.continue')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
