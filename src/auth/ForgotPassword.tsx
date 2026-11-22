import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { errorText } from '@/lib/errors'
import { api } from '@/services/http/client'
import { toast } from '@/store/toast'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_SECONDS = 60

/** Forgot password: ask for a code by email, then enter the code and a new password. The same screens whether or not the email has an account. */
export function ForgotPassword({ initialEmail, onDone, onBack }: { initialEmail: string; onDone: (email: string) => void; onBack: () => void }) {
  const { t } = useTranslation('auth')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [errs, setErrs] = useState<{ email?: string; code?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id) }, [wait])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (!EMAIL.test(email.trim())) { setErrs({ email: t('errors.email') }); return }
    setBusy(true); setFormError('')
    try {
      await api('/auth/forgot', { method: 'POST', body: { email: email.trim() }, auth: false })
      setStep('code'); setWait(RESEND_SECONDS)
    } catch (err) { setFormError(errorText(t, err)) } finally { setBusy(false) }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const bad: typeof errs = {}
    if (!/^\d{6}$/.test(code.trim())) bad.code = t('forgot.codeShape')
    if (password.length < 8) bad.password = t('errors.password')
    setErrs(bad)
    if (Object.keys(bad).length) return
    setBusy(true); setFormError('')
    try {
      await api('/auth/reset', { method: 'POST', body: { email: email.trim(), code: code.trim(), password }, auth: false })
      toast.success(t('forgot.done'))
      onDone(email.trim())
    } catch (err) { setFormError(errorText(t, err)); setBusy(false) }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 text-sm font-medium text-ink-600 hover:text-primary">← {t('forgot.back')}</button>
      <h1 className="text-3xl font-bold">{t('forgot.title')}</h1>
      {step === 'email' ? (
        <form onSubmit={send} noValidate className="mt-4 space-y-4">
          <p className="text-base text-ink-600">{t('forgot.sub')}</p>
          <Field label={t('email')} error={errs.email}><Input name="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrs({}); setFormError('') }} autoComplete="email" autoFocus maxLength={254} /></Field>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <Button type="submit" variant="primary" className="h-12 w-full justify-center text-lg" disabled={busy}>{busy ? t('working') : t('forgot.send')}</Button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate className="mt-4 space-y-4">
          <p className="text-base text-ink-600" role="status">{t('forgot.sent', { email: email.trim() })}</p>
          <Field label={t('forgot.code')} error={errs.code}>
            <Input name="code" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrs({}); setFormError('') }} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} className="font-mono text-xl tracking-[0.4em]" />
          </Field>
          <Field label={t('forgot.newPassword')} error={errs.password} hint={t('passwordHint')}>
            <Input name="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErrs({}); setFormError('') }} autoComplete="new-password" maxLength={128} />
          </Field>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <Button type="submit" variant="primary" className="h-12 w-full justify-center text-lg" disabled={busy}>{busy ? t('working') : t('forgot.change')}</Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" disabled={wait > 0 || busy} onClick={() => void send()} className="font-medium text-primary disabled:text-ink-400">{wait > 0 ? t('forgot.resendIn', { seconds: wait }) : t('forgot.resend')}</button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setFormError('') }} className="text-ink-600 hover:text-primary">{t('forgot.wrongEmail')}</button>
          </div>
        </form>
      )}
    </div>
  )
}
