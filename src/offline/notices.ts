import i18n from '@/i18n'
import { toast } from '@/store/toast'
import { onConnectivity, useSync } from './state'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { ns: 'common', ...opts })

/** Plain-language messages for the things that happen behind the scenes: losing the connection, getting it back, bills sent, trouble. */
export function startNotices(): () => void {
  const stop = onConnectivity((online) => { if (online) toast.success(t('sync.toast.online')); else toast.warning(t('sync.toast.offline')) })
  if (!useSync.getState().online) toast.warning(t('sync.toast.offline')) // the app was opened with no connection
  return stop
}

export const noticeSent = (count: number) => { if (count > 0) toast.success(t('sync.toast.sent', { count })) }
export const noticeRefused = (count: number) => { if (count > 0) toast.error(t('sync.toast.refused', { count })) }
export const noticeServerTrouble = () => toast.warning(t('sync.toast.serverTrouble'))
