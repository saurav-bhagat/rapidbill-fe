import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { msgText } from '@/lib/itemForm'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { autoMap, buildPreview, detectHeaderRow, FIELDS, SAMPLE_CSV, type FieldKey, type ImportOptions, type Msg, type ItemData, type Mapping, type PreviewRow, type Sheet } from '@/lib/importer'
import { colLetter, readWorkbook } from '@/lib/importerIO'
import { download } from '@/lib/download'
import { formatAmount, formatQty } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useAsync } from '@/lib/useAsync'
import { services, type Item } from '@/services'
import type { ImportOp } from '@/services/inventory'
import { toast } from '@/store/toast'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { VirtualTable, type VColumn } from '../ui/VirtualTable'

type Step = 'upload' | 'map' | 'preview'
type Filter = 'all' | 'create' | 'update' | 'skip' | 'error' | 'warn'
const cellText = (c: unknown) => (c === null || c === undefined ? '' : c instanceof Date ? c.toLocaleDateString('en-IN') : String(c).trim())

interface Props { open: boolean; items: Item[]; onClose: () => void; onDone: () => void }

export function ImportWizard({ open, items, onClose, onDone }: Props) {
  const { t } = useTranslation('import')
  const m = (x: Msg) => msgText(t, x, 'import')
  const { data: settings } = useAsync(() => services.settings.get())
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [map, setMap] = useState<Mapping>(() => autoMap([]))
  const [opts, setOpts] = useState<ImportOptions>({ mode: 'UPSERT', stockMode: 'REPLACE' })
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [selected, setSelected] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setStep('upload'); setSheets([]); setFileName(''); setError(''); setFilter('all'); setOpts({ mode: 'UPSERT', stockMode: 'REPLACE' }) }
  }, [open])

  const rows = sheets[sheetIdx]?.rows ?? []
  const headers = rows[headerRow] ?? []

  const useSheet = (list: Sheet[], idx: number) => {
    const r = list[idx].rows
    const h = detectHeaderRow(r)
    setSheetIdx(idx); setHeaderRow(h); setMap(autoMap(r[h] ?? []))
  }

  const load = async (file: File) => {
    setError(''); setBusy(true)
    try {
      const list = await readWorkbook(file)
      setSheets(list); setFileName(file.name); useSheet(list, 0); setStep('map')
    } catch (e) { setError(errorText(t, e, t('readFailed'))) }
    finally { setBusy(false) }
  }

  const preview = useMemo(() => (step === 'preview' ? buildPreview(rows, headerRow, map, items, { ...opts, gstEnabled: settings?.gstEnabled }) : []), [step, rows, headerRow, map, items, opts, settings?.gstEnabled])
  const counts = useMemo(() => ({
    create: preview.filter((r) => r.action === 'create').length, update: preview.filter((r) => r.action === 'update').length,
    skip: preview.filter((r) => r.action === 'skip').length, error: preview.filter((r) => r.action === 'error').length,
    warn: preview.filter((r) => r.warnings.length > 0 && (r.action === 'create' || r.action === 'update')).length,
  }), [preview])
  const shown = useMemo(() => preview.filter((r) => filter === 'all' || (filter === 'warn' ? r.warnings.length > 0 && (r.action === 'create' || r.action === 'update') : r.action === filter)), [preview, filter])
  const actionable = counts.create + counts.update

  const nextDisabled = step === 'upload' || (step === 'map' && map.name < 0)
  const doImport = async () => {
    const ops: ImportOp[] = preview.flatMap((r): ImportOp[] =>
      r.action === 'create' ? [{ kind: 'create', data: { ...(r.data as ItemData), currentStock: r.stock ?? 0 } }]
        : r.action === 'update' ? [{ kind: 'update', id: r.matchId!, patch: r.data as Omit<ItemData, 'currentStock'>, stockDelta: r.stockDelta }] : [])
    if (ops.length === 0) return
    setBusy(true)
    try {
      const res = await services.inventory.importItems(ops, fileName)
      toast.success(t('done', { created: res.created, updated: res.updated }))
      onDone()
    } catch (e) { toast.error(errorText(t, e, t('failed'))) }
    finally { setBusy(false) }
  }
  const next = () => { if (step === 'map' && map.name >= 0) setStep('preview'); else if (step === 'preview' && actionable > 0 && !busy) doImport() }
  useHotkey('mod+enter', next, { scope: 'modal', enabled: open })

  const samples = (col: number) => rows.slice(headerRow + 1, headerRow + 40).map((r) => cellText(r[col])).filter(Boolean).slice(0, 3).join(' · ')
  const colOptions = headers.map((h, i) => ({ i, label: `${colLetter(i)} · ${cellText(h) || t('blank')}` }))

  const statusBadge = (r: PreviewRow) => r.action === 'create' ? <Badge tone="primary">{t('status.create')}</Badge> : r.action === 'update' ? <Badge tone="ok">{t('status.update')}</Badge> : r.action === 'error' ? <Badge tone="danger">{t('status.error')}</Badge> : <Badge>{t('status.skip')}</Badge>
  const columns: VColumn<PreviewRow>[] = [
    { key: 'line', header: t('col.row'), width: '56px', align: 'right', cell: (r) => <span className="text-ink-400">{r.line}</span> },
    { key: 'status', header: t('col.status'), width: '150px', cell: (r) => <span className="inline-flex gap-1">{statusBadge(r)}{r.warnings.length > 0 && r.action !== 'skip' && <Badge tone="warn">{t('status.warning')}</Badge>}</span> },
    { key: 'name', header: t('col.item'), cell: (r) => <span className="font-medium">{r.name || t('emptyName')}</span> },
    { key: 'code', header: t('col.code'), width: '96px', cell: (r) => <span className="font-mono text-ink-600">{r.code}</span> },
    { key: 'rate', header: t('col.saleRate'), width: '90px', align: 'right', cell: (r) => (r.data.issueRate !== undefined ? <span className={r.data.issueRate === 0 ? 'text-danger' : ''}>{formatAmount(r.data.issueRate)}</span> : <span className="text-ink-400">-</span>) },
    { key: 'gst', header: t('col.gst'), width: '56px', align: 'right', cell: (r) => (r.data.gstPercent !== undefined ? `${r.data.gstPercent}%` : '-') },
    { key: 'stock', header: t('col.stock'), width: '120px', align: 'right', cell: (r) => (r.action === 'update' && r.stockDelta ? <span>{r.stockDelta > 0 ? '+' : ''}{formatQty(r.stockDelta)}</span> : r.action === 'create' ? formatQty(r.stock ?? 0) : '-') },
    { key: 'notes', header: t('col.notes'), width: '260px', cell: (r) => <span title={[r.note, ...r.warnings].filter((x): x is Msg => !!x).map(m).join('\n')} className={r.action === 'error' ? 'text-danger' : r.warnings.length ? 'text-warn' : 'text-ink-600'}>{r.note ? m(r.note) : r.warnings[0] ? m(r.warnings[0]) : ''}{!r.note && r.warnings.length > 1 ? ` (+${r.warnings.length - 1})` : ''}</span> },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('title')}${fileName ? ` · ${fileName}` : ''}`}
      width="min(1040px, 96vw)"
      footer={
        <>
          <ol className="mr-auto flex items-center gap-3 text-sm text-ink-600" aria-label={t('steps.label')}>
            {(['upload', 'map', 'preview'] as Step[]).map((s, n) => (
              <li key={s} aria-current={s === step} className={s === step ? 'font-semibold text-primary' : ''}>{n + 1}. {t(`steps.${s}`)}</li>
            ))}
          </ol>
          {step !== 'upload' && <Button onClick={() => setStep(step === 'preview' ? 'map' : 'upload')}>{t('back')}</Button>}
          <Button onClick={onClose}>{t('cancel')}</Button>
          {step === 'map' && <Button variant="primary" hotkey="mod+enter" disabled={nextDisabled} onClick={next}>{t('reviewRows')}</Button>}
          {step === 'preview' && <Button variant="primary" hotkey="mod+enter" disabled={actionable === 0 || busy} onClick={next}>{busy ? t('importing') : t('importBtn', { count: actionable })}</Button>}
        </>
      }
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f) }}
            className={`grid place-items-center rounded-lg border-2 border-dashed px-6 py-12 text-center ${drag ? 'border-primary bg-primary-soft' : 'border-line bg-paper'}`}
          >
            <UploadCloud size={32} className="mb-3 text-ink-400" />
            <p className="text-lg font-medium">{t('dropHere')}</p>
            <p className="mb-4 mt-1 text-ink-600">{t('dropHint')}</p>
            <Button variant="primary" icon={<FileSpreadsheet size={14} />} onClick={() => fileInput.current?.click()} disabled={busy} autoFocus>{busy ? t('reading') : t('chooseFile')}</Button>
            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
          </div>
          {error && <p role="alert" className="rounded border border-line bg-danger-soft px-3 py-2 text-danger">{error}</p>}
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => download(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }), 'rapidbill-sample-marg.csv')}>{t('sample')}</Button>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {sheets.length > 1 && (
              <label className="block"><span className="mb-1 block text-sm font-medium text-ink-600">{t('sheet')}</span>
                <Select value={sheetIdx} onChange={(e) => useSheet(sheets, Number(e.target.value))} className="!w-48">{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</Select>
              </label>
            )}
            <label className="block"><span className="mb-1 block text-sm font-medium text-ink-600">{t('headerRow')}</span>
              <Select value={headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setMap(autoMap(rows[h] ?? [])) }} className="!w-96">
                {rows.slice(0, 15).map((r, i) => <option key={i} value={i}>{t('rowOption', { n: i + 1, preview: r.map(cellText).filter(Boolean).slice(0, 4).join(', ') || t('emptyRow') })}</option>)}
              </Select>
            </label>
            <p className="pb-1 text-sm text-ink-600">{t('rowsBelow', { n: Math.max(0, rows.length - headerRow - 1) })}</p>
          </div>
          <table className="w-full text-base">
            <thead><tr className="h-8 border-b border-line text-left text-sm text-ink-600"><th className="w-56 font-medium">{t('colField')}</th><th className="w-72 font-medium">{t('colFile')}</th><th className="font-medium">{t('colSamples')}</th></tr></thead>
            <tbody>
              {FIELDS.map((f) => (
                <tr key={f.key} className="h-10 border-b border-line">
                  <td className="font-medium">{t(`field.${f.key}`)}{f.required && <span className="text-danger"> *</span>}</td>
                  <td className="pr-4">
                    <Select value={map[f.key]} aria-label={t('columnFor', { field: t(`field.${f.key}`) })} onChange={(e) => setMap((m) => ({ ...m, [f.key as FieldKey]: Number(e.target.value) }))} aria-invalid={f.required && map[f.key] < 0}>
                      <option value={-1}>{t('notMapped')}</option>
                      {colOptions.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                    </Select>
                  </td>
                  <td className="truncate font-mono text-sm text-ink-600">{map[f.key] >= 0 ? samples(map[f.key]) : <span className="font-sans text-ink-400">{f.required ? t('requiredHint') : t('defaultHint')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex h-[min(60vh,520px)] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2 text-sm text-ink-600">{t('ifExists')}
              <Segmented label={t('dupHandling')} value={opts.mode} onChange={(mode) => setOpts((o) => ({ ...o, mode }))} options={[{ value: 'UPSERT', label: t('modeUpsert') }, { value: 'SKIP', label: t('modeSkip') }]} />
            </div>
            {opts.mode === 'UPSERT' && (
              <div className="flex items-center gap-2 text-sm text-ink-600">{t('stockFromFile')}
                <Segmented label={t('stockMode')} value={opts.stockMode} onChange={(stockMode) => setOpts((o) => ({ ...o, stockMode }))} options={[{ value: 'REPLACE', label: t('stockReplace') }, { value: 'ADD', label: t('stockAdd') }]} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {([['all', t('filterAll', { n: preview.length })], ['create', t('filterCreate', { n: counts.create })], ['update', t('filterUpdate', { n: counts.update })], ['skip', t('filterSkip', { n: counts.skip })], ['error', t('filterError', { n: counts.error })], ['warn', t('filterWarn', { n: counts.warn })]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`h-7 rounded border px-2.5 ${filter === k ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-line bg-surface text-ink-600 hover:bg-sunken'}`}>{label}</button>
            ))}
            <span className="ml-auto text-ink-600">{t('notImported')}</span>
          </div>
          <VirtualTable
            label={t('previewLabel')}
            columns={columns}
            rows={shown}
            rowKey={(r) => String(r.line)}
            selectedId={selected}
            onSelect={setSelected}
            rowClass={(r) => (r.action === 'error' ? 'bg-danger-soft/50' : r.warnings.length && r.action !== 'skip' ? 'bg-warn-soft/60' : r.action === 'skip' ? 'text-ink-400' : '')}
            empty={t('noRows')}
          />
        </div>
      )}
    </Modal>
  )
}
