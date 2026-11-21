import { useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useLicense } from '@/license/store'
import { useSync } from '@/offline/state'
import { Download, Plus, Upload } from 'lucide-react'
import { formatINR } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { errorText } from '@/lib/errors'
import { useHotkey } from '@/lib/hotkeys'
import { matchesQuery } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { services, type Party, type PartyType } from '@/services'
import { toast } from '@/store/toast'
import { PartyFormDrawer } from '@/components/parties/PartyFormDrawer'
import { PartyImportWizard } from '@/components/parties/PartyImportWizard'
import { exportParties } from '@/lib/exportParties'
import { Badge } from '@/components/ui/Badge'
import { LoadFailed } from '@/components/ui/LoadFailed'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Field'
import { SearchInput } from '@/components/ui/SearchInput'
import { VirtualTable, type SortState, type VColumn } from '@/components/ui/VirtualTable'

const TYPE_KEY: Record<PartyType, string> = { CUSTOMER: 'customer', DEPARTMENT: 'department', BRANCH: 'branch' }
const SORT: Record<string, (a: Party, b: Party) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  type: (a, b) => a.type.localeCompare(b.type),
  state: (a, b) => a.stateCode.localeCompare(b.stateCode),
  balance: (a, b) => a.balance - b.balance,
}

export function Parties() {
  const { t } = useTranslation('parties')
  const tCommon = useTranslation('common').t
  const canWrite = useLicense()?.canWrite ?? true
  const waiting = useSync((x) => x.pendingIds)
  const refused = useSync((x) => x.failedIds)
  const { data: loaded, error: loadError, reload } = useAsync(() => services.parties.list())
  const parties = loaded ?? []
  const { data: settings } = useAsync(() => services.settings.get())
  const [query, setQuery] = useState('')
  const [type, setType] = useState<PartyType | ''>('')
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<string>()
  const [form, setForm] = useState<{ open: boolean; party?: Party }>({ open: false })
  const [toDelete, setToDelete] = useState<Party>()
  const searchRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => {
    const f = parties.filter((p) => matchesQuery(query, [p.name, p.gstin, p.phone, p.address, stateName(p.stateCode)]) && (!type || p.type === type))
    const cmp = SORT[sort.key] ?? SORT.name
    return f.sort((a, b) => (sort.dir === 'asc' ? cmp(a, b) : cmp(b, a)))
  }, [parties, query, type, sort])
  const selected = parties.find((p) => p.id === selectedId)

  const [importing, setImporting] = useState(false)
  const doExport = async (kind: 'xlsx' | 'csv') => {
    try { await exportParties(rows, kind); toast.success(t('page.exported', { n: rows.length })) }
    catch (e) { toast.error(errorText(t, e, t('page.exportFailed'))) }
  }
  useHotkey('i', () => setImporting(true))
  const openNew = () => setForm({ open: true })
  const openEdit = (p?: Party) => { if (p) { setSelectedId(p.id); setForm({ open: true, party: p }) } }
  const askDelete = (p?: Party) => p && setToDelete(p)

  const confirmDelete = async () => {
    const p = toDelete
    if (!p) return
    setToDelete(undefined)
    try {
      const used = (await services.vouchers.list()).filter((v) => v.partyId === p.id).length
      if (used > 0) return toast.error(t('toast.inUse', { name: p.name, count: used }))
      await services.parties.remove(p.id)
      toast.success(t('toast.deleted', { name: p.name }))
      setSelectedId(undefined)
      reload()
    } catch (e) {
      toast.error(errorText(t, e, t('toast.deleteFailed', { name: p.name })))
    }
  }

  useHotkey('/', () => searchRef.current?.focus())
  useHotkey('n', openNew)
  useHotkey('e', () => openEdit(selected))

  const columns: VColumn<Party>[] = [
    { key: 'name', header: t('columns.name'), sortable: true, cell: (p) => <span className="flex items-center gap-2"><span className="font-medium">{p.name}</span>{waiting.includes(p.id) && <Badge tone="warn">{tCommon('sync.notSynced')}</Badge>}{refused.includes(p.id) && <Badge tone="danger">{tCommon('sync.refused')}</Badge>}</span> },
    { key: 'type', header: t('columns.type'), width: '120px', sortable: true, cell: (p) => <Badge tone={p.type === 'CUSTOMER' ? 'neutral' : 'primary'}>{t(`type.${TYPE_KEY[p.type]}`)}</Badge> },
    { key: 'gstin', header: t('columns.gstin'), width: '170px', cell: (p) => <span className="font-mono text-ink-600">{p.gstin || t('unregistered')}</span> },
    { key: 'state', header: t('columns.state'), width: '180px', sortable: true, cell: (p) => <span className="text-ink-600">{p.stateCode} · {stateName(p.stateCode)}</span> },
    { key: 'phone', header: t('columns.phone'), width: '130px', cell: (p) => <span className="text-ink-600">{p.phone || '-'}</span> },
    { key: 'balance', header: t('columns.balance'), width: '130px', align: 'right', sortable: true, cell: (p) => (p.balance === 0 ? <span className="text-ink-400">-</span> : <span className={p.balance > 0 ? 'text-ink-900' : 'text-ok'}>{formatINR(Math.abs(p.balance))} {p.balance > 0 ? t('dr') : t('cr')}</span>) },
  ]

  if (loadError && !loaded) return <LoadFailed error={loadError} onRetry={reload} />

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} inputRef={searchRef} placeholder={t('search')} onEnterResults={() => document.querySelector<HTMLElement>('[role=grid]')?.focus()} />
        <Select value={type} onChange={(e) => setType(e.target.value as PartyType | '')} className="!w-40" aria-label={t('typeLabel')}>
          <option value="">{t('allTypes')}</option><option value="CUSTOMER">{t('typePlural.customer')}</option><option value="DEPARTMENT">{t('typePlural.department')}</option><option value="BRANCH">{t('typePlural.branch')}</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setImporting(true)} icon={<Upload size={14} />} hotkey="i" disabled={!canWrite}>{t('page.import')}</Button>
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => void doExport('xlsx')}>{t('page.exportXlsx')}</Button>
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => void doExport('csv')}>{t('page.exportCsv')}</Button>
          <Button variant="primary" icon={<Plus size={14} />} hotkey="n" disabled={!canWrite} onClick={openNew}>{t('newParty')}</Button>
        </div>
      </div>
      <p className="text-sm text-ink-600">{rows.length === parties.length ? t('count', { count: parties.length }) : t('countOf', { shown: rows.length, total: parties.length })}</p>
      <VirtualTable
        label={t('tableLabel')}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onActivate={openEdit}
        sort={sort}
        onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
        onKeyExtra={(e, row) => { if (e.key === 'Delete' && row) { e.preventDefault(); askDelete(row) } }}
        empty={parties.length === 0 ? t('empty.none') : t('empty.filtered')}
      />
      <p className="text-sm text-ink-400">{t('hint')}</p>

      <PartyImportWizard open={importing} parties={parties} onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload() }} />
      <PartyFormDrawer
        open={form.open}
        party={form.party}
        existing={parties}
        defaultState={settings?.stateCode}
        onClose={() => setForm({ open: false })}
        onSaved={(p) => { setForm({ open: false }); setSelectedId(p.id); reload() }}
      />
      <ConfirmDialog open={!!toDelete} title={t('delete.title')} confirmLabel={t('delete.confirm')} danger onConfirm={confirmDelete} onCancel={() => setToDelete(undefined)}>
        {toDelete && <Trans t={t} i18nKey="delete.body" values={{ name: toDelete.name }} components={{ b: <strong className="text-ink-900" /> }} />}
      </ConfirmDialog>
    </div>
  )
}
