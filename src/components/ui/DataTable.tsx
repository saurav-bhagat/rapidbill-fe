import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  width?: string
}

/** Dense, hairline table. Virtualisation arrives in Phase 2. */
export function DataTable<T>({ columns, rows, rowKey, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-base">
        <thead className="sticky top-0 bg-sunken">
          <tr>
            {columns.map((c) => (
              <th key={c.header} style={{ width: c.width }} className={`h-9 border-b border-line px-3 text-sm font-medium text-ink-600 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-ink-400">{empty ?? t('status.nothingHere')}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={rowKey(r)} className="h-9 border-b border-line last:border-b-0 hover:bg-primary-soft/50">
              {columns.map((c) => (
                <td key={c.header} className={`whitespace-nowrap px-3 ${c.align === 'right' ? 'num' : 'text-left'}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
