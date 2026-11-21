import { checkGstin } from '@/lib/gst'
import { newId } from '@/lib/id'
import { AppError } from './errors'
import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Party, type PartyImportOp } from './types'

/** Browser-only mode: the same rules the server applies, then one single write, so a bad row saves nothing. */
export function createLocalPartyImport(adapter: StorageAdapter) {
  return async (ops: PartyImportOp[]): Promise<{ created: number; updated: number }> => {
    const rows = (await adapter.read<Party>('parties')).map((p) => ({ ...p }))
    const byId = new Map(rows.map((p) => [p.id, p]))
    const holder = new Map(rows.map((p) => [p.name.trim().toLowerCase(), p.id]))
    const now = new Date().toISOString()
    const stateOk = (gstin: string, state: string) => {
      const g = checkGstin(gstin)
      if (g.errorKey) throw new AppError(g.errorKey, g.params)
      if (g.stateCode && g.stateCode !== state) throw new AppError('partyStateMismatch')
    }
    let created = 0, updated = 0
    for (const op of ops) {
      if (op.kind === 'create') {
        const k = op.data.name.trim().toLowerCase()
        if (holder.has(k)) throw new AppError('partyNameTaken', { name: op.data.name })
        if (op.data.gstin) stateOk(op.data.gstin, op.data.stateCode)
        const p: Party = { ...op.data, id: newId(), workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: now, updatedAt: now }
        rows.push(p); byId.set(p.id, p); holder.set(k, p.id); created++
      } else {
        const cur = byId.get(op.id)
        if (!cur) throw new AppError('partyNotFound')
        const gstin = op.patch.gstin ?? cur.gstin
        const state = op.patch.stateCode ?? cur.stateCode
        if (gstin) stateOk(gstin, state)
        if (op.patch.name !== undefined) {
          const k = op.patch.name.trim().toLowerCase()
          const owner = holder.get(k)
          if (owner && owner !== cur.id) throw new AppError('partyNameTaken', { name: op.patch.name })
          holder.delete(cur.name.trim().toLowerCase()); holder.set(k, cur.id)
        }
        Object.assign(cur, op.patch, { updatedAt: now }); updated++
      }
    }
    await adapter.write('parties', rows)
    return { created, updated }
  }
}
