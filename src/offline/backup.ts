import { download } from '@/lib/download'
import { AppError } from '@/services/errors'
import type { Voucher } from '@/services/types'
import type { Mirror } from './db'
import { listOutbox, refreshOutboxState, type OutboxEntry } from './outbox'

/**
 * A file with every bill that has not reached the server, so that clearing the browser's data or losing the computer does not lose them.
 * `version` lets a later app read old files.
 */
export interface Backup {
  app: 'rapidbill'
  version: 1
  madeAt: string
  workspaceId: string
  entries: { entry: OutboxEntry; voucher: Voucher | null }[]
}

export async function buildBackup(m: Mirror, workspaceId: string): Promise<Backup> {
  const entries = await listOutbox(m)
  return {
    app: 'rapidbill', version: 1, madeAt: new Date().toISOString(), workspaceId,
    entries: await Promise.all(entries.map(async (entry) => ({ entry, voucher: (await m.get<Voucher>('vouchers', entry.id)) ?? null }))),
  }
}

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

/** The same bills as a spreadsheet, readable by a person: number, date, party, items and total. */
export function backupToCsv(b: Backup): string {
  const rows = [['Number', 'Date', 'Party', 'Payment', 'Items', 'Total (Rs)', 'Status']]
  for (const { entry, voucher } of b.entries) {
    const v = voucher
    rows.push([
      entry.number, v?.date ?? entry.payload.date, entry.partyName, entry.payload.payment,
      (v?.lines ?? []).map((l) => `${l.name} x ${l.qty}`).join('; '), (entry.total / 100).toFixed(2),
      v?.status === 'CANCELLED' ? 'Cancelled' : entry.status === 'failed' ? 'Needs attention' : 'Waiting to sync',
    ])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

const isEntry = (e: unknown): e is OutboxEntry => {
  const x = e as Partial<OutboxEntry> | null
  return !!x && typeof x.id === 'string' && typeof x.number === 'string' && !!x.payload && typeof x.payload === 'object'
    && typeof x.payload.id === 'string' && x.payload.id === x.id && Array.isArray(x.payload.lines) && typeof x.payload.date === 'string'
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
 * Put the bills from a backup back in the queue. Bills the server already has are harmless: sending a bill twice saves it once.
 * Stock and credit on this device are not touched; the next download from the server, after the bills are sent, sets them right.
 */
export async function restoreBackup(m: Mirror, workspaceId: string, b: Backup): Promise<{ restored: number; skipped: number }> {
  if (b.workspaceId !== workspaceId) throw new AppError('backupOtherAccount')
  const have = new Set((await listOutbox(m)).map((e) => e.id))
  const last = (await listOutbox(m)).at(-1)?.seq ?? 0
  let restored = 0
  const puts: OutboxEntry[] = []
  const vouchers: Voucher[] = []
  for (const { entry, voucher } of b.entries) {
    if (have.has(entry.id)) continue
    puts.push({ ...entry, seq: last + ++restored, status: 'pending', error: undefined, attempts: 0 })
    if (voucher) vouchers.push(voucher)
  }
  if (puts.length) await m.batch([{ store: 'outbox', put: puts }, { store: 'vouchers', put: vouchers }])
  await refreshOutboxState(m)
  return { restored, skipped: b.entries.length - restored }
}


/** Save the bills not yet sent as two files: one the app can restore from, one a person can open in a spreadsheet. */
export async function downloadBackup(m: Mirror, workspaceId: string): Promise<number> {
  const b = await buildBackup(m, workspaceId)
  const stamp = b.madeAt.slice(0, 16).replace(/[:T]/g, '-')
  download(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `rapidbill-unsent-bills-${stamp}.json`)
  download(new Blob(['﻿' + backupToCsv(b)], { type: 'text/csv;charset=utf-8' }), `rapidbill-unsent-bills-${stamp}.csv`)
  return b.entries.length
}
