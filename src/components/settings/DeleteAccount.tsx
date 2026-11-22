import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { useBusinesses } from '@/businesses/store'
import { Button } from '@/components/ui/Button'
import { TypedConfirm } from '@/components/ui/TypedConfirm'
import { errorText } from '@/lib/errors'
import { unsentTotal, useDevices } from '@/offline/devices'

/**
 * The last thing on the Settings page, folded away: deleting the whole account. It lists what goes, what is kept, and any bills
 * not yet sent, then asks for the word DELETE and the password.
 */
export function DeleteAccount() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const deleteAccount = useAuth((s) => s.deleteAccount)
  const list = useBusinesses((s) => s.list)
  const owned = useMemo(() => list.filter((b) => b.role === 'OWNER'), [list]) // not filtered inside the selector: a new array every time would re-render forever
  const unsent = useDevices((s) => unsentTotal(s.all))
  const [open, setOpen] = useState(false)
  return (
    <details className="mt-10 border-t border-line pt-4 text-ink-600">
      <summary className="cursor-pointer select-none text-sm">{t('deleteAccount.summary')}</summary>
      <div className="mt-3 max-w-xl space-y-3 text-sm">
        <p>{t('deleteAccount.body')}</p>
        {owned.length > 0 && <ul className="list-disc pl-5">{owned.map((b) => <li key={b.id}>{b.name}</li>)}</ul>}
        <p>{t('deleteAccount.kept')}</p>
        <p>{t('deleteAccount.gst')}</p>
        {unsent > 0 && <p role="alert" className="font-medium text-warn">{t('deleteAccount.unsent', { count: unsent })}</p>}
        <Button variant="danger" onClick={() => setOpen(true)}>{t('deleteAccount.button')}</Button>
      </div>
      <TypedConfirm open={open} word="DELETE" title={t('deleteAccount.title')} confirmLabel={t('deleteAccount.confirm')} askPassword onCancel={() => setOpen(false)}
        onConfirm={async (pw) => { try { await deleteAccount(pw) } catch (e) { throw new Error(errorText(tc, e)) } }}>
        {t('deleteAccount.confirmBody', { count: owned.length })}
      </TypedConfirm>
    </details>
  )
}
