import { useEffect, useState, type ReactNode } from 'react'
import { useReportUnsaved } from '@/businesses/unsaved'
import { useBlocker, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGS, loadLocale, setLang, type Lang } from '@/i18n'
import { errorText } from '@/lib/errors'
import { setFlash } from '@/lib/flash'
import { checkGstin, STATES } from '@/lib/gst'
import { useHotkey } from '@/lib/hotkeys'
import { invoiceFieldsOf } from '@/lib/invoiceFields'
import { useAsync } from '@/lib/useAsync'
import { BUSINESS_TYPES, clearAllData, resetDemoData, services, type InvoiceFieldKey, type Settings } from '@/services'
import { LocalDataUpload } from '@/auth/LocalDataUpload'
import { DeviceData } from '@/components/settings/DeviceData'
import { DeleteAccount } from '@/components/settings/DeleteAccount'
import { apiEnabled } from '@/services/http/client'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/Button'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { TypedConfirm } from '@/components/ui/TypedConfirm'

type Errors = Partial<Record<keyof Settings, string>>
type Tab = 'general' | 'profile' | 'invoice'
const PROFILE_KEYS = ['companyName', 'address', 'phone', 'email', 'pan', 'gstin', 'stateCode', 'bankName', 'bankAccount', 'bankIfsc', 'upiId']
const FIELD_GROUPS: { title: string; keys: InvoiceFieldKey[] }[] = [
  { title: 'columns', keys: ['hsn', 'batchExpiry', 'mrp', 'unit', 'baseQty', 'discount', 'taxable'] },
  { title: 'header', keys: ['companyPhone', 'companyEmail', 'companyPan', 'partyGstin', 'partyAddress', 'placeOfSupply', 'reverseCharge', 'paymentMode', 'paymentDetails'] },
  { title: 'summary', keys: ['hsnSummary', 'amountInWords'] },
  { title: 'footer', keys: ['bank', 'upi', 'upiQr', 'terms', 'signature'] },
]

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[220px_1fr] gap-8 border-b border-line py-5 last:border-b-0">
      <div><h2 className="text-lg font-semibold">{title}</h2>{hint && <p className="mt-1 text-sm text-ink-600">{hint}</p>}</div>
      <div className="grid max-w-2xl grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation('settings')
  const { t: tAuth } = useTranslation('auth')
  const { data: saved, error: loadError, reload } = useAsync(() => services.settings.get())
  const [d, setD] = useState<Settings>()
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [danger, setDanger] = useState<'reset' | 'clear'>()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'profile' ? 'profile' : 'general')

  useEffect(() => { if (saved) setD(saved) }, [saved])
  const dirty = !!d && !!saved && JSON.stringify(d) !== JSON.stringify(saved)
  useReportUnsaved('settings', dirty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setD((x) => (x ? { ...x, [k]: v } : x)); setErrors((e) => ({ ...e, [k]: undefined })) }
  const gst = d ? checkGstin(d.gstin) : {}

  const save = async () => {
    if (!d || saving) return
    const e: Errors = {}
    if (!d.companyName.trim()) e.companyName = t('errors.companyName')
    if (!d.gstin.trim()) { if (d.gstEnabled) e.gstin = t('errors.gstinNeeded') }
    else if (gst.error) e.gstin = gst.errorKey ? t(gst.errorKey, { ns: 'errors', ...gst.params }) : gst.error
    else if (gst.stateCode && gst.stateCode !== d.stateCode) e.stateCode = t('errors.stateMismatch', { code: gst.stateCode })
    if (d.gstEnabled && !d.stateCode) e.stateCode = t('errors.stateNeeded')
    if (!/^[A-Za-z0-9]{1,5}$/.test(d.invoicePrefix)) e.invoicePrefix = t('errors.prefix')
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = t('errors.email')
    if (d.pan && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(d.pan)) e.pan = t('errors.pan')
    if (d.upiId && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(d.upiId)) e.upiId = t('errors.upi')
    if (d.bankIfsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(d.bankIfsc)) e.bankIfsc = t('errors.ifsc')
    setErrors(e)
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0]!
      setTab(PROFILE_KEYS.includes(first) ? 'profile' : 'general')
      setTimeout(() => document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(), 0)
      return
    }
    setSaving(true)
    try {
      await services.settings.save({ ...d, companyName: d.companyName.trim(), gstin: d.gstin.trim().toUpperCase(), invoicePrefix: d.invoicePrefix.toUpperCase(), bankIfsc: d.bankIfsc.toUpperCase(), pan: (d.pan ?? '').toUpperCase(), email: (d.email ?? '').trim(), invoiceFields: invoiceFieldsOf(d) })
      await loadLocale(d.printLanguage)
      toast.success(t('footer.toastSaved'))
      reload()
    } catch (err) { toast.error(errorText(t, err, t('footer.saveFailed'))) }
    finally { setSaving(false) }
  }
  useHotkey('mod+s', save, { scope: 'list' })

  if (!d) return loadError ? <LoadFailed error={loadError} onRetry={reload} /> : <div className="p-6 text-ink-400">{t('loading')}</div>
  const txt = (k: 'companyName' | 'phone' | 'email' | 'pan' | 'invoicePrefix' | 'bankName' | 'bankAccount' | 'bankIfsc' | 'upiId', label: string, extra?: { hint?: string; mono?: boolean }) => (
    <Field label={label} error={errors[k]} hint={extra?.hint}>
      <Input name={k} value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={extra?.mono ? 'font-mono' : ''} aria-invalid={!!errors[k]} />
    </Field>
  )

  return (
    <div className="mx-auto max-w-5xl">
      <div role="tablist" className="mb-2 flex gap-1 border-b border-line">
        {(['general', 'profile', 'invoice'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-base font-semibold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-ink-600 hover:text-ink-900'}`}>{t(`tabs.${k}`)}</button>
        ))}
      </div>

      {tab === 'general' && <>
      <Section title={t('language.title')} hint={t('language.hint')}>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">{t('language.screen')}</span>
          <Segmented label={t('language.screen')} value={i18n.language as Lang} onChange={(v) => void setLang(v)} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">{t('language.print')}</span>
          <Segmented label={t('language.print')} value={d.printLanguage} onChange={(v) => set('printLanguage', v)} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
        <p className="col-span-2 text-sm text-ink-600">{t('language.printHint')}</p>
      </Section>

      <Section title={t('tax.title')} hint={t('tax.hint')}>
        <div className="col-span-2">
          <Segmented label={t('tax.businessType')} value={d.gstEnabled ? 'GST' : 'NONGST'} onChange={(v) => set('gstEnabled', v === 'GST')} options={[{ value: 'GST', label: t('tax.gst') }, { value: 'NONGST', label: t('tax.nonGst') }]} />
          <p className="mt-2 text-sm text-ink-600">
            {d.gstEnabled
              ? t('tax.gstOn')
              : t('tax.gstOff')}
          </p>
        </div>
      </Section>

      <Section title={t('billing.title')} hint={t('billing.hint')}>
        {txt('invoicePrefix', t('billing.prefix'), { hint: t('billing.prefixHint'), mono: true })}
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">{t('billing.defaultType')}</span>
          <Segmented label={t('billing.defaultType')} value={d.defaultTaxMode} onChange={(v) => set('defaultTaxMode', v)} options={[{ value: 'TAX_INVOICE', label: d.gstEnabled ? t('billing.taxInvoice') : t('billing.invoice') }, { value: 'CHALLAN', label: t('billing.challan') }]} />
        </div>
        <label className="col-span-2 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={d.roundOffDefault} onChange={(e) => set('roundOffDefault', e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
          {t('billing.roundOff')}
        </label>
      </Section>

      <Section title={t('printing.title')}>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-600">{t('printing.paper')}</span>
          <Segmented label={t('printing.paperLabel')} value={d.paperSize} onChange={(v) => set('paperSize', v)} options={[{ value: 'A4', label: t('printing.a4') }, { value: 'A5', label: t('printing.a5') }]} />
        </div>
      </Section>

      {apiEnabled && (
        <Section title={t('device.title', { ns: 'common' })}>
          <DeviceData />
        </Section>
      )}

      {apiEnabled && (
        <Section title={tAuth('migrate.settingsTitle')}>
          <LocalDataUpload variant="settings" />
        </Section>
      )}

      <Section title={t('data.title')} hint={t('data.hint')}>
        <div className="col-span-2 flex flex-wrap gap-3">
          <Button onClick={() => setDanger('reset')}>{t('data.reset')}</Button>
          <Button variant="danger" onClick={() => setDanger('clear')}>{t('data.clear')}</Button>
        </div>
        <p className="col-span-2 text-sm text-ink-600">{t('data.explain')}</p>
      </Section>

      </>}

      {tab === 'profile' && <>
      <Section title={t('business.title')} hint={t('business.hint')}>
        <div className="col-span-2">{txt('companyName', t('business.companyName'))}</div>
        <div className="col-span-2">
          <Field label={t('business.type')} hint={t('business.typeHint')}>
            <Select name="businessType" value={d.businessType ?? ''} onChange={(e) => set('businessType', e.target.value as Settings['businessType'])}>
              <option value="">{t('business.typeSelect')}</option>
              {BUSINESS_TYPES.map((k) => <option key={k} value={k}>{t(`businessTypes.${k}`)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="col-span-2"><Field label={t('business.address')}><Textarea name="address" rows={2} value={d.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
        {txt('phone', t('business.phone'))}
        {txt('email', t('business.email'))}
        {txt('pan', t('business.pan'), { mono: true })}
        <Field label={d.gstEnabled ? t('business.gstinRequired') : t('business.gstinOptional')} error={errors.gstin} hint={!errors.gstin && gst.warning ? (gst.warningKey ? t(gst.warningKey, { ns: 'errors' }) : gst.warning) : undefined}>
          <Input name="gstin" value={d.gstin} onChange={(e) => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); set('gstin', v); const r = checkGstin(v); if (r.stateCode) set('stateCode', r.stateCode) }} maxLength={15} className="font-mono uppercase" aria-invalid={!!errors.gstin} />
        </Field>
        <Field label={t('business.state')} error={errors.stateCode} hint={d.gstEnabled ? t('business.stateHintGst') : t('business.stateHintNonGst')}>
          <Select name="stateCode" value={d.stateCode} onChange={(e) => set('stateCode', e.target.value)}><option value="">{t('business.stateSelect')}</option>{STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</Select>
        </Field>
      </Section>

      <Section title={t('bank.title')} hint={t('bank.hint')}>
        <div className="col-span-2">{txt('bankName', t('bank.bankName'))}</div>
        {txt('bankAccount', t('bank.account'), { mono: true })}
        {txt('bankIfsc', t('bank.ifsc'), { mono: true })}
        {txt('upiId', t('bank.upi'), { hint: t('bank.upiHint') })}
      </Section>

      </>}

      {tab === 'invoice' && <>
        <p className="py-4 text-base text-ink-600">{t('invoiceFields.intro')}</p>
        {FIELD_GROUPS.map((g) => (
          <Section key={g.title} title={t(`invoiceFields.groups.${g.title}`)}>
            {g.keys.map((k) => (
              <label key={k} className="col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-sunken">
                <span>{t(`invoiceFields.keys.${k}`)}</span>
                <input type="checkbox" checked={invoiceFieldsOf(d)[k]} onChange={(e) => set('invoiceFields', { ...invoiceFieldsOf(d), [k]: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--primary))]" />
              </label>
            ))}
            {g.title === 'footer' && (
              <div className="col-span-2">
                <Field label={t('invoiceFields.termsLabel')} hint={t('invoiceFields.termsHint')}>
                  <Textarea name="terms" rows={3} maxLength={500} value={d.terms ?? ''} onChange={(e) => set('terms', e.target.value)} placeholder={t('invoiceFields.termsPlaceholder')} />
                </Field>
              </div>
            )}
          </Section>
        ))}
        <p className="pb-4 text-sm text-ink-600">{t('invoiceFields.alwaysShown')}</p>
      </>}

      <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-3 border-t border-line bg-paper/95 px-5 py-3">
        <span className="text-sm text-ink-600" role="status">{dirty ? t('footer.unsaved') : t('footer.saved')}</span>
        <Button onClick={() => { setD(saved); setErrors({}) }} disabled={!dirty}>{t('footer.discard')}</Button>
        <Button variant="primary" hotkey="mod+s" onClick={save} disabled={!dirty || saving}>{t('footer.save')}</Button>
      </div>

      {apiEnabled && <DeleteAccount />}

      <TypedConfirm open={danger === 'reset'} word="RESET" title={t('data.resetTitle')} confirmLabel={t('data.resetConfirm')} onCancel={() => setDanger(undefined)} askPassword={apiEnabled} onConfirm={async (pw) => { try { await resetDemoData(pw) } catch (e) { throw new Error(errorText(t, e)) } setFlash('resetDone'); window.location.reload() }}>
        {t('data.resetBody')}
      </TypedConfirm>
      <TypedConfirm open={danger === 'clear'} word="DELETE" title={t('data.clearTitle')} confirmLabel={t('data.clearConfirm')} onCancel={() => setDanger(undefined)} askPassword={apiEnabled} onConfirm={async (pw) => { try { await clearAllData(pw) } catch (e) { throw new Error(errorText(t, e)) } setFlash('clearDone'); window.location.reload() }}>
        {t('data.clearBody')}
      </TypedConfirm>
      <ConfirmDialog open={blocker.state === 'blocked'} title={t('leave.title')} confirmLabel={t('leave.confirm')} danger onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} onCancel={() => blocker.state === 'blocked' && blocker.reset()}>
        {t('leave.body')}
      </ConfirmDialog>
    </div>
  )
}
