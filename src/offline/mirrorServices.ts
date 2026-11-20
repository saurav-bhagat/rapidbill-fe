import { AppError } from '@/services/errors'
import type { BillingService } from '@/services/voucher'
import type { InventoryService } from '@/services/inventory'
import type { SettingsService } from '@/services/settings'
import type { Item, ItemService, Party, PartyService, Settings, Voucher, VoucherService } from '@/services/types'
import { createHttpBilling, createHttpInventory, createHttpItems, createHttpParties, createHttpSettings, createHttpVouchers } from '@/services/http/services'
import { currentMirror, syncNow } from './sync'
import { setSync } from './state'

/** Run a server write, then bring the device copy up to date so the next read already shows its effect. */
async function written<T>(p: Promise<T>): Promise<T> {
  const r = await p
  await syncNow()
  return r
}

/** Server call that falls back to the device copy when the server cannot be reached. */
async function networkOr<T>(net: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  try {
    const r = await net()
    setSync({ online: true })
    return r
  } catch (e) {
    if (e instanceof AppError && e.key === 'networkError') { setSync({ online: false }); return local() }
    throw e
  }
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

/**
 * The service layer for a signed-in account: reads come from the copy on this device (so screens work offline and open instantly),
 * writes go to the server and the copy is refreshed right after. Billing and other writes still need the internet in this phase.
 */
export function createMirrorServices() {
  const httpItems = createHttpItems()
  const httpParties = createHttpParties()
  const httpVouchers = createHttpVouchers()
  const httpInventory = createHttpInventory()
  const httpBilling = createHttpBilling()
  const httpSettings = createHttpSettings()
  const m = () => currentMirror()

  const items: ItemService = {
    list: async () => (await m().all<Item>('items')).sort(byName),
    get: (id) => m().get<Item>('items', id),
    create: (d) => written(httpItems.create(d)),
    update: (id, p) => written(httpItems.update(id, p)),
    remove: httpItems.remove,
  }

  const parties: PartyService = {
    list: async () => (await m().all<Party>('parties')).sort(byName),
    get: (id) => m().get<Party>('parties', id),
    create: (d) => written(httpParties.create(d)),
    update: (id, p) => written(httpParties.update(id, p)),
    remove: (id) => written(httpParties.remove(id)),
  }

  const recent = async () => (await m().all<Voucher>('vouchers')).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number, undefined, { numeric: true }))
  const vouchers: VoucherService = {
    // Online: the full history, as before. Offline: the last 30 days kept on this device.
    list: () => networkOr(() => httpVouchers.list(), recent),
    get: async (id) => (await m().get<Voucher>('vouchers', id)) ?? networkOr(() => httpVouchers.get(id), async () => undefined),
    create: httpVouchers.create, update: httpVouchers.update, remove: httpVouchers.remove,
  }

  const settings: SettingsService = {
    get: async () => (await m().all<Settings>('settings'))[0] ?? httpSettings.get(),
    save: (p) => written(httpSettings.save(p)),
  }

  const inventory: InventoryService = {
    createItem: (d) => written(httpInventory.createItem(d)),
    updateItem: (id, p) => written(httpInventory.updateItem(id, p)),
    adjustStock: (id, d, n) => written(httpInventory.adjustStock(id, d, n)),
    ledgerFor: httpInventory.ledgerFor, // stock history is read from the server (needs the internet)
    importItems: (ops, source) => written(httpInventory.importItems(ops, source)),
  }

  const billing: BillingService = {
    nextNumber: httpBilling.nextNumber,
    save: (i) => written(httpBilling.save(i)),
    update: (id, i) => written(httpBilling.update(id, i)),
    cancel: (id) => written(httpBilling.cancel(id)),
  }

  const ledger = { list: async () => { throw new Error('The stock ledger is read per item through the API') }, forItem: inventory.ledgerFor, append: async () => { throw new Error('read-only') } }

  return { items, parties, vouchers, settings, inventory, billing, ledger }
}
