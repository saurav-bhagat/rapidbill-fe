import { newId } from '@/lib/id'
import { roundQty } from '@/lib/qty'
import { AppError } from './errors'
import { createRepo } from './repo'
import { createLedgerService, stampLedger, type NewLedgerEntry } from './ledger'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Item, type Meta, type StockLedgerEntry } from './types'

type ItemData = Omit<Item, keyof Meta>

/**
 * Item writes that must also touch the stock ledger. Invariant: an item's
 * currentStock always equals the sum of its ledger deltas.
 */
export interface InventoryService {
  createItem(data: ItemData): Promise<Item>
  /** Edits everything except stock. Stock only moves through the ledger. */
  updateItem(id: string, patch: Partial<Omit<ItemData, 'currentStock'>>): Promise<Item>
  adjustStock(id: string, delta: number, note: string): Promise<Item>
  ledgerFor(id: string): Promise<StockLedgerEntry[]>
  /** Apply a reviewed import in one go: items + IMPORT ledger entries, rolled back together on failure. */
  importItems(ops: ImportOp[], source: string): Promise<{ created: number; updated: number }>
}

export type ImportOp =
  | { kind: 'create'; data: ItemData }
  | { kind: 'update'; id: string; patch: Partial<Omit<ItemData, 'currentStock'>>; stockDelta?: number }

export function createInventoryService(adapter: StorageAdapter): InventoryService {
  const items = createRepo<Item>(adapter, 'items')
  const ledger = createLedgerService(adapter)

  const assertCodeFree = async (code: string, selfId?: string) => {
    const clash = (await items.list()).find((i) => i.code.toUpperCase() === code.toUpperCase() && i.id !== selfId)
    if (clash) throw new AppError('itemCodeUsedBy', { code, name: clash.name })
  }

  return {
    async createItem(data) {
      await assertCodeFree(data.code)
      const stock = roundQty(data.currentStock)
      const item = await items.create({ ...data, currentStock: stock })
      if (stock !== 0) {
        const e: NewLedgerEntry = { itemId: item.id, type: 'OPENING', qtyDelta: stock, balanceAfter: stock, note: 'Opening stock' }
        await ledger.append([e])
      }
      return item
    },
    async updateItem(id, patch) {
      // Stock must move through the ledger; drop it even if a caller sneaks it in.
      const { currentStock: _ignored, ...safe } = patch as Partial<ItemData>
      void _ignored
      if (safe.code) await assertCodeFree(safe.code, id)
      return items.update(id, safe)
    },
    async adjustStock(id, delta, note) {
      const item = await items.get(id)
      if (!item) throw new AppError('itemNotFound')
      const d = roundQty(delta)
      if (d === 0) return item
      const balance = roundQty(item.currentStock + d)
      await ledger.append([{ itemId: id, type: 'ADJUST', qtyDelta: d, balanceAfter: balance, note }])
      return items.update(id, { currentStock: balance })
    },
    ledgerFor: (id) => ledger.forItem(id),
    async importItems(ops, source) {
      const before = { items: await adapter.read<Item>('items'), ledger: await adapter.read<StockLedgerEntry>('ledger') }
      const now = new Date().toISOString()
      const nextItems = before.items.map((i) => ({ ...i }))
      const byId = new Map(nextItems.map((i) => [i.id, i]))
      const codes = new Set(nextItems.map((i) => i.code.toUpperCase()))
      const entries: StockLedgerEntry[] = []
      let created = 0, updated = 0
      for (const op of ops) {
        if (op.kind === 'create') {
          if (codes.has(op.data.code.toUpperCase())) throw new AppError('itemCodeUsed', { code: op.data.code })
          codes.add(op.data.code.toUpperCase())
          const stock = roundQty(op.data.currentStock)
          const item: Item = { ...op.data, currentStock: stock, id: newId(), workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: now, updatedAt: now }
          nextItems.push(item); byId.set(item.id, item); created++
          if (stock !== 0) entries.push(stampLedger({ itemId: item.id, type: 'IMPORT', qtyDelta: stock, balanceAfter: stock, note: `Import: ${source}` }, now))
        } else {
          const it = byId.get(op.id)
          if (!it) throw new AppError('importItemGone')
          Object.assign(it, op.patch, { updatedAt: now })
          updated++
          const d = roundQty(op.stockDelta ?? 0)
          if (d !== 0) {
            it.currentStock = roundQty(it.currentStock + d)
            entries.push(stampLedger({ itemId: it.id, type: 'IMPORT', qtyDelta: d, balanceAfter: it.currentStock, note: `Import: ${source}` }, now))
          }
        }
      }
      try {
        await adapter.write('items', nextItems)
        await adapter.write('ledger', [...before.ledger, ...entries])
      } catch (err) {
        await adapter.write('items', before.items).catch(() => undefined)
        await adapter.write('ledger', before.ledger).catch(() => undefined)
        throw err instanceof Error ? new AppError('importRolledBack', { reason: err.message }) : new AppError('importRolledBackGeneric')
      }
      return { created, updated }
    },
  }
}
