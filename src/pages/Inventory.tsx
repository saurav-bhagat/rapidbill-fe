import { useMemo, useRef, useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLicense } from '@/license/store'
import { useSync } from '@/offline/state'
import { errorText } from '@/lib/errors'
import { formatAmount, formatINR } from '@/lib/format'
import { stockText } from '@/lib/units'
import { exportItems } from '@/lib/exportItems'
import { useHotkey } from '@/lib/hotkeys'
import { matchesQuery } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { services, type Item } from '@/services'
import { toast } from '@/store/toast'
import { AdjustStockModal } from '@/components/inventory/AdjustStockModal'
import { ImportWizard } from '@/components/inventory/ImportWizard'
import { ItemFormDrawer } from '@/components/inventory/ItemFormDrawer'
import { MovementsDrawer } from '@/components/inventory/MovementsDrawer'
import { StockBadge, stockLevel } from '@/components/inventory/StockBadge'
import { Badge } from '@/components/ui/Badge'
import { LoadFailed } from '@/components/ui/LoadFailed'

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { SearchInput } from '@/components/ui/SearchInput'
import { VirtualTable, type SortState, type VColumn } from '@/components/ui/VirtualTable'

type StockFilter = 'all' | 'low' | 'out'
type Panel = null | 'movements' | 'form' | 'adjust' | 'import'

const SORTERS: Record<string, (a: Item, b: Item) => number> = {
  code: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) => a.category.localeCompare(b.category),
  mrp: (a, b) => a.mrp - b.mrp,
  issueRate: (a, b) => a.issueRate - b.issueRate,
  gst: (a, b) => a.gstPercent - b.gstPercent,
  stock: (a, b) => a.currentStock - b.currentStock,
}

export function Inventory() {
  const { t } = useTranslation('inventory')
  const tCommon = useTranslation('common').t
  const canWrite = useLicense()?.canWrite ?? true
  const waiting = useSync((x) => x.pendingIds)
  const refused = useSync((x) => x.failedIds)
  const { data: loaded, error: loadError, reload } = useAsync(() => services.items.list())
  const items = loaded ?? []
  const { data: settings } = useAsync(() => services.settings.get())
  const gstOn = settings?.gstEnabled !== false
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [stockF, setStockF] = useState<StockFilter>('all')
  const [sort, setSort] = useState<SortState>({ key: 'code', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<string>()
  const [panel, setPanel] = useState<Panel>(null)
  const [formMode, setFormMode] = useState<'new' | 'edit'>('new')
  const [version, setVersion] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items])
  const rows = useMemo(() => {
    const f = items.filter(
      (i) =>
        matchesQuery(query, [i.name, i.code, i.category, i.batchNo, i.hsn]) &&
        (!category || i.category === category) &&
        (stockF === 'all' || (stockF === 'out' ? stockLevel(i) === 'out' : stockLevel(i) !== 'ok')),
    )
    const cmp = SORTERS[sort.key] ?? SORTERS.code
    return f.sort((a, b) => (sort.dir === 'asc' ? cmp(a, b) : cmp(b, a)))
  }, [items, query, category, stockF, sort])

  const selected = items.find((i) => i.id === selectedId)
  const stats = useMemo(() => ({
    low: items.filter((i) => stockLevel(i) === 'low').length,
    out: items.filter((i) => stockLevel(i) === 'out').length,
    value: items.reduce((s, i) => s + Math.round(i.currentStock * i.purchaseRate), 0),
  }), [items])

  const refresh = () => { reload(); setVersion((v) => v + 1) }
  const openNew = () => { setFormMode('new'); setPanel('form') }
  const openEdit = (i?: Item) => { if (!i) return; setSelectedId(i.id); setFormMode('edit'); setPanel('form') }
  const focusTable = () => document.querySelector<HTMLElement>('[role=grid]')?.focus()

  useHotkey('/', () => searchRef.current?.focus())
  useHotkey('n', openNew)
  useHotkey('e', () => openEdit(selected))
  useHotkey('a', () => selected && setPanel('adjust'))
  useHotkey('i', () => setPanel('import'))

  const columns: VColumn<Item>[] = [
    { key: 'code', header: t('col.code'), width: '96px', sortable: true, cell: (i) => <span className="font-mono text-ink-600">{i.code}</span> },
    { key: 'name', header: t('col.item'), sortable: true, cell: (i) => <span className="flex items-center gap-2"><span className="font-medium">{i.name}</span>{waiting.includes(i.id) && <Badge tone="warn">{tCommon('sync.notSynced')}</Badge>}{refused.includes(i.id) && <Badge tone="danger">{tCommon('sync.refused')}</Badge>}</span> },
    { key: 'category', header: t('col.category'), width: '140px', sortable: true, cell: (i) => <span className="text-ink-600">{i.category}</span> },
    { key: 'batch', header: t('col.batchExp'), width: '140px', cell: (i) => <span className="font-mono text-ink-600">{i.batchNo ? `${i.batchNo} · ${i.expiry}` : '-'}</span> },
    { key: 'mrp', header: t('col.mrp'), width: '96px', align: 'right', sortable: true, cell: (i) => formatAmount(i.mrp) },
    { key: 'issueRate', header: t('col.issueRate'), width: '96px', align: 'right', sortable: true, cell: (i) => formatAmount(i.issueRate) },
    ...(gstOn ? [{ key: 'gst', header: t('col.gst'), width: '64px', align: 'right' as const, sortable: true, cell: (i: Item) => `${i.gstPercent}%` }] : []),
    {
      key: 'stock', header: t('col.stock'), width: '170px', align: 'right', sortable: true,
      cell: (i) => (
        <span className="inline-flex items-center justify-end gap-2">
          {stockLevel(i) !== 'ok' && <StockBadge item={i} />}
          <span className={stockLevel(i) === 'out' ? 'text-danger' : stockLevel(i) === 'low' ? 'text-warn' : ''}>{stockText(i, i.currentStock)}</span>
        </span>
      ),
    },
  ]

  const doExport = async (kind: 'xlsx' | 'csv') => {
    try { await exportItems(rows, kind); toast.success(t('page.exported', { n: rows.length })) }
    catch (e) { toast.error(errorText(t, e, t('page.exportFailed'))) }
  }

  if (loadError && !loaded) return <LoadFailed error={loadError} onRetry={reload} />

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} inputRef={searchRef} placeholder={t('page.searchPlaceholder')} onEnterResults={focusTable} />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-44" aria-label={t('page.category')}>
          <option value="">{t('page.allCategories')}</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={stockF} onChange={(e) => setStockF(e.target.value as StockFilter)} className="!w-36" aria-label={t('page.stockLevel')}>
          <option value="all">{t('page.filterAll')}</option><option value="low">{t('page.filterLow')}</option><option value="out">{t('page.filterOut')}</option>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button icon={<Upload size={14} />} hotkey="i" disabled={!canWrite} onClick={() => setPanel('import')}>{t('page.import')}</Button>
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => doExport('xlsx')}>.xlsx</Button>
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => doExport('csv')}>.csv</Button>
          <Button variant="primary" icon={<Plus size={14} />} hotkey="n" disabled={!canWrite} onClick={openNew}>{t('page.newItem')}</Button>
        </div>
      </div>

      <p className="text-sm text-ink-600">
        {rows.length === items.length ? t('page.countAll', { n: items.length }) : t('page.countSome', { shown: rows.length, total: items.length })}
        <span className="mx-2 text-line">|</span>{t('page.lowCount', { n: stats.low })}
        <span className="mx-2 text-line">|</span>{t('page.outCount', { n: stats.out })}
        <span className="mx-2 text-line">|</span>{t('page.stockValue')} <span className="font-mono text-ink-900">{formatINR(stats.value)}</span>
      </p>

      <VirtualTable
        label={t('page.tableLabel')}
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onActivate={(i) => { setSelectedId(i.id); setPanel('movements') }}
        activateOnClick
        sort={sort}
        onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
        empty={items.length === 0 ? t('page.emptyNone') : t('page.emptyFiltered')}
      />
      <p className="text-sm text-ink-400">{t('page.hints')}</p>

      <ImportWizard open={panel === 'import'} items={items} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh() }} />
      <MovementsDrawer item={selected} open={panel === 'movements'} version={version} onClose={() => setPanel(null)} onEdit={() => openEdit(selected)} onAdjust={() => setPanel('adjust')} />
      <ItemFormDrawer
        open={panel === 'form'}
        item={formMode === 'edit' ? selected : undefined}
        existingItems={items}
        onClose={() => setPanel(null)}
        onSaved={(i) => { setSelectedId(i.id); setPanel(null); refresh() }}
      />
      <AdjustStockModal open={panel === 'adjust'} item={selected} onClose={() => setPanel('movements')} onSaved={() => { refresh(); setPanel('movements') }} />
    </div>
  )
}
