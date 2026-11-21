import type { StorageAdapter } from './storage/localStorageAdapter'
import { LOCAL_USER, WORKSPACE_ID, type Settings } from './types'

export const defaultSettings = (): Settings => {
  const now = new Date().toISOString()
  return {
    id: 'settings', workspaceId: WORKSPACE_ID, createdBy: LOCAL_USER, createdAt: now, updatedAt: now,
    gstEnabled: true, printLanguage: 'en', companyName: 'Shree Ganesh Traders', address: '14, Market Road, Jayanagar, Bengaluru 560011', phone: '080 2653 1180',
    gstin: '29AAKFS4821M1ZM', stateCode: '29', invoicePrefix: 'SI', defaultTaxMode: 'TAX_INVOICE',
    overIssue: 'ALLOW_WARN', roundOffDefault: true, paperSize: 'A4',
    bankName: 'Canara Bank, Jayanagar', bankAccount: '0412101003388', bankIfsc: 'CNRB0000412', upiId: 'shreeganesh@canarabank',
    email: '', pan: '', terms: '',
  }
}

export interface SettingsService {
  get(): Promise<Settings>
  save(patch: Partial<Settings>): Promise<Settings>
}

export function createSettingsService(adapter: StorageAdapter): SettingsService {
  // defaults underneath, so settings saved by an older version still get any new fields
  const load = async () => ({ ...defaultSettings(), ...((await adapter.read<Settings>('settings'))[0] ?? {}) })
  return {
    get: load,
    async save(patch) {
      const next = { ...(await load()), ...patch, updatedAt: new Date().toISOString() }
      await adapter.write('settings', [next])
      return next
    },
  }
}
