import { newId } from '@/lib/id'
import { AppError } from './errors'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Meta, type Repo } from './types'

export function createRepo<T extends Meta>(adapter: StorageAdapter, collection: string): Repo<T> {
  return {
    list: () => adapter.read<T>(collection),
    async get(id) {
      return (await adapter.read<T>(collection)).find((r) => r.id === id)
    },
    async create(data) {
      const now = new Date().toISOString()
      const rec = { ...data, id: newId(), workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: now, updatedAt: now } as T
      const rows = await adapter.read<T>(collection)
      await adapter.write(collection, [...rows, rec])
      return rec
    },
    async update(id, patch) {
      const rows = await adapter.read<T>(collection)
      const i = rows.findIndex((r) => r.id === id)
      if (i < 0) throw new AppError('recordNotFound', { collection, id })
      const next = { ...rows[i], ...patch, updatedAt: new Date().toISOString() }
      rows[i] = next
      await adapter.write(collection, rows)
      return next
    },
    async remove(id) {
      const rows = await adapter.read<T>(collection)
      await adapter.write(collection, rows.filter((r) => r.id !== id))
    },
  }
}
