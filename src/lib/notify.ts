import type { TFunction } from 'i18next'
import i18n from '@/i18n'
import { AppError } from '@/services/errors'
import { toast } from '@/store/toast'
import { errorText } from './errors'

const tr = () => i18n.t.bind(i18n) as unknown as TFunction

/** Show any caught error as a message in the person's language. For places with no screen of their own to put it on. */
export function reportError(err: unknown, fallback?: string): void {
  if (err instanceof DOMException && err.name === 'AbortError') return // a request we cancelled ourselves
  if (err instanceof AppError && err.key === 'networkError') { toast.warning(errorText(tr(), err)); return }
  toast.error(errorText(tr(), err, fallback))
}

/** Last-resort listeners: a failure nobody handled still tells the person something went wrong, and is kept in the console for us. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection', e.reason)
    reportError(e.reason)
  })
  window.addEventListener('error', (e) => {
    if (/ResizeObserver loop/.test(e.message)) return // harmless browser noise
    console.error('Unhandled error', e.error ?? e.message)
    toast.error(i18n.t('unknown', { ns: 'errors' }))
  })
}

const recent = new Map<string, number>()
/**
 * A screen's data could not be loaded. Several loads on one page often fail together for the same reason, so the same
 * message is shown once per few seconds instead of once per load.
 */
export function reportLoadError(err: unknown): void {
  const key = err instanceof AppError ? err.key : String((err as Error)?.message ?? err)
  const at = recent.get(key) ?? 0
  if (Date.now() - at < 5000) return
  recent.set(key, Date.now())
  reportError(err, i18n.t('loadFailed', { ns: 'errors' }))
}
