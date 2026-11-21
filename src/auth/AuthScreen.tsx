import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { TextSizeControl } from '@/components/layout/TextSizeControl'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { SupportLine } from '@/components/SupportLine'
import { useSync } from '@/offline/state'
import { toast } from '@/store/toast'
import { go } from '@/landing/nav'
import { useAuth } from './session'

type Mode = 'login' | 'signup'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function AuthScreen({ initialMode = 'login' }: { initialMode?: Mode }) {
  const { t } = useTranslation('auth')
  const { login, signup, notice } = useAuth()
  const unsent = useSync((s) => s.pendingIds.length + s.failedIds.length)
  const [mode, setMode] = useState<Mode>(initialMode)
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
      if (mode === 'login') { await login(v.email.trim(), v.password); toast.success(t('welcomeBack', { name: useAuth.getState().user?.name ?? '' })) }
      else { await signup({ email: v.email.trim(), password: v.password, name: v.name.trim(), businessName: v.businessName.trim() }); toast.success(t('accountCreated')) }
    } catch (err) {
      setFormError(errorText(t, err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full bg-paper">
      <div className="absolute right-5 top-4 z-10 flex gap-2"><TextSizeControl /><LanguageSwitcher /></div>
      <aside className="hidden w-[44%] max-w-xl shrink-0 flex-col justify-between bg-nav p-12 text-white lg:flex">
        <div className="flex items-center gap-3 text-2xl font-bold"><span className="grid h-10 w-11 place-items-center rounded-lg bg-white text-xl text-primary">₹</span>RapidBill</div>
        <div>
          <p className="text-3xl font-bold leading-tight">{t('tagline')}</p>
          <ul className="mt-8 space-y-4 text-lg text-white/90">
            {(t('points', { returnObjects: true }) as string[]).map((p) => (
              <li key={p} className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-sm">✓</span>{p}</li>
            ))}
          </ul>
        </div>
        <SupportLine className="!text-white/80 [&_a]:!text-white" />
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card">
        <button type="button" onClick={() => go('/')} className="mb-4 text-sm font-medium text-ink-600 hover:text-primary">← Back to home</button>
        <h1 className="text-3xl font-bold">{mode === 'signup' ? t('createTitle') : t('welcome')}</h1>
        <p className="mb-6 mt-1 text-base text-ink-600">{mode === 'signup' ? t('createSub') : t('welcomeSub')}</p>
        {notice === 'expired' && (
          <p role="alert" className="mb-3 rounded border border-line bg-warn-soft px-3 py-2 text-sm text-warn">
            {t('sessionExpired')}{unsent > 0 && ` ${t('sessionExpiredUnsent', { count: unsent })}`}
          </p>
        )}
        <Segmented label={t('tabs.login')} value={mode} onChange={(m) => { setMode(m); go(m === 'signup' ? '/signup' : '/login', true); setErrs({}); setFormError('') }} options={[{ value: 'login', label: t('tabs.login') }, { value: 'signup', label: t('tabs.signup') }]} />
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
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
          <Button type="submit" variant="primary" className="h-12 w-full justify-center text-lg" disabled={busy}>
            {busy ? t('working') : mode === 'login' ? t('submitLogin') : t('submitSignup')}
          </Button>
        </form>
      </div>
      <SupportLine className="mt-5 lg:hidden" />
      </main>
    </div>
  )
}
