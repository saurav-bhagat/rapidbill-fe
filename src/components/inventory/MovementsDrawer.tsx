import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Pencil, SlidersHorizontal } from 'lucide-react'
import { errorText } from '@/lib/errors'
import { formatINR, formatQty } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useAsync } from '@/lib/useAsync'
import { services, type Item } from '@/services'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Modal'
import { StockBadge } from './StockBadge'

interface Props { item?: Item; open: boolean; version: number; onClose: () => void; onEdit: () => void; onAdjust: () => void }

export function MovementsDrawer({ item, open, version, onClose, onEdit, onAdjust }: Props) {
  const { t } = useTranslation('inventory')
  const { data, loading, error, reload } = useAsync(() => (item ? services.inventory.ledgerFor(item.id) : Promise.resolve([])), [item?.id, open, version])
  useHotkey('e', onEdit, { scope: 'modal', enabled: open })
  useHotkey('a', onAdjust, { scope: 'modal', enabled: open })
  const rows = [...(data ?? [])].reverse() // newest first

  return (
    <Drawer open={open} onClose={onClose} title={t('movements.title')} width="480px">
      {item && (
        <>
          <div className="mb-4 rounded-md border border-line bg-paper p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{item.name}</div>
                <div className="font-mono text-sm text-ink-600">{item.code}{item.batchNo ? ` · ${t('movements.batch', { batch: item.batchNo })}` : ''}{item.expiry ? ` · ${t('movements.exp', { exp: item.expiry })}` : ''}</div>
              </div>
              <div className="text-right">
                <div className="num text-2xl">{formatQty(item.currentStock)} <span className="text-base text-ink-600">{item.unit}</span></div>
                <StockBadge item={item} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-sm">
              <div><div className="text-ink-400">{t('movements.mrp')}</div><div className="num !text-left">{formatINR(item.mrp)}</div></div>
              <div><div className="text-ink-400">{t('movements.purchase')}</div><div className="num !text-left">{formatINR(item.purchaseRate)}</div></div>
              <div><div className="text-ink-400">{t('movements.issue')}</div><div className="num !text-left">{formatINR(item.issueRate)}</div></div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={onEdit} icon={<Pencil size={14} />} hotkey="e">{t('movements.edit')}</Button>
              <Button onClick={onAdjust} icon={<SlidersHorizontal size={14} />} hotkey="a">{t('movements.adjust')}</Button>
            </div>
          </div>
          <table className="w-full text-base">
            <thead>
              <tr className="h-8 border-b border-line text-left text-sm text-ink-600">
                <th className="font-medium">{t('movements.when')}</th><th className="font-medium">{t('movements.movement')}</th>
                <th className="text-right font-medium">{t('movements.qty')}</th><th className="text-right font-medium">{t('movements.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {error && !data && <tr><td colSpan={4} className="py-6 text-center"><p role="alert" className="text-danger">{errorText(t, error, t('movements.failed'))}</p><Button className="mt-2" onClick={reload}>{t('movements.retry')}</Button></td></tr>}
              {!loading && !error && rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink-400">{t('movements.none')}</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className="h-9 border-b border-line align-middle">
                  <td className="whitespace-nowrap text-ink-600">{format(parseISO(e.createdAt), 'dd-MM-yy HH:mm')}</td>
                  <td>
                    <div>{t(`movements.type.${e.type}`)}{e.voucherNo && <span className="ml-1 font-mono text-sm text-ink-600">{e.voucherNo}</span>}</div>
                    {e.note && e.type === 'ADJUST' && <div className="text-sm text-ink-400">{e.note}</div>}
                  </td>
                  <td className={`num ${e.qtyDelta > 0 ? 'text-ok' : 'text-danger'}`}>{e.qtyDelta > 0 ? '+' : ''}{formatQty(e.qtyDelta)}</td>
                  <td className="num">{formatQty(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2"><Badge>{t('movements.count', { n: rows.length })}</Badge></div>
        </>
      )}
    </Drawer>
  )
}
