import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { download } from '@/lib/download'
import { errorText } from '@/lib/errors'
import { formatAmount, formatDate, formatINR, formatQty, todayISO } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { gstFileName, gstSheets, periodOf, type GstReport, type RateRow } from '@/lib/gstReport'
import { httpReports } from '@/services/http/services'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'

type Kind = 'month' | 'lastMonth' | 'quarter' | 'lastQuarter' | 'custom'
type Tab = 'b2b' | 'b2cl' | 'b2cs' | 'cdn' | 'nil' | 'hsn' | 'docs'
const TABS: Tab[] = ['b2b', 'b2cl', 'b2cs', 'cdn', 'nil', 'hsn', 'docs']

const sumTax = (rs: RateRow[]) => rs.reduce((s, r) => s + r.igst + r.cgst + r.sgst, 0)
const sumTaxable = (rs: RateRow[]) => rs.reduce((s, r) => s + r.taxable, 0)
const pos = (c: string) => `${c} · ${stateName(c)}`

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <table className="w-full min-w-[720px] border-collapse text-base">
      <thead><tr className="border-b border-line bg-sunken text-left text-sm text-ink-600">{head.map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i >= head.length - 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={head.length} className="py-6 text-center text-ink-400">{empty}</td></tr>}
        {rows.map((r, n) => <tr key={n} className="border-b border-line/60">{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i >= r.length - 3 ? 'num text-right' : ''}`}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  )
}

/** GST for a filing period, in the tables the accountant files, with an Excel file for the GST offline tool. */
export function Reports() {
  const { t } = useTranslation('reports')
  const [kind, setKind] = useState<Kind>('month')
  const [custom, setCustom] = useState(() => periodOf('month', todayISO()))
  const period = kind === 'custom' ? custom : periodOf(kind, todayISO())
  const [data, setData] = useState<GstReport>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('b2b')

  const load = async () => {
    if (!period.from || !period.to) return
    setLoading(true); setError('')
    try { setData(await httpReports.gst(period.from, period.to)) } catch (e) { setData(undefined); setError(errorText(t, e, t('failed'))) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [period.from, period.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const noteText = (n: GstReport['notes'][number]) => t(`notes.${n.key}`, { count: n.count ?? 1 })
  const excel = async () => {
    if (!data) return
    try {
      const XLSX = await import('xlsx') // loaded on demand to keep the first paint light
      const wb = XLSX.utils.book_new()
      for (const s of gstSheets(data, (n) => i18nEnglish(n))) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31))
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const name = gstFileName(data)
      download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
      toast.success(t('downloaded', { name }))
    } catch (e) { toast.error(errorText(t, e, t('downloadFailed'))) }
  }
  // The workbook goes to the accountant and the offline tool: its notes are always in English.
  const tEn = useTranslation('reports', { lng: 'en' }).t
  const i18nEnglish = (n: GstReport['notes'][number]) => tEn(`notes.${n.key}`, { count: n.count ?? 1 })

  const o = data?.gstr3b.outward
  const rows = useMemo(() => {
    if (!data) return { head: [], rows: [] as (string | number)[][] }
    const c = (k: string) => t(`col.${k}`)
    switch (tab) {
      case 'b2b': return { head: [c('number'), c('date'), c('party'), c('gstin'), c('pos'), c('taxable'), c('tax'), c('value')], rows: data.b2b.map((x) => [x.number, formatDate(x.date), x.name, x.ctin, pos(x.pos), formatAmount(sumTaxable(x.rates)), formatAmount(sumTax(x.rates)), formatAmount(x.value)]) }
      case 'b2cl': return { head: [c('number'), c('date'), c('pos'), c('taxable'), c('tax'), c('value')], rows: data.b2cl.map((x) => [x.number, formatDate(x.date), pos(x.pos), formatAmount(sumTaxable(x.rates)), formatAmount(sumTax(x.rates)), formatAmount(x.value)]) }
      case 'b2cs': return { head: [c('pos'), c('type'), c('rate'), c('taxable'), c('tax'), c('amount')], rows: data.b2cs.map((x) => [pos(x.pos), t(`type.${x.type}`), `${x.rate}%`, formatAmount(x.taxable), formatAmount(x.igst + x.cgst + x.sgst), formatAmount(x.taxable + x.igst + x.cgst + x.sgst)]) }
      case 'cdn': return { head: [c('number'), c('date'), c('against'), c('party'), c('gstin'), c('taxable'), c('tax'), c('value')], rows: [
        ...data.cdnr.map((x) => [x.number, formatDate(x.date), x.invoiceNo, x.name, x.ctin, formatAmount(sumTaxable(x.rates)), formatAmount(sumTax(x.rates)), formatAmount(x.value)]),
        ...data.cdnur.map((x) => [x.number, formatDate(x.date), x.invoiceNo, 'B2CL', '', formatAmount(sumTaxable(x.rates)), formatAmount(sumTax(x.rates)), formatAmount(x.value)]),
      ] }
      case 'nil': return { head: [c('supply'), '', '', c('amount')], rows: (['interReg', 'intraReg', 'interUnreg', 'intraUnreg'] as const).map((k) => [t(`nil.${k}`), '', '', formatAmount(data.nil[k])]) }
      case 'hsn': return { head: ['', c('hsn'), c('desc'), c('unit'), c('rate'), c('qty'), c('taxable'), c('tax'), c('value')], rows: [
        ...data.hsn.b2b.map((h) => [t('hsnB2b'), h.hsn || '—', h.description, h.uqc, `${h.rate}%`, formatQty(h.qty), formatAmount(h.taxable), formatAmount(h.igst + h.cgst + h.sgst), formatAmount(h.value)]),
        ...data.hsn.b2c.map((h) => [t('hsnB2c'), h.hsn || '—', h.description, h.uqc, `${h.rate}%`, formatQty(h.qty), formatAmount(h.taxable), formatAmount(h.igst + h.cgst + h.sgst), formatAmount(h.value)]),
      ] }
      case 'docs': return { head: [c('type'), c('series'), c('from'), c('to'), c('total'), c('cancelled')], rows: data.docs.map((d) => [t(`docKind.${d.kind}`), d.series || t('handTyped'), d.from, d.to, d.total, d.cancelled]) }
    }
  }, [data, tab, t])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="page-toolbar">
        <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="!w-48" aria-label={t('period.label')}>
          {(['month', 'lastMonth', 'quarter', 'lastQuarter', 'custom'] as const).map((k) => <option key={k} value={k}>{t(`period.${k}`)}</option>)}
        </Select>
        {kind === 'custom' && (
          <>
            <input type="date" aria-label={t('period.from')} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 rounded border border-line bg-surface px-2 font-mono text-base" />
            <span className="text-ink-400">{t('period.to')}</span>
            <input type="date" aria-label={t('period.to')} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 rounded border border-line bg-surface px-2 font-mono text-base" />
          </>
        )}
        {loading && <span className="text-sm text-ink-400">{t('loading')}</span>}
        <div className="ml-auto"><Button variant="primary" icon={<Download size={14} />} disabled={!data} onClick={() => void excel()}>{t('download')}</Button></div>
      </div>

      {error && <div role="alert" className="rounded border border-danger/40 p-3"><p className="text-danger">{error}</p><Button className="mt-2" onClick={() => void load()}>{t('retry')}</Button></div>}

      {data && o && (
        <>
          <p className="text-base text-ink-600">{t('intro', { from: formatDate(data.from), to: formatDate(data.to) })}</p>
          {data.notes.length > 0 && (
            <div className="rounded border border-warn/40 bg-warn-soft p-3">
              <p className="mb-1 font-medium text-warn">{t('check')}</p>
              <ul className="list-disc space-y-1 pl-5 text-base">{data.notes.map((n) => <li key={n.key}>{noteText(n)}</li>)}</ul>
            </div>
          )}
          <section className="rounded-xl border border-line/70 bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-base font-medium">{t('summary.title')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {([['taxable', o.taxable], ['cgst', o.cgst], ['sgst', o.sgst], ['igst', o.igst], ['tax', o.cgst + o.sgst + o.igst], ['nil', data.gstr3b.nil]] as const).map(([k, v]) => (
                <div key={k} className="rounded border border-line bg-section px-3 py-3"><div className="text-sm text-ink-600">{t(`summary.${k}`)}</div><div className="num text-lg font-medium">{formatINR(v)}</div></div>
              ))}
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {t('summary.invoices', { count: data.counts.invoices })} · {t('summary.cancelled', { count: data.counts.cancelled })} · {t('summary.notes', { count: data.counts.creditNotes })}
            </p>
            <p className="text-sm text-ink-400">{t('summary.netNote')}</p>
          </section>

          <section className="rounded-xl border border-line/70 bg-surface p-4 shadow-card">
            <div className="mb-2 overflow-x-auto [&>div]:min-w-max"><Segmented label={t('period.label')} value={tab} onChange={setTab} options={TABS.map((k) => ({ value: k, label: t(`tab.${k}`) }))} /></div>
            <p className="mb-2 text-sm text-ink-600">{t(`tabHelp.${tab}`)}</p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <Table head={rows.head} rows={rows.rows} empty={t('empty')} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
