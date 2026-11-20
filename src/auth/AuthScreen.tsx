import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { useAuth } from './session'

type Mode = 'login' | 'signup'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function AuthScreen() {
  const { t } = useTranslation('auth')
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [v, setV] = useState({ email: '', password: '', name: '', businessName: '' })
  const [errs, setErrs] = useState<Partial<Record<keyof typeof v, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v, val: string) => { setV((x) => ({ ...x, [k]: val })); setErrs((e) => ({ ...e, [k]: undefined })); setFormError('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const bad: typeof errs = {}
    if (!EMAIL.test(v.email.trim())) bad.email = t('errors.email')
    if (mode === 'signup') {
      if (v.password.length < 8) bad.password = t('errors.password')
      if (!v.name.trim()) bad.name = t('errors.name')
      if (!v.businessName.trim()) bad.businessName = t('errors.businessName')
    } else if (!v.password) bad.password = t('errors.password')
    setErrs(bad)
    const first = Object.keys(bad)[0]
    if (first) { document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return }
    setBusy(true)
    try {
      if (mode === 'login') await login(v.email.trim(), v.password)
      else await signup({ email: v.email.trim(), password: v.password, name: v.name.trim(), businessName: v.businessName.trim() })
    } catch (err) {
      setFormError(errorText(t, err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-paper p-6">
      <div className="absolute right-5 top-4"><LanguageSwitcher /></div>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">RapidBill</h1>
        <p className="mb-4 mt-1 text-sm text-ink-600">{t('tagline')}</p>
        <Segmented label={t('tabs.login')} value={mode} onChange={(m) => { setMode(m); setErrs({}); setFormError('') }} options={[{ value: 'login', label: t('tabs.login') }, { value: 'signup', label: t('tabs.signup') }]} />
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          {mode === 'signup' && (
            <>
              <Field label={t('name')} error={errs.name}><Input name="name" value={v.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} /></Field>
              <Field label={t('businessName')} error={errs.businessName}><Input name="businessName" value={v.businessName} onChange={(e) => set('businessName', e.target.value)} autoComplete="organization" maxLength={120} /></Field>
            </>
          )}
          <Field label={t('email')} error={errs.email}><Input name="email" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" autoFocus maxLength={254} /></Field>
          <Field label={t('password')} error={errs.password} hint={mode === 'signup' ? t('passwordHint') : undefined}>
            <Input name="password" type="password" value={v.password} onChange={(e) => set('password', e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} maxLength={128} />
          </Field>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
            {busy ? t('working') : mode === 'login' ? t('submitLogin') : t('submitSignup')}
          </Button>
        </form>
      </div>
    </div>
  )
}
