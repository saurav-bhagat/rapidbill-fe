import { useEffect, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGS, loadLocale, setLang, type Lang } from '@/i18n'
import { errorText } from '@/lib/errors'
import { checkGstin, STATES } from '@/lib/gst'
import { useHotkey } from '@/lib/hotkeys'
import { useAsync } from '@/lib/useAsync'
import { clearAllData, resetDemoData, services, type Settings } from '@/services'
import { LocalDataUpload } from '@/auth/LocalDataUpload'
import { DeviceData } from '@/components/settings/DeviceData'
import { apiEnabled } from '@/services/http/client'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { TypedConfirm } from '@/components/ui/TypedConfirm'

type Errors = Partial<Record<keyof Settings, string>>

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
  const { data: saved, reload } = useAsync(() => services.settings.get())
  const [d, setD] = useState<Settings>()
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [danger, setDanger] = useState<'reset' | 'clear'>()

  useEffect(() => { if (saved) setD(saved) }, [saved])
  const dirty = !!d && !!saved && JSON.stringify(d) !== JSON.stringify(saved)
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
    if (!/^[A-Za-z0-9]{1,6}$/.test(d.invoicePrefix)) e.invoicePrefix = t('errors.prefix')
    if (d.upiId && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(d.upiId)) e.upiId = t('errors.upi')
    if (d.bankIfsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(d.bankIfsc)) e.bankIfsc = t('errors.ifsc')
    setErrors(e)
    if (Object.keys(e).length) { document.querySelector<HTMLElement>(`[name="${Object.keys(e)[0]}"]`)?.focus(); return }
    setSaving(true)
    try {
      await services.settings.save({ ...d, companyName: d.companyName.trim(), gstin: d.gstin.trim().toUpperCase(), invoicePrefix: d.invoicePrefix.toUpperCase(), bankIfsc: d.bankIfsc.toUpperCase() })
      await loadLocale(d.printLanguage)
      toast.success(t('footer.toastSaved'))
      reload()
    } catch (err) { toast.error(errorText(t, err, t('footer.saveFailed'))) }
    finally { setSaving(false) }
  }
  useHotkey('mod+s', save, { scope: 'list' })

  if (!d) return <div className="p-6 text-ink-400">{t('loading')}</div>
  const txt = (k: 'companyName' | 'phone' | 'invoicePrefix' | 'bankName' | 'bankAccount' | 'bankIfsc' | 'upiId', label: string, extra?: { hint?: string; mono?: boolean }) => (
    <Field label={label} error={errors[k]} hint={extra?.hint}>
      <Input name={k} value={d[k]} onChange={(e) => set(k, e.target.value)} className={extra?.mono ? 'font-mono' : ''} aria-invalid={!!errors[k]} />
    </Field>
  )

  return (
    <div className="mx-auto max-w-5xl">
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

      <Section title={t('business.title')} hint={t('business.hint')}>
        <div className="col-span-2">{txt('companyName', t('business.companyName'))}</div>
        <div className="col-span-2"><Field label={t('business.address')}><Textarea name="address" rows={2} value={d.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
        {txt('phone', t('business.phone'))}
        <Field label={d.gstEnabled ? t('business.gstinRequired') : t('business.gstinOptional')} error={errors.gstin} hint={!errors.gstin && gst.warning ? (gst.warningKey ? t(gst.warningKey, { ns: 'errors' }) : gst.warning) : undefined}>
          <Input name="gstin" value={d.gstin} onChange={(e) => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); set('gstin', v); const r = checkGstin(v); if (r.stateCode) set('stateCode', r.stateCode) }} maxLength={15} className="font-mono uppercase" aria-invalid={!!errors.gstin} />
        </Field>
        <Field label={t('business.state')} error={errors.stateCode} hint={d.gstEnabled ? t('business.stateHintGst') : t('business.stateHintNonGst')}>
          <Select name="stateCode" value={d.stateCode} onChange={(e) => set('stateCode', e.target.value)}>{STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</Select>
        </Field>
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

      <Section title={t('bank.title')} hint={t('bank.hint')}>
        <div className="col-span-2">{txt('bankName', t('bank.bankName'))}</div>
        {txt('bankAccount', t('bank.account'), { mono: true })}
        {txt('bankIfsc', t('bank.ifsc'), { mono: true })}
        {txt('upiId', t('bank.upi'), { hint: t('bank.upiHint') })}
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

      <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-3 border-t border-line bg-paper/95 px-5 py-3">
        <span className="text-sm text-ink-600" role="status">{dirty ? t('footer.unsaved') : t('footer.saved')}</span>
        <Button onClick={() => { setD(saved); setErrors({}) }} disabled={!dirty}>{t('footer.discard')}</Button>
        <Button variant="primary" hotkey="mod+s" onClick={save} disabled={!dirty || saving}>{t('footer.save')}</Button>
      </div>

      <TypedConfirm open={danger === 'reset'} word="RESET" title={t('data.resetTitle')} confirmLabel={t('data.resetConfirm')} onCancel={() => setDanger(undefined)} askPassword={apiEnabled} onConfirm={async (pw) => { try { await resetDemoData(pw) } catch (e) { throw new Error(errorText(t, e)) } window.location.reload() }}>
        {t('data.resetBody')}
      </TypedConfirm>
      <TypedConfirm open={danger === 'clear'} word="DELETE" title={t('data.clearTitle')} confirmLabel={t('data.clearConfirm')} onCancel={() => setDanger(undefined)} askPassword={apiEnabled} onConfirm={async (pw) => { try { await clearAllData(pw) } catch (e) { throw new Error(errorText(t, e)) } window.location.reload() }}>
        {t('data.clearBody')}
      </TypedConfirm>
      <ConfirmDialog open={blocker.state === 'blocked'} title={t('leave.title')} confirmLabel={t('leave.confirm')} danger onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} onCancel={() => blocker.state === 'blocked' && blocker.reset()}>
        {t('leave.body')}
      </ConfirmDialog>
    </div>
  )
}
