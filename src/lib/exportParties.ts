import { format } from 'date-fns'
import type { Party } from '@/services/types'
import { toRupees } from './money'
import { download } from './download'

/** Column names are ones the party importer recognises, so export -> import round-trips. */
export function partiesToRows(parties: Party[]): Record<string, string | number>[] {
  return parties.map((p) => ({
    'Party Name': p.name, Type: p.type === 'CUSTOMER' ? 'Customer' : p.type === 'DEPARTMENT' ? 'Department' : 'Branch', GSTIN: p.gstin, 'State Code': p.stateCode,
    Mobile: p.phone, Address: p.address, 'Opening Balance': toRupees(p.balance),
  }))
}

export async function exportParties(parties: Party[], kind: 'xlsx' | 'csv'): Promise<void> {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(partiesToRows(parties))
  const base = `rapidbill-parties-${format(new Date(), 'yyyy-MM-dd')}`
  if (kind === 'csv') {
    download(new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Parties')
  download(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`)
}
