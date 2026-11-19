import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { blankRow, parseDisc, parseQty, parseRate, rowStatus, rupeesText, defaultRate, usageByItem, type Row } from '@/lib/billing'
import type { CalcLine } from '@/lib/calc'
import { formatAmount } from '@/lib/format'
import type { Item } from '@/services'
import { ItemCell } from './ItemCell'

export type Col = 'item' | 'qty' | 'rate' | 'disc'
export interface GridHandle { focusCell: (row: number, col: Col) => void; pickItem: (row: number, item: Item) => void }

interface Props {
  rows: Row[]
  setRows: (fn: (r: Row[]) => Row[]) => void
  items: Item[]
  basis: 'SALE' | 'COST'
  blockOverIssue: boolean
  taxApplicable: boolean
  /** false hides the GST % column (non-GST business) */
  showGst: boolean
  /** Calc result per row index (undefined for rows that don't count yet). */
  lineCalc: (CalcLine | undefined)[]
  onActive: (i: number) => void
  onRemove: (i: number) => void
  onMessage: (msg: string) => void
}

const cell = 'h-full w-full bg-transparent px-2 outline-none'

export const BillingGrid = forwardRef<GridHandle, Props>(function BillingGrid(
  { rows, setRows, items, basis, blockOverIssue, taxApplicable, showGst, lineCalc, onActive, onRemove, onMessage }, ref,
) {
  const { t } = useTranslation('billing')
  const box = useRef<HTMLDivElement>(null)
  const pending = useRef<{ row: number; col: Col } | null>(null)

  const find = (row: number, col: Col) => box.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`) ?? null
  const focusCell = (row: number, col: Col) => {
    const el = find(row, col)
    if (el) { el.focus(); el.select?.() } else pending.current = { row, col }
  }
  // a row added this render may not exist yet when focus was requested
  useEffect(() => {
    const p = pending.current
    if (!p) return
    const el = find(p.row, p.col)
    if (el) { pending.current = null; el.focus(); el.select?.() }
  })

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...p } : r)))
  const usage = usageByItem(rows)

  const pickItem = (i: number, item: Item) => {
    setRows((rs) => {
      const next = rs.map((r, n) => (n === i ? { ...r, item, query: '', rate: rupeesText(defaultRate(item, basis)), rateTouched: false, disc: r.disc || '' } : r))
      return i === next.length - 1 ? [...next, blankRow()] : next
    })
    focusCell(i, 'qty')
  }

  useImperativeHandle(ref, () => ({ focusCell, pickItem }))

  const onEnter = (e: KeyboardEvent<HTMLInputElement>, i: number, col: 'qty' | 'rate' | 'disc') => {
    const r = rows[i]
    if (col === 'qty') {
      if (parseQty(r.qty) === null) return onMessage(t('grid.enterQty'))
      const st = rowStatus(r, usage)
      if (st.shortBy && blockOverIssue) return onMessage(t('grid.exceedsStock', { available: st.shortBy.available }))
      focusCell(i, 'rate')
    } else if (col === 'rate') {
      if (parseRate(r.rate) === null) return onMessage(t('grid.enterRate'))
      focusCell(i, 'disc')
    } else {
      if (parseDisc(r.disc) === null) return onMessage(t('grid.discRange'))
      // commit: make sure a blank row exists below, then land on it
      setRows((rs) => (i === rs.length - 1 ? [...rs, blankRow()] : rs))
      focusCell(i + 1, 'item')
    }
    e.preventDefault()
  }

  const onArrow = (e: KeyboardEvent<HTMLInputElement>, i: number, col: Col) => {
    if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusCell(i - 1, col) }
    else if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); focusCell(i + 1, col) }
  }

  const numInput = (i: number, col: 'qty' | 'rate' | 'disc', value: string, invalid: boolean) => (
    <input
      data-row={i}
      data-col={col}
      value={value}
      inputMode="decimal"
      aria-label={t(`grid.aria.${col}`, { n: i + 1 })}
      aria-invalid={invalid}
      autoComplete="off"
      onFocus={(e) => { e.currentTarget.select(); onActive(i) }}
      onChange={(e) => patch(i, col === 'rate' ? { rate: e.target.value, rateTouched: true } : { [col]: e.target.value })}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if (e.key === 'Enter') onEnter(e, i, col)
        else onArrow(e, i, col)
      }}
      className={`${cell} num ${invalid ? 'text-danger' : ''}`}
    />
  )

  return (
    <div ref={box} className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-base" style={{ tableLayout: 'fixed', minWidth: 1020 }}>
        <thead>
          <tr className="h-8">
            {[['#', 36, 'center'], ['item', 0, 'left'], ['batch', 104, 'left'], ['exp', 58, 'left'], ['qty', 84, 'right'], ['unit', 56, 'left'], ['mrp', 84, 'right'], ['rate', 96, 'right'], ['disc', 68, 'right'], ['gst', 60, 'right'], ['amount', 116, 'right'], ['', 32, 'left']].filter(([h]) => showGst || h !== 'gst').map(([h, w, a]) => (
              <th key={h as string} style={{ width: w ? (w as number) : undefined }} className={`sticky top-0 z-10 border-b border-line bg-sunken px-2 text-sm font-medium text-ink-600 text-${a}`}>{h === '#' || h === '' ? h : t(`grid.col.${h}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const st = rowStatus(r, usage)
            const calc = lineCalc[i]
            return (
              <Fragment key={r.key}>
                <tr
                  className="h-9 border-b border-line focus-within:bg-primary-soft/40 [&_input:focus]:shadow-[inset_0_0_0_2px_rgb(var(--primary))]"
                  onFocusCapture={() => onActive(i)}
                >
                  <td className="text-center text-sm text-ink-400">{i + 1}</td>
                  <td className="relative p-0">
                    <ItemCell
                      row={r}
                      rowIndex={i}
                      items={items}
                      onQuery={(q) => patch(i, { query: q })}
                      onPick={(it) => pickItem(i, it)}
                      onClear={(q) => patch(i, { item: undefined, query: q, qty: '', rate: '', disc: '', rateTouched: false })}
                      onAdvance={() => focusCell(i, 'qty')}
                      onRemove={() => onRemove(i)}
                      onFocused={() => onActive(i)}
                      showGst={showGst}
                    />
                  </td>
                  <td className="truncate px-2 font-mono text-sm text-ink-600">{r.item?.batchNo || ''}</td>
                  <td className="px-2 font-mono text-sm text-ink-600">{r.item?.expiry || ''}</td>
                  <td className="p-0">{r.item ? numInput(i, 'qty', r.qty, st.qtyInvalid || !!st.shortBy) : null}</td>
                  <td className="px-2 text-sm text-ink-600">{r.item?.unit}</td>
                  <td className="num px-2 text-ink-600">{r.item ? formatAmount(r.item.mrp) : ''}</td>
                  <td className="p-0">{r.item ? numInput(i, 'rate', r.rate, st.rateInvalid) : null}</td>
                  <td className="p-0">{r.item ? numInput(i, 'disc', r.disc, st.discInvalid) : null}</td>
                  {showGst && <td className={`num px-2 ${taxApplicable ? 'text-ink-600' : 'text-ink-400'}`}>{r.item ? (taxApplicable ? `${r.item.gstPercent}%` : '-') : ''}</td>}
                  <td className="num px-2 font-medium">{calc ? formatAmount(calc.total) : ''}</td>
                  <td className="p-0 text-center">
                    {r.item && (
                      <button tabIndex={-1} onClick={() => onRemove(i)} aria-label={t('grid.aria.remove', { n: i + 1 })} className="grid h-full w-full place-items-center text-ink-400 hover:text-danger"><X size={14} /></button>
                    )}
                  </td>
                </tr>
                {st.shortBy && (
                  <tr className={`border-b border-line ${blockOverIssue ? 'bg-danger-soft' : 'bg-warn-soft'}`}>
                    <td />
                    <td colSpan={showGst ? 11 : 10} className={`px-2 py-1 text-sm ${blockOverIssue ? 'text-danger' : 'text-warn'}`}>
                      {(() => {
                        const across = st.shortBy.requested !== parseQty(r.qty) ? t('grid.across', { n: st.shortBy.requested }) : ''
                        return st.shortBy.available <= 0 ? t('grid.shortNone', { across }) : t('grid.shortOnly', { n: st.shortBy.available, across })
                      })()}{' '}
                      {blockOverIssue ? t('grid.reduceQty') : t('grid.canSave')}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
