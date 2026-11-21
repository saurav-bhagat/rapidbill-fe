import { AppError } from '../errors'
import type { BillingService, VoucherInput } from '../voucher'
import type { ImportOp, InventoryService } from '../inventory'
import type { SettingsService } from '../settings'
import type { Item, ItemService, Meta, Party, PartyService, Repo, Settings, StockLedgerEntry, Voucher, VoucherService } from '../types'
import { api, apiAll } from './client'

const META: (keyof Meta)[] = ['id', 'workspaceId', 'createdBy', 'createdAt', 'updatedAt']
/** The API refuses unknown fields, so record bookkeeping is stripped before sending. */
function body<T extends object>(data: T): Record<string, unknown> {
  const o = { ...data } as Record<string, unknown>
  for (const k of META) delete o[k]
  return o
}

const notSupported = (what: string) => new AppError('serverMessage', { message: `${what} is not available` })

async function getOrUndefined<T>(path: string): Promise<T | undefined> {
  try { return await api<T>(path) } catch (e) {
    if (e instanceof AppError && (e.key === 'partyNotFound' || e.key === 'voucherNotFound' || e.key === 'itemNotFound')) return undefined
    throw e
  }
}

export function createHttpItems(): ItemService {
  return {
    list: () => apiAll<Item>('/items'),
    get: (id) => getOrUndefined<Item>(`/items/${encodeURIComponent(id)}`),
    create: (data) => api<Item>('/items', { method: 'POST', body: body(data) }),
    update: (id, patch) => api<Item>(`/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(patch) }),
    remove: async () => { throw notSupported('Deleting items') },
  }
}

export function createHttpParties(): PartyService {
  return {
    list: () => apiAll<Party>('/parties'),
    get: (id) => getOrUndefined<Party>(`/parties/${encodeURIComponent(id)}`),
    create: (data) => api<Party>('/parties', { method: 'POST', body: body(data) }),
    update: (id, patch) => api<Party>(`/parties/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(patch) }),
    remove: (id) => api<void>(`/parties/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    importParties: (ops, source) => api<{ created: number; updated: number }>('/parties/import', { method: 'POST', body: { source, ops }, timeoutMs: 120_000 }),
  }
}

/** Read-only: vouchers are created, edited and cancelled through the billing service. */
export function createHttpVouchers(): VoucherService {
  const nope = async (): Promise<never> => { throw notSupported('Writing vouchers directly') }
  const repo: Repo<Voucher> = {
    list: () => apiAll<Voucher>('/vouchers', { include: 'lines' }),
    get: (id) => getOrUndefined<Voucher>(`/vouchers/${encodeURIComponent(id)}`),
    create: nope, update: nope, remove: nope,
  }
  return repo
}

export function createHttpInventory(): InventoryService {
  return {
    createItem: (data) => api<Item>('/items', { method: 'POST', body: body(data) }),
    updateItem: (id, patch) => {
      const { currentStock: _ignored, ...safe } = patch as Record<string, unknown>
      void _ignored
      return api<Item>(`/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(safe) })
    },
    adjustStock: (id, delta, note) => api<Item>(`/items/${encodeURIComponent(id)}/adjust`, { method: 'POST', body: { delta, note } }),
    ledgerFor: (id) => apiAll<StockLedgerEntry>(`/items/${encodeURIComponent(id)}/ledger`, {}, 500),
    importItems: (ops: ImportOp[], source) =>
      api<{ created: number; updated: number }>('/items/import', {
        method: 'POST',
        body: { source, ops: ops.map((op) => (op.kind === 'create' ? { kind: 'create', data: body(op.data) } : { ...op, patch: body(op.patch) })) },
      }),
  }
}

export function createHttpBilling(): BillingService {
  return {
    nextNumber: async (date) => (await api<{ number: string }>('/vouchers/next-number', { query: { date } })).number,
    save: (input: VoucherInput) => api<Voucher>('/vouchers', { method: 'POST', body: input }),
    update: (id, input) => api<Voucher>(`/vouchers/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
    cancel: (id) => api<Voucher>(`/vouchers/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  }
}

export function createHttpSettings(): SettingsService {
  return {
    get: () => api<Settings>('/settings'),
    save: (patch) => api<Settings>('/settings', { method: 'PUT', body: body(patch) }),
  }
}

export const workspaceApi = {
  resetDemo: (password: string) => api<unknown>('/workspace/reset-demo', { method: 'POST', body: { confirm: 'RESET', password } }),
  clear: (password: string) => api<unknown>('/workspace/data', { method: 'DELETE', body: { confirm: 'DELETE', password } }),
}
