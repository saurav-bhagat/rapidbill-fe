import { createRepo } from './repo'
import { createLedgerService } from './ledger'
import { createInventoryService, type InventoryService } from './inventory'
import { createBillingService, type BillingService } from './voucher'
import { createSettingsService } from './settings'
import { writeSeed } from './seed'
import { createLocalStorageAdapter } from './storage/localStorageAdapter'
import { apiEnabled } from './http/client'
import { createMirrorServices } from '../offline/mirrorServices'
import { workspaceApi } from './http/services'
import type { StockLedgerService } from './ledger'
import type { SettingsService } from './settings'
import type { Item, ItemService, Party, PartyService, Voucher, VoucherService } from './types'

const adapter = createLocalStorageAdapter()

interface Services {
  items: ItemService
  inventory: InventoryService
  billing: BillingService
  parties: PartyService
  vouchers: VoucherService
  ledger: StockLedgerService
  settings: SettingsService
}

function localServices(): Services {
  return {
    items: createRepo<Item>(adapter, 'items'),
    inventory: createInventoryService(adapter),
    billing: createBillingService(adapter),
    parties: createRepo<Party>(adapter, 'parties'),
    vouchers: createRepo<Voucher>(adapter, 'vouchers'),
    ledger: createLedgerService(adapter),
    settings: createSettingsService(adapter),
  }
}

/** With an account: reads come from the copy on this device, writes go to the server (see offline/mirrorServices). */
function httpServices(): Services {
  return createMirrorServices()
}

/** The only thing UI code imports. With VITE_API_URL set it talks to the backend; without it, it uses this browser's storage. */
export const services: Services = apiEnabled ? httpServices() : localServices()

/** First-run: seed demo data when the workspace is empty. */
export async function bootstrap(): Promise<void> {
  if (apiEnabled) return // an account starts empty; demo data is opt-in from Settings
  // Billing never blocks on recorded stock any more (goods can be on the shelf before the count is updated). Undo an older saved 'block' choice.
  if ((await services.settings.get()).overIssue === 'BLOCK') await services.settings.save({ overIssue: 'ALLOW_WARN' })
  if (await adapter.isEmpty()) await writeSeed(adapter)
}

export async function resetDemoData(password?: string): Promise<void> {
  if (apiEnabled) { await workspaceApi.resetDemo(password ?? ''); return }
  await adapter.clearWorkspace()
  await writeSeed(adapter)
}

/** Empties items, parties, vouchers and the stock ledger. Business settings are kept. Collections stay present so a reload does not re-seed demo data. */
export async function clearAllData(password?: string): Promise<void> {
  if (apiEnabled) { await workspaceApi.clear(password ?? ''); return }
  for (const c of ['items', 'parties', 'vouchers', 'ledger']) await adapter.write(c, [])
}

export * from './types'
export { AppError, type ErrorKey, type ErrorParams } from './errors'
export { BillingError, type VoucherInput, type VoucherLineInput } from './voucher'
