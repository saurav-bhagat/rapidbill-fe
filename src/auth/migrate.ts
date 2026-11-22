import { createLocalStorageAdapter } from '@/services/storage/localStorageAdapter'
import { api, apiAll } from '@/services/http/client'
import type { Item, Party, Settings, Voucher } from '@/services/types'

export interface LocalCounts { items: number; parties: number; vouchers: number }

const local = createLocalStorageAdapter()
const META = ['id', 'workspaceId', 'createdBy', 'createdAt', 'updatedAt'] as const
const strip = <T extends object>(o: T) => { const c = { ...o } as Record<string, unknown>; for (const k of META) delete c[k]; return c }

export async function localCounts(): Promise<LocalCounts> {
  const [items, parties, vouchers] = await Promise.all([local.read<Item>('items'), local.read<Party>('parties'), local.read<Voucher>('vouchers')])
  return { items: items.length, parties: parties.length, vouchers: vouchers.length }
}

const flagKey = (workspaceId: string) => `rapidbill:uploaded:${workspaceId}`
export const uploadedFlag = {
  get: (ws: string) => { try { return localStorage.getItem(flagKey(ws)) } catch { return null } },
  set: (ws: string, v: 'done' | 'later') => { try { localStorage.setItem(flagKey(ws), v) } catch { /* ignore */ } },
}

/**
 * Copies this browser's data into the signed-in account by replaying it through the real API, so stock, credit balances and the ledger
 * come out consistent. Opening stock is set to (today's stock + everything the active bills issued), then the bills are replayed in
 * order and the cancelled ones are cancelled again, which lands every item back on today's stock.
 * Bills are priced again by the server from the item's current GST rate, so a bill made before a rate change can differ by a few paise.
 */
export async function uploadLocalData(): Promise<LocalCounts> {
  const [items, parties, vouchers, savedSettings] = await Promise.all([
    local.read<Item>('items'), local.read<Party>('parties'),
    local.read<Voucher>('vouchers'), local.read<Settings>('settings'),
  ])
  const ordered = [...vouchers].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const active = ordered.filter((v) => v.status === 'ACTIVE')

  const issued = new Map<string, number>()
  for (const v of active) for (const l of v.lines) issued.set(l.itemId, (issued.get(l.itemId) ?? 0) + (l.stockQty ?? l.qty))
  const owed = new Map<string, number>()
  for (const v of active) if (v.payment === 'CREDIT' && v.partyId) owed.set(v.partyId, (owed.get(v.partyId) ?? 0) + v.totals.grandTotal)

  // Replay must not be refused for stock: cancelled bills briefly need stock that later bills "give back".
  const userSettings = savedSettings[0]
  const original = await api<Settings>('/settings')
  await api('/settings', { method: 'PUT', body: { overIssue: 'ALLOW_WARN' } })
  try {
    if (items.length) {
      await api('/items/import', {
        method: 'POST',
        body: { source: 'Upload from this browser', ops: items.map((i) => ({ kind: 'create', data: { ...strip(i), currentStock: Math.round((i.currentStock + (issued.get(i.id) ?? 0)) * 1000) / 1000 } })) },
      })
    }
    const byCode = new Map((await apiAll<Item>('/items')).map((i) => [i.code.toUpperCase(), i.id]))
    const itemId = new Map(items.map((i) => [i.id, byCode.get(i.code.toUpperCase())]))

    const partyId = new Map<string, string>()
    for (const p of parties) {
      const made = await api<Party>('/parties', { method: 'POST', body: { ...strip(p), balance: p.balance - (owed.get(p.id) ?? 0) } })
      partyId.set(p.id, made.id)
    }

    for (const v of ordered) {
      const lines = v.lines.map((l) => ({ itemId: itemId.get(l.itemId), qty: l.qty, rate: l.rate, discPct: l.discPct, ...((l.per ?? 1) !== 1 ? { unit: l.unit } : {}) }))
      const made = await api<Voucher>('/vouchers', {
        method: 'POST',
        body: {
          number: v.number, date: v.date, mode: v.mode, taxApplicable: v.taxApplicable, rateBasis: v.rateBasis,
          partyId: v.partyId ? partyId.get(v.partyId) ?? null : null, remarks: v.remarks, lines,
          billDiscount: v.billDiscount, roundOff: v.totals.roundOff !== 0, payment: v.payment,
        },
      })
      if (v.status === 'CANCELLED') await api(`/vouchers/${made.id}/cancel`, { method: 'POST' })
    }
  } finally {
    // Always put settings back: the user's own if they had saved some, otherwise what the account had.
    const { id: _a, workspaceId: _b, createdBy: _c, createdAt: _d, updatedAt: _e, ...restore } = (userSettings ?? original) as Settings
    void [_a, _b, _c, _d, _e]
    await api('/settings', { method: 'PUT', body: { ...restore, overIssue: 'ALLOW_WARN' } }).catch(() => api('/settings', { method: 'PUT', body: { overIssue: original.overIssue } }))
  }
  return { items: items.length, parties: parties.length, vouchers: vouchers.length }
}
