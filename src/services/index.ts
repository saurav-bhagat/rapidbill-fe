import { createRepo } from './repo'
import { createLedgerService } from './ledger'
import { createInventoryService, type InventoryService } from './inventory'
import { createBillingService, type BillingService } from './voucher'
import { createSettingsService } from './settings'
import { writeSeed } from './seed'
import { createLocalStorageAdapter } from './storage/localStorageAdapter'
import type { Item, ItemService, Party, PartyService, Voucher, VoucherService } from './types'

const adapter = createLocalStorageAdapter()

/** The only thing UI code imports. Swap `adapter` for an HTTP-backed one later. */
export const services: {
  items: ItemService
  inventory: InventoryService
  billing: BillingService
  parties: PartyService
  vouchers: VoucherService
  ledger: ReturnType<typeof createLedgerService>
  settings: ReturnType<typeof createSettingsService>
} = {
  items: createRepo<Item>(adapter, 'items'),
  inventory: createInventoryService(adapter),
  billing: createBillingService(adapter),
  parties: createRepo<Party>(adapter, 'parties'),
  vouchers: createRepo<Voucher>(adapter, 'vouchers'),
  ledger: createLedgerService(adapter),
  settings: createSettingsService(adapter),
}

/** First-run: seed demo data when the workspace is empty. */
export async function bootstrap(): Promise<void> {
  if (await adapter.isEmpty()) await writeSeed(adapter)
}

export async function resetDemoData(): Promise<void> {
  await adapter.clearWorkspace()
  await writeSeed(adapter)
}

/** Empties items, parties, vouchers and the stock ledger. Business settings are kept. Collections stay present so a reload does not re-seed demo data. */
export async function clearAllData(): Promise<void> {
  for (const c of ['items', 'parties', 'vouchers', 'ledger']) await adapter.write(c, [])
}

export * from './types'
export { AppError, type ErrorKey, type ErrorParams } from './errors'
export { BillingError, type VoucherInput, type VoucherLineInput } from './voucher'
