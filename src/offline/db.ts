import { deleteDB, openDB, type IDBPDatabase } from 'idb'
import { AppError } from '@/services/errors'

/** A full disk shows up as a QuotaExceededError; say so in plain words instead of a technical message. */
const friendly = (e: unknown): unknown => (e instanceof DOMException && e.name === 'QuotaExceededError' ? new AppError('deviceStorageFull') : e)

/** The collections kept whole on the device. Settings are one record; meta holds the sync bookkeeping. */
export type StoreName = 'items' | 'parties' | 'vouchers' | 'settings' | 'outbox'

/** Rows to save and ids to remove, per store, applied together. */
export interface BatchOp { store: StoreName; put?: object[] /* each row has an `id` */; remove?: string[] }

export interface Mirror {
  /** The business this copy belongs to. */
  readonly id: string
  /** Opened only to send its waiting bills in the background: it must not change what the screen shows for the open business. */
  background?: boolean
  all<T>(store: StoreName): Promise<T[]>
  get<T>(store: StoreName, id: string): Promise<T | undefined>
  putMany<T extends { id: string }>(store: StoreName, rows: T[]): Promise<void>
  deleteMany(store: StoreName, ids: string[]): Promise<void>
  /** Several stores in one all-or-nothing transaction (a bill, its stock changes and its place in the queue are saved together). */
  batch(ops: BatchOp[]): Promise<void>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
  /** Empty every store and the bookkeeping (used when the server says to download everything again). */
  clear(): Promise<void>
  close(): void
}

const dbName = (workspaceId: string) => `rapidbill-mirror:${workspaceId}`
const VERSION = 2

/** One database per workspace, so two accounts on one computer never see each other's data. */
export async function openMirror(workspaceId: string): Promise<Mirror> {
  const db: IDBPDatabase = await openDB(dbName(workspaceId), VERSION, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('items', { keyPath: 'id' })
        d.createObjectStore('parties', { keyPath: 'id' })
        d.createObjectStore('vouchers', { keyPath: 'id' }).createIndex('date', 'date')
        d.createObjectStore('settings', { keyPath: 'id' })
        d.createObjectStore('meta', { keyPath: 'key' })
      }
      if (oldVersion < 2) d.createObjectStore('outbox', { keyPath: 'id' }) // bills made on this device that the server has not confirmed yet
    },
  })
  const batchRaw = async (ops: BatchOp[]) => {
      const names = [...new Set(ops.map((o) => o.store))]
      const tx = db.transaction(names, 'readwrite')
      const work: Promise<unknown>[] = [tx.done]
      for (const o of ops) {
        const st = tx.objectStore(o.store)
        for (const r of o.put ?? []) work.push(st.put(r))
        for (const id of o.remove ?? []) work.push(st.delete(id))
      }
      await Promise.all(work)
  }
  return {
    id: workspaceId,
    all: (store) => db.getAll(store) as Promise<never>,
    get: (store, id) => db.get(store, id) as Promise<never>,
    async putMany(store, rows) {
      try {
        const tx = db.transaction(store, 'readwrite')
        await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done])
      } catch (e) { throw friendly(e) }
    },
    async deleteMany(store, ids) {
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
    },
    async batch(ops) { try { await batchRaw(ops) } catch (e) { throw friendly(e) } },
    async getMeta(key) { return (await db.get('meta', key))?.value },
    async setMeta(key, value) { await db.put('meta', { key, value }) },
    async clear() {
      // The outbox is deliberately not cleared: bills waiting to be sent must survive a re-download.
      const tx = db.transaction(['items', 'parties', 'vouchers', 'settings', 'meta'], 'readwrite')
      await Promise.all([...['items', 'parties', 'vouchers', 'settings', 'meta'].map((s) => tx.objectStore(s).clear()), tx.done])
    },
    close: () => db.close(),
  }
}

export async function deleteMirror(workspaceId: string): Promise<void> {
  await deleteDB(dbName(workspaceId)).catch(() => undefined)
}
