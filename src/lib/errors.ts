import type { TFunction } from 'i18next'
import { AppError } from '@/services/errors'

/** Message for any caught error in the user's language. Unknown errors fall back to `fallback` (already translated). */
export function errorText(t: TFunction, err: unknown, fallback?: string): string {
  if (err instanceof AppError) return t(err.key, { ns: 'errors', ...err.params })
  return fallback ?? t('unknown', { ns: 'errors' })
}
