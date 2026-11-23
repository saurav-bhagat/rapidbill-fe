import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
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
import { forgetRef, normalizeRef, savedRef } from '@/earn/refLink'
import { api } from '@/services/http/client'
import { AppError } from '@/services/errors'
import { ForgotPassword } from './ForgotPassword'
import { useAuth } from './session'

type Mode = 'login' | 'signup'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function AuthScreen({ initialMode = 'login' }: { initialMode?: Mode }) {
  const { t } = useTranslation('auth')
  const { login, signup, notice } = useAuth()
  const unsent = useSync((s) => s.pendingIds.length + s.failedIds.length)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [v, setV] = useState({ email: '', password: '', name: '', businessName: '' })
  const [errs, setErrs] = useState<Partial<Record<keyof typeof v | 'referralCode', string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  // a referral code from a link (?ref=) is already filled in; otherwise it is asked for only when the person says they have one
  const [ref, setRef] = useState(savedRef)
  const [refOpen, setRefOpen] = useState(() => savedRef() !== '')
  const [refState, setRefState] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')
  const set = (k: keyof typeof v, val: string) => { setV((x) => ({ ...x, [k]: val })); setErrs((e) => ({ ...e, [k]: undefined })); setFormError('') }

  // look the code up as it is typed (a malformed one is wrong at once, without asking the server)
  useEffect(() => {
    const typed = ref.trim()
    if (!typed) { setRefState('idle'); return }
    const code = normalizeRef(typed)
    if (!code) { setRefState('bad'); return }
    setRefState('checking')
    let live = true
    const id = setTimeout(() => {
      api<{ valid: boolean }>(`/referral/check?code=${encodeURIComponent(code)}`, { auth: false })
        .then((r) => { if (live) setRefState(r.valid ? 'ok' : 'bad') })
        .catch(() => { if (live) setRefState('idle') }) // offline or busy: the server decides when the account is made
    }, 450)
    return () => { live = false; clearTimeout(id) }
  }, [ref])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const bad: typeof errs = {}
    if (!EMAIL.test(v.email.trim())) bad.email = t('errors.email')
    if (mode === 'signup') {
      if (v.password.length < 8) bad.password = t('errors.password')
      if (!v.name.trim()) bad.name = t('errors.name')
      if (!v.businessName.trim()) bad.businessName = t('errors.businessName')
      if (ref.trim() && refState === 'bad') bad.referralCode = t('referral.notFound')
    } else if (!v.password) bad.password = t('errors.password')
    setErrs(bad)
    const first = Object.keys(bad)[0]
    if (first) { document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return }
    setBusy(true)
    try {
      if (mode === 'login') { await login(v.email.trim(), v.password); toast.success(t('welcomeBack', { name: useAuth.getState().user?.name ?? '' })) }
      else { const code = normalizeRef(ref); await signup({ email: v.email.trim(), password: v.password, name: v.name.trim(), businessName: v.businessName.trim(), ...(code && { referralCode: code }) }); forgetRef(); toast.success(t('accountCreated')) }
    } catch (err) {
      if (err instanceof AppError && err.key === 'referralCodeUnknown') { setErrs((x) => ({ ...x, referralCode: errorText(t, err) })); setRefState('bad'); setRefOpen(true) }
      else setFormError(errorText(t, err))
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
        {forgot ? <ForgotPassword initialEmail={v.email} onBack={() => setForgot(false)} onDone={(email) => { setV((x) => ({ ...x, email, password: '' })); setForgot(false) }} /> : <>
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
          {mode === 'signup' && (refOpen ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-600">{t('referral.label')}</span>
              <Input name="referralCode" value={ref} onChange={(e) => { setRef(e.target.value); setErrs((x) => ({ ...x, referralCode: undefined })) }} placeholder={t('referral.placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={30} className="font-mono uppercase tracking-wider" aria-describedby="ref-status" />
              <span id="ref-status" role="status" className="mt-1 block text-sm">
                {errs.referralCode ? <span className="text-danger">{errs.referralCode}</span>
                  : refState === 'ok' ? <span className="inline-flex items-center gap-1 font-medium text-ok"><Check size={14} />{t('referral.applied')}</span>
                    : refState === 'bad' ? <span className="text-danger">{t('referral.notFound')}</span>
                      : refState === 'checking' ? <span className="text-ink-400">{t('referral.checking')}</span>
                        : <span className="text-ink-400">{t('referral.hint')}</span>}
              </span>
            </label>
          ) : <div className="-mt-1"><button type="button" onClick={() => setRefOpen(true)} className="text-sm font-medium text-primary hover:underline">{t('referral.link')}</button></div>)}
          {mode === 'login' && <div className="-mt-2 text-right"><button type="button" onClick={() => setForgot(true)} className="text-sm font-medium text-primary hover:underline">{t('forgot.link')}</button></div>}
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <Button type="submit" variant="primary" className="h-12 w-full justify-center text-lg" disabled={busy}>
            {busy ? t('working') : mode === 'login' ? t('submitLogin') : t('submitSignup')}
          </Button>
        </form>
        </>}
      </div>
      <SupportLine className="mt-5 lg:hidden" />
      </main>
    </div>
  )
}
