import { newId } from '@/lib/id'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type StockLedgerEntry } from './types'

export type NewLedgerEntry = Omit<StockLedgerEntry, 'id' | 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt'>

/** Append-only. There is intentionally no update or remove. */
export interface StockLedgerService {
  list(): Promise<StockLedgerEntry[]>
  forItem(itemId: string): Promise<StockLedgerEntry[]>
  append(entries: NewLedgerEntry[]): Promise<StockLedgerEntry[]>
}

export const stampLedger = (e: NewLedgerEntry, at = new Date().toISOString()): StockLedgerEntry => ({
  ...e, id: newId(), workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: at, updatedAt: at,
})

export function createLedgerService(adapter: StorageAdapter): StockLedgerService {
  const all = () => adapter.read<StockLedgerEntry>('ledger')
  return {
    list: all,
    async forItem(itemId) {
      return (await all()).filter((e) => e.itemId === itemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async append(entries) {
      const stamped = entries.map((e) => stampLedger(e))
      await adapter.write('ledger', [...(await all()), ...stamped])
      return stamped
    },
  }
}
