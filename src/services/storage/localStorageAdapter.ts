import { WORKSPACE_ID } from '../types'

/**
 * Only this file touches localStorage. Everything above it is async so a
 * network-backed adapter can replace it without changing callers.
 */
export const SCHEMA_VERSION = 1
const prefix = (ws: string) => `rapidbill:v${SCHEMA_VERSION}:${ws}:`

export interface StorageAdapter {
  read<T>(collection: string): Promise<T[]>
  write<T>(collection: string, rows: T[]): Promise<void>
  clearWorkspace(): Promise<void>
  isEmpty(): Promise<boolean>
}

export function createLocalStorageAdapter(workspaceId = WORKSPACE_ID): StorageAdapter {
  const key = (c: string) => prefix(workspaceId) + c
  return {
    async read<T>(collection: string) {
      const raw = localStorage.getItem(key(collection))
      if (!raw) return []
      try {
        return JSON.parse(raw) as T[]
      } catch {
        console.error(`Corrupt data in ${collection}; treating as empty`)
        return []
      }
    },
    async write<T>(collection: string, rows: T[]) {
      localStorage.setItem(key(collection), JSON.stringify(rows))
    },
    async clearWorkspace() {
      const p = prefix(workspaceId)
      Object.keys(localStorage).filter((k) => k.startsWith(p)).forEach((k) => localStorage.removeItem(k))
    },
    async isEmpty() {
      const p = prefix(workspaceId)
      return !Object.keys(localStorage).some((k) => k.startsWith(p))
    },
  }
}
