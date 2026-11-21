import { Component, type ReactNode } from 'react'
import i18n from '@/i18n'
import { SUPPORT_PHONE_DISPLAY, supportTel } from '@/lib/support'
import { useSync } from '@/offline/state'

/** Last line of defence: a render crash shows a way out instead of a blank page. Data in storage is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('Unhandled UI error', error) }
  render() {
    if (!this.state.error) return this.props.children
    const t = (k: string) => i18n.t(k, { ns: 'common' })
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-lg border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold">{t('errorBoundary.title')}</h1>
        <p className="mt-2 text-ink-600">{t('errorBoundary.body')}</p>
        {useSync.getState().pendingIds.length + useSync.getState().failedIds.length > 0 && <p className="mt-2 text-ink-600">{t('errorBoundary.safe')}</p>}
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-sunken p-2 font-mono text-xs text-ink-600">{this.state.error.message}</pre>
        <p className="mt-3 text-sm text-ink-600">{t('account.needHelp')} <a href={supportTel} className="font-mono font-medium text-primary underline">{SUPPORT_PHONE_DISPLAY}</a></p>
        <button onClick={() => window.location.assign(import.meta.env.BASE_URL)} className="mt-4 h-9 rounded bg-primary px-3 font-medium text-white hover:bg-primary-hover">{t('errorBoundary.reload')}</button>
      </div>
    )
  }
}
