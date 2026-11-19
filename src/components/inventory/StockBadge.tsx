import { useTranslation } from 'react-i18next'
import type { Item } from '@/services'
import { Badge } from '../ui/Badge'

export type StockLevel = 'out' | 'low' | 'ok'
export const stockLevel = (i: Item): StockLevel => (i.currentStock <= 0 ? 'out' : i.currentStock <= i.lowStockThreshold ? 'low' : 'ok')

export function StockBadge({ item }: { item: Item }) {
  const { t } = useTranslation('inventory')
  const l = stockLevel(item)
  return l === 'out' ? <Badge tone="danger">{t('badge.out')}</Badge> : l === 'low' ? <Badge tone="warn">{t('badge.low')}</Badge> : <Badge tone="ok">{t('badge.ok')}</Badge>
}
