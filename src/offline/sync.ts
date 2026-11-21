import type { Item, Party, Settings, Voucher } from '@/services/types'
import { api } from '@/services/http/client'
import { AppError } from '@/services/errors'
import type { Mirror } from './db'
import { listOutbox, flushOutbox, refreshOutboxState } from './outbox'
import { noticeSent, noticeServerTrouble } from './notices'
import { bumpVersion, onOthers, setSync, useSync } from './state'

/** Bills kept on the device (older ones are read from the server when online). */
export const HISTORY_DAYS = 30

interface Feed {
  epoch: number
  cursor: string
  hasMore: boolean
  items: Item[]
  parties: Party[]
  settings: Settings | null
  vouchers: Voucher[]
  deleted: { parties: string[] }
  serverTime?: string
  /** Highest bill number used in each series, e.g. { "SI-2026": 123 }. */
  numbering?: Record<string, number>
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** 30 days back, or the first of this month if that is earlier, so "this month" on Home is always complete. */
export const historyFrom = (now = new Date()) => {
  const back = new Date(now); back.setDate(back.getDate() - HISTORY_DAYS)
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return isoDay(first < back ? first : back)
}

/**
 * Bring the device copy up to date. Safe to repeat: rows are saved by id, and progress is stored after every page,
 * so an interrupted download carries on where it stopped. If the server says its data was reset (epoch changed), start over.
 */
export async function pull(mirror: Mirror, now = new Date()): Promise<{ changed: boolean }> {
  let changed = false
  let restarts = 0
  let epoch = await mirror.getMeta<number>('epoch')
  let cursor = await mirror.getMeta<string>('cursor')
  let first = true

  for (;;) {
    const feed = await api<Feed>('/sync/changes', { timeoutMs: 20_000, query: { cursor, fresh: first && cursor ? '1' : '0', limit: 500, voucherFrom: historyFrom(now) } })

    if (epoch !== undefined && feed.epoch !== epoch) {
      if (++restarts > 2) throw new AppError('serverError')
      await mirror.clear()
      epoch = undefined; cursor = undefined; first = true; changed = true
      continue
    }
    first = false

    if (feed.items.length) await mirror.putMany('items', feed.items)
    if (feed.parties.length) await mirror.putMany('parties', feed.parties)
    if (feed.vouchers.length) await mirror.putMany('vouchers', feed.vouchers)
    if (feed.settings) await mirror.putMany('settings', [feed.settings])
    if (feed.deleted.parties.length) await mirror.deleteMany('parties', feed.deleted.parties)
    if (feed.items.length || feed.parties.length || feed.vouchers.length || feed.settings || feed.deleted.parties.length) changed = true

    if (feed.serverTime) setSync({ clockSkewMs: Date.parse(feed.serverTime) - Date.now() })
    epoch = feed.epoch
    cursor = feed.cursor
    if (feed.numbering) await mirror.setMeta('numbering', feed.numbering)
    await mirror.setMeta('epoch', epoch)
    await mirror.setMeta('cursor', cursor)
    if (!feed.hasMore) break
  }

  // Drop bills that have aged out of the window.
  const from = historyFrom(now)
  const waiting = new Set((await listOutbox(mirror)).map((e) => e.id)) // never drop a bill that has not reached the server
  const old = (await mirror.all<Voucher>('vouchers')).filter((v) => v.date < from && !waiting.has(v.id)).map((v) => v.id)
  if (old.length) { await mirror.deleteMany('vouchers', old); changed = true }

  await mirror.setMeta('lastSyncAt', now.toISOString())
  return { changed }
}

let mirrorRef: Mirror | null = null
let running: Promise<void> | null = null
let troubleTold = false
let again = false

/** Use `m` for all device-copy reads and writes. The previous one, if any, is closed. */
export const attachMirror = (m: Mirror | null) => {
  if (mirrorRef && mirrorRef !== m) mirrorRef.close()
  mirrorRef = m
  if (m) void refreshOutboxState(m)
}
export const currentMirror = (): Mirror => {
  if (!mirrorRef) throw new AppError('serverError')
  return mirrorRef
}
export const hasMirror = () => mirrorRef !== null

/**
 * Pull now, or after the pull in progress if one is already running (a write that finished while a pull was in flight
 * is then still picked up). Never throws: a failure just marks the server unreachable.
 */
export function syncNow(): Promise<void> {
  if (!mirrorRef) return Promise.resolve()
  if (running) { again = true; return running }
  const m = mirrorRef
  running = (async () => {
    setSync({ syncing: true })
    try {
      do {
        again = false
        // Bills made here go up first. While any are still waiting, do not download: that would put back the stock they already took.
        const { sent, unreachable, why } = await flushOutbox(m)
        if (sent) { bumpVersion(); noticeSent(sent) }
        troubleTold = false
        if (unreachable) {
          // Only a missing connection means "offline". A server fault or an expired login is something else and is told differently.
          if (why === 'networkError') setSync({ online: false })
          else if ((why === 'serverError' || why === 'rateLimited') && !troubleTold) { troubleTold = true; noticeServerTrouble() }
          break
        }
        const stillWaiting = (await listOutbox(m)).some((e) => e.status === 'pending')
        if (stillWaiting) break
        const { changed } = await pull(m)
        if (changed || sent) bumpVersion()
        setSync({ online: true, lastSyncAt: new Date().toISOString() })
      } while (again)
    } catch (e) {
      if (e instanceof AppError && e.key === 'networkError') setSync({ online: false })
      else if (!troubleTold) { troubleTold = true; noticeServerTrouble() } // once per spell of trouble, not every minute
    } finally {
      setSync({ syncing: false })
      running = null
    }
  })()
  return running
}

/** True once the device copy has been downloaded at least once. */
export const hasSyncedBefore = async (m: Mirror) => (await m.getMeta<string>('lastSyncAt')) !== undefined

/** Keep the copy fresh: when the connection comes back, when the tab is shown again, and every minute while open. */
export function startBackgroundSync(): () => void {
  const tick = () => { if (document.visibilityState === 'visible') void syncNow() }
  const goOffline = () => setSync({ online: false })
  window.addEventListener('online', tick)
  window.addEventListener('offline', goOffline)
  document.addEventListener('visibilitychange', tick)
  const id = window.setInterval(tick, 60_000)
  // Another tab changed the data or the queue: show it here too.
  const stopOthers = onOthers((what) => {
    if (what === 'data') useSync.setState((s) => ({ version: s.version + 1 }))
    if (mirrorRef) void refreshOutboxState(mirrorRef, false)
  })
  return () => {
    stopOthers()
    window.removeEventListener('online', tick)
    window.removeEventListener('offline', goOffline)
    document.removeEventListener('visibilitychange', tick)
    window.clearInterval(id)
  }
}
