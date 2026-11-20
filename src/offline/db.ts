import { deleteDB, openDB, type IDBPDatabase } from 'idb'

/** The collections kept whole on the device. Settings are one record; meta holds the sync bookkeeping. */
export type StoreName = 'items' | 'parties' | 'vouchers' | 'settings'

export interface Mirror {
  all<T>(store: StoreName): Promise<T[]>
  get<T>(store: StoreName, id: string): Promise<T | undefined>
  putMany<T extends { id: string }>(store: StoreName, rows: T[]): Promise<void>
  deleteMany(store: StoreName, ids: string[]): Promise<void>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
  /** Empty every store and the bookkeeping (used when the server says to download everything again). */
  clear(): Promise<void>
  close(): void
}

const dbName = (workspaceId: string) => `rapidbill-mirror:${workspaceId}`
const VERSION = 1

/** One database per workspace, so two accounts on one computer never see each other's data. */
export async function openMirror(workspaceId: string): Promise<Mirror> {
  const db: IDBPDatabase = await openDB(dbName(workspaceId), VERSION, {
    upgrade(d) {
      d.createObjectStore('items', { keyPath: 'id' })
      d.createObjectStore('parties', { keyPath: 'id' })
      d.createObjectStore('vouchers', { keyPath: 'id' }).createIndex('date', 'date')
      d.createObjectStore('settings', { keyPath: 'id' })
      d.createObjectStore('meta', { keyPath: 'key' })
    },
  })
  return {
    all: (store) => db.getAll(store) as Promise<never>,
    get: (store, id) => db.get(store, id) as Promise<never>,
    async putMany(store, rows) {
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done])
    },
    async deleteMany(store, ids) {
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
    },
    async getMeta(key) { return (await db.get('meta', key))?.value },
    async setMeta(key, value) { await db.put('meta', { key, value }) },
    async clear() {
      const tx = db.transaction(['items', 'parties', 'vouchers', 'settings', 'meta'], 'readwrite')
      await Promise.all([...['items', 'parties', 'vouchers', 'settings', 'meta'].map((s) => tx.objectStore(s).clear()), tx.done])
    },
    close: () => db.close(),
  }
}

export async function deleteMirror(workspaceId: string): Promise<void> {
  await deleteDB(dbName(workspaceId)).catch(() => undefined)
}
