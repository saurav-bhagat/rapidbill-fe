import { AppError } from '@/services/errors'
import type { BillingService } from '@/services/voucher'
import type { InventoryService } from '@/services/inventory'
import type { SettingsService } from '@/services/settings'
import type { Item, ItemService, Party, PartyService, Settings, Voucher, VoucherService } from '@/services/types'
import { newId } from '@/lib/id'
import { useAuth } from '@/auth/session'
import { api } from '@/services/http/client'
import { createHttpBilling, createHttpInventory, createHttpItems, createHttpParties, createHttpSettings, createHttpVouchers } from '@/services/http/services'
import { cancelWaiting, editWaiting, listOutbox, localNextNumber, saveLocally } from './outbox'
import { setSync, useSync } from './state'
import { currentMirror, syncNow } from './sync'

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
    // Bills still waiting to reach the server are shown too, so the register and Home never hide a bill that was just made.
    recent,
    list: () => networkOr(async () => {
      const server = await httpVouchers.list()
      const have = new Set(server.map((v) => v.id))
      const waiting = new Set((await listOutbox(m())).map((e) => e.id))
      const local = (await m().all<Voucher>('vouchers')).filter((v) => waiting.has(v.id) && !have.has(v.id))
      return [...local, ...server]
    }, recent),
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

  /** Keep a bill the server just confirmed, and its number, on this device straight away. */
  const remember = async (v: Voucher) => {
    await m().putMany('vouchers', [v])
    const parts = /^(.+-\d{4})-(\d+)$/.exec(v.number)
    if (parts) {
      const top = (await m().getMeta<Record<string, number>>('numbering')) ?? {}
      top[parts[1]!] = Math.max(top[parts[1]!] ?? 0, Number(parts[2]))
      await m().setMeta('numbering', top)
    }
  }

  const owner = () => {
    const { user, workspace } = useAuth.getState()
    if (!user || !workspace) throw new AppError('authRequired')
    return { workspaceId: workspace.id, userId: user.id }
  }
  const waitingCount = async () => (await listOutbox(m())).length

  const billing: BillingService = {
    // Online with nothing waiting: the server's next number. Otherwise this device counts on (it knows the bills it has not sent yet).
    nextNumber: async (date) => {
      if (useSync.getState().online && (await waitingCount()) === 0) {
        return networkOr(() => httpBilling.nextNumber(date), () => localNextNumber(m(), owner(), date))
      }
      return localNextNumber(m(), owner(), date)
    },

    /**
     * Online and nothing waiting: save on the server as before (it can refuse a bad bill right away). If the server cannot be reached,
     * or other bills are already waiting, the bill is made on this device and sent later. Either way the bill carries an id chosen here,
     * so if a reply was lost and the bill is sent again, the server saves it only once.
     */
    save: async (input) => {
      const payload = { ...input, id: input.id ?? newId(), clientCreatedAt: new Date().toISOString() }
      if (useSync.getState().online && (await waitingCount()) === 0) {
        try {
          const v = await api<Voucher>('/vouchers', { method: 'POST', body: payload, timeoutMs: 8000 })
          await remember(v) // so the next bill's number is right even if the download below fails
          await syncNow()
          return v
        } catch (e) {
          if (!(e instanceof AppError && e.key === 'networkError')) throw e
          setSync({ online: false })
        }
      }
      const v = await saveLocally(m(), owner(), payload)
      void syncNow() // sends it right away if the connection is actually there
      return v
    },
    // A bill still waiting to be sent is changed on this device (the server only ever sees the final version). One already on the server is changed there.
    update: async (id, i) => {
      const local = await editWaiting(m(), owner(), id, i)
      if (local) { void syncNow(); return local }
      return written(httpBilling.update(id, i))
    },
    cancel: async (id) => {
      const local = await cancelWaiting(m(), owner(), id)
      if (local) { void syncNow(); return local }
      return written(httpBilling.cancel(id))
    },
  }

  const ledger = { list: async () => { throw new Error('The stock ledger is read per item through the API') }, forItem: inventory.ledgerFor, append: async () => { throw new Error('read-only') } }

  return { items, parties, vouchers, settings, inventory, billing, ledger }
}
