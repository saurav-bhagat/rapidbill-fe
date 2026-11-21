import i18n from '@/i18n'
import { download } from '@/lib/download'
import { toast } from '@/store/toast'
import { AppError } from '@/services/errors'
import type { Item, Party, Voucher } from '@/services/types'
import type { Mirror } from './db'
import { isVoucherEntry, listOutbox, refreshOutboxState, type OutboxEntry } from './outbox'

/**
 * A file with every bill that has not reached the server, so that clearing the browser's data or losing the computer does not lose them.
 * `version` lets a later app read old files.
 */
export interface Backup {
  app: 'rapidbill'
  version: 1
  madeAt: string
  workspaceId: string
  /** `record` is the bill, item or party as it was shown on this device (for the spreadsheet and for showing it again after a restore). */
  entries: { entry: OutboxEntry; record: Voucher | Item | Party | null }[]
}

const storeOf = (e: OutboxEntry) => (e.kind === 'item' ? 'items' : e.kind === 'party' ? 'parties' : 'vouchers') as 'items' | 'parties' | 'vouchers'

export async function buildBackup(m: Mirror, workspaceId: string): Promise<Backup> {
  const entries = await listOutbox(m)
  return {
    app: 'rapidbill', version: 1, madeAt: new Date().toISOString(), workspaceId,
    entries: await Promise.all(entries.map(async (entry) => ({ entry, record: (await m.get<Voucher | Item | Party>(storeOf(entry), entry.id)) ?? null }))),
  }
}

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

/** The same things as a spreadsheet, readable by a person. */
export function backupToCsv(b: Backup): string {
  const rows = [['Type', 'Number / code', 'Date', 'Party / name', 'Payment', 'Items', 'Total (Rs)', 'Status']]
  for (const { entry, record } of b.entries) {
    const status = entry.status === 'failed' ? 'Needs attention' : 'Waiting to sync'
    if (isVoucherEntry(entry)) {
      const v = record as Voucher | null
      rows.push(['Bill', entry.number, v?.date ?? entry.payload.date, entry.partyName, entry.payload.payment,
        (v?.lines ?? []).map((l) => `${l.name} x ${l.qty}`).join('; '), (entry.total / 100).toFixed(2), v?.status === 'CANCELLED' ? 'Cancelled' : status])
    } else if (entry.kind === 'item') {
      rows.push(['Item', entry.payload.code, '', entry.payload.name, '', `opening stock ${entry.payload.currentStock}`, '', status])
    } else {
      rows.push(['Party', '', '', entry.payload.name, '', '', '', status])
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

const isEntry = (e: unknown): e is OutboxEntry => {
  const x = e as Partial<OutboxEntry> | null
  if (!x || typeof x.id !== 'string' || typeof x.number !== 'string' || !x.payload || typeof x.payload !== 'object') return false
  if (x.payload.id !== x.id) return false
  if (x.kind === 'item') return typeof (x.payload as { code?: unknown }).code === 'string'
  if (x.kind === 'party') return typeof (x.payload as { name?: unknown }).name === 'string'
  const p = x.payload as { lines?: unknown; date?: unknown }
  return (x.kind === undefined || x.kind === 'voucher') && Array.isArray(p.lines) && typeof p.date === 'string'
}

/** Read a backup file and check it is one of ours. Throws a translatable error if not. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new AppError('backupInvalid') }
  const b = data as Partial<Backup> | null
  if (!b || b.app !== 'rapidbill' || b.version !== 1 || !Array.isArray(b.entries)) throw new AppError('backupInvalid')
  if (!b.entries.every((e) => e && isEntry(e.entry))) throw new AppError('backupInvalid')
  return b as Backup
}

/**
 * Put what is in a backup back in the queue, in its original order. Anything the server already has is harmless: sending it twice saves it once.
 * Stock and credit on this device are not touched; the next download from the server, after everything is sent, sets them right.
 */
export async function restoreBackup(m: Mirror, workspaceId: string, b: Backup): Promise<{ restored: number; skipped: number }> {
  if (b.workspaceId !== workspaceId) throw new AppError('backupOtherAccount')
  const have = new Set((await listOutbox(m)).map((e) => e.id))
  const last = (await listOutbox(m)).at(-1)?.seq ?? 0
  let restored = 0
  const puts: OutboxEntry[] = []
  const rows: Record<'items' | 'parties' | 'vouchers', object[]> = { items: [], parties: [], vouchers: [] }
  for (const { entry, record } of [...b.entries].sort((x, y) => x.entry.seq - y.entry.seq)) {
    if (have.has(entry.id)) continue
    puts.push({ ...entry, seq: last + ++restored, status: 'pending', error: undefined, attempts: 0 })
    if (record) rows[storeOf(entry)].push(record)
  }
  if (puts.length) await m.batch([{ store: 'outbox', put: puts }, { store: 'vouchers', put: rows.vouchers }, { store: 'items', put: rows.items }, { store: 'parties', put: rows.parties }])
  await refreshOutboxState(m)
  return { restored, skipped: b.entries.length - restored }
}

/** Save the bills not yet sent as two files: one the app can restore from, one a person can open in a spreadsheet. */
export async function downloadBackup(m: Mirror, workspaceId: string): Promise<number> {
  const b = await buildBackup(m, workspaceId)
  const stamp = b.madeAt.slice(0, 16).replace(/[:T]/g, '-')
  download(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `rapidbill-unsent-bills-${stamp}.json`)
  download(new Blob(['﻿' + backupToCsv(b)], { type: 'text/csv;charset=utf-8' }), `rapidbill-unsent-bills-${stamp}.csv`)
  if (b.entries.length) toast.success(i18n.t('device.downloaded', { ns: 'common', count: b.entries.length }))
  else toast.info(i18n.t('device.nothingToBackUp', { ns: 'common' }))
  return b.entries.length
}
