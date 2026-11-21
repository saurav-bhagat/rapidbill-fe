import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { Button } from './Button'

/** Shown in place of a screen whose data could not be loaded, with a way to try again. */
export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('errors')
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center">
      <h2 className="text-lg font-semibold">{t('loadFailedTitle')}</h2>
      <p className="mt-2 text-ink-600">{errorText(t, error, t('loadFailed'))}</p>
      <Button className="mt-4" variant="primary" icon={<RotateCw size={14} />} onClick={onRetry}>{t('retry')}</Button>
    </div>
  )
}
