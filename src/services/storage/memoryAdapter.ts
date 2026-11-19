import type { StorageAdapter } from './localStorageAdapter'

/** In-memory adapter for tests (and a handy reference for the adapter contract). */
export function createMemoryAdapter(): StorageAdapter {
  const db = new Map<string, unknown[]>()
  return {
    async read<T>(c: string) { return structuredClone((db.get(c) ?? []) as T[]) },
    async write<T>(c: string, rows: T[]) { db.set(c, structuredClone(rows)) },
    async clearWorkspace() { db.clear() },
    async isEmpty() { return db.size === 0 },
  }
}
