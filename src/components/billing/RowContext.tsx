import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { formatINR } from '@/lib/format'
import { stockText } from '@/lib/units'
import type { Row } from '@/lib/billing'
import { parseRate } from '@/lib/billing'

/** What the operator needs to see without leaving the grid: stock, MRP, last cost, HSN, batch, margin. */
export function RowContext({ row, flash, over }: { row?: Row; flash: string; over?: string }) {
  const { t } = useTranslation('billing')
  const it = row?.item
  const rate = row ? parseRate(row.rate) : null
  const margin = it && rate && rate > 0 && it.purchaseRate ? ((rate - it.purchaseRate) / rate) * 100 : null
  const tone = !it ? '' : it.currentStock <= 0 ? 'text-danger' : it.currentStock <= it.lowStockThreshold ? 'text-warn' : 'text-ok'
  return (
    <div className="flex h-8 shrink-0 items-center gap-5 overflow-hidden rounded-md border border-line bg-sunken px-3 text-sm" aria-live="polite">
      {flash ? (
        <span className="font-medium text-danger">{flash}</span>
      ) : it ? (
        <>
          <span className="max-w-[260px] truncate font-medium text-ink-900">{it.name}</span>
          <span className="text-ink-600">{t('context.available')} <span className={`font-mono font-medium ${tone}`}>{stockText(it, it.currentStock)}</span></span>
          <span className="text-ink-600">{t('context.mrp')} <span className="font-mono text-ink-900">{formatINR(it.mrp)}</span></span>
          <span className="text-ink-600">{t('context.lastPurchase')} <span className="font-mono text-ink-900">{formatINR(it.purchaseRate)}</span></span>
          <span className="text-ink-600">{t('context.hsn')} <span className="font-mono text-ink-900">{it.hsn || '-'}</span></span>
          {it.batchNo && <span className="text-ink-600">{t('context.batch')} <span className="font-mono text-ink-900">{it.batchNo}</span></span>}
          {margin !== null && <span className="text-ink-600">{t('context.margin')} <span className={`font-mono ${margin < 0 ? 'text-danger' : 'text-ink-900'}`}>{margin.toFixed(1)}%</span></span>}
        </>
      ) : (
        <span className="text-ink-400">{t('context.empty')}</span>
      )}
      {over && <span className="ml-auto flex shrink-0 items-center gap-1.5 font-medium text-warn"><Info size={15} />{over}</span>}
    </div>
  )
}
