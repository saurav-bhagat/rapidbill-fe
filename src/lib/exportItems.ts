import { format } from 'date-fns'
import type { Item } from '@/services/types'
import { toRupees } from './money'
import { download } from './download'

/** Header names are the ones the Phase 5 importer will recognise, so export -> import round-trips. */
export function itemsToRows(items: Item[]): Record<string, string | number>[] {
  return items.map((i) => ({
    'Item Code': i.code, 'Item Name': i.name, Category: i.category, HSN: i.hsn, Unit: i.unit, 'Batch No': i.batchNo,
    Expiry: i.expiry, MRP: toRupees(i.mrp), 'Purchase Rate': toRupees(i.purchaseRate), 'Issue Rate': toRupees(i.issueRate),
    'GST %': i.gstPercent, 'Current Stock': i.currentStock, 'Low Stock Alert': i.lowStockThreshold,
  }))
}

export async function exportItems(items: Item[], kind: 'xlsx' | 'csv'): Promise<void> {
  const XLSX = await import('xlsx') // loaded on demand to keep the first paint light
  const ws = XLSX.utils.json_to_sheet(itemsToRows(items))
  const base = `rapidbill-inventory-${format(new Date(), 'yyyy-MM-dd')}`
  if (kind === 'csv') {
    download(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`)
}
