import { describe, expect, it } from 'vitest'
import { createMemoryAdapter } from './storage/memoryAdapter'
import { createLocalPartyImport } from './partyImport'
import type { Party, PartyImportOp } from './types'

const base = { workspaceId: 'w', createdBy: 'u', createdAt: 't', updatedAt: 't' }
const existing = (id: string, name: string, over: Partial<Party> = {}): Party => ({ id, ...base, name, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over })
const make = (name: string, over: Record<string, unknown> = {}): PartyImportOp => ({ kind: 'create', data: { name, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over } })

async function setup() {
  const a = createMemoryAdapter()
  await a.write('parties', [existing('p1', 'Apollo Pharmacy'), existing('p2', 'Mumbai Co', { stateCode: '27', gstin: '27AAFFM7743K1ZU' })])
  return { a, run: createLocalPartyImport(a), names: async () => (await a.read<Party>('parties')).map((p) => p.name).sort() }
}

describe('party import in browser-only mode', () => {
  it('adds and changes together', async () => {
    const { run, a, names } = await setup()
    expect(await run([make('New Co', { balance: 500 }), { kind: 'update', id: 'p1', patch: { phone: '99' } }])).toEqual({ created: 1, updated: 1 })
    expect(await names()).toEqual(['Apollo Pharmacy', 'Mumbai Co', 'New Co'])
    expect((await a.read<Party>('parties')).find((p) => p.id === 'p1')!.phone).toBe('99')
  })
  it('one bad row saves nothing', async () => {
    const { run, names } = await setup()
    await expect(run([make('Fine'), make('apollo pharmacy')])).rejects.toMatchObject({ key: 'partyNameTaken', params: { name: 'apollo pharmacy' } })
    await expect(run([make('Fine'), make('Bad', { gstin: '27AAFFM7743K1ZU', stateCode: '29' })])).rejects.toMatchObject({ key: 'partyStateMismatch' })
    await expect(run([make('Fine'), { kind: 'update', id: 'ghost', patch: { phone: '1' } }])).rejects.toMatchObject({ key: 'partyNotFound' })
    expect(await names()).toEqual(['Apollo Pharmacy', 'Mumbai Co'])
  })
  it('a rename frees the old name; the state must still match the GSTIN after an update', async () => {
    const { run } = await setup()
    await run([{ kind: 'update', id: 'p1', patch: { name: 'Apollo Two' } }, make('Apollo Pharmacy')])
    await expect(run([{ kind: 'update', id: 'p2', patch: { stateCode: '29' } }])).rejects.toMatchObject({ key: 'partyStateMismatch' })
  })
})
