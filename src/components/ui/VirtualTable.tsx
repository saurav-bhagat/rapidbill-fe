import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface VColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  width?: string
  sortable?: boolean
}
export interface SortState { key: string; dir: 'asc' | 'desc' }

interface Props<T> {
  columns: VColumn<T>[]
  rows: T[]
  rowKey: (r: T) => string
  selectedId?: string
  onSelect: (id: string) => void
  /** Enter, and double-click (or single click when activateOnClick). */
  onActivate?: (row: T) => void
  activateOnClick?: boolean
  sort?: SortState
  onSort?: (key: string) => void
  empty?: string
  label: string
  /** Called on keys the table does not handle itself (e.g. Delete). */
  onKeyExtra?: (e: KeyboardEvent, row: T | undefined) => void
  /** Extra classes per row, e.g. to tint warnings. */
  rowClass?: (r: T) => string
}

const ROW_H = 40
const HEAD_H = 36
const OVERSCAN = 8

/** Fixed-row-height windowed table with roving keyboard selection. Handles thousands of rows. */
export function VirtualTable<T>({ columns, rows, rowKey, selectedId, onSelect, onActivate, activateOnClick, sort, onSort, empty, label, onKeyExtra, rowClass }: Props<T>) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const uid = useId()
  const [scrollTop, setScrollTop] = useState(0)
  const [vh, setVh] = useState(600)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setVh(el.clientHeight))
    ro.observe(el)
    setVh(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // fixed columns + room for the flexible ones, so narrow windows scroll sideways instead of crushing text
  const minW = columns.reduce((s, c) => s + (c.width ? parseInt(c.width, 10) : 220), 0)

  const selIndex = selectedId ? rows.findIndex((r) => rowKey(r) === selectedId) : -1

  // keep the selected row inside the viewport
  useEffect(() => {
    const el = box.current
    if (!el || selIndex < 0) return
    const top = selIndex * ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + vh - HEAD_H) el.scrollTop = top + ROW_H - (vh - HEAD_H)
  }, [selIndex, vh])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + vh) / ROW_H) + OVERSCAN)

  const move = (to: number) => {
    if (rows.length === 0) return
    onSelect(rowKey(rows[Math.min(rows.length - 1, Math.max(0, to))]))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const cur = selIndex < 0 ? -1 : selIndex
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(cur + 1); return
      case 'ArrowUp': e.preventDefault(); move(cur < 0 ? 0 : cur - 1); return
      case 'PageDown': e.preventDefault(); move(cur + 10); return
      case 'PageUp': e.preventDefault(); move(cur - 10); return
      case 'Home': e.preventDefault(); move(0); return
      case 'End': e.preventDefault(); move(rows.length - 1); return
      case 'Enter': if (selIndex >= 0) { e.preventDefault(); onActivate?.(rows[selIndex]) } return
    }
    onKeyExtra?.(e, selIndex >= 0 ? rows[selIndex] : undefined)
  }

  return (
    <div
      ref={box}
      tabIndex={0}
      role="grid"
      aria-label={label}
      aria-rowcount={rows.length + 1}
      aria-activedescendant={selectedId && selIndex >= start && selIndex < end ? `${uid}-${selectedId}` : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      onFocus={() => { if (selIndex < 0 && rows.length) move(0) }}
      className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-surface focus-visible:outline-offset-0"
    >
      <table role="presentation" className="w-full border-collapse text-base" style={{ tableLayout: 'fixed', minWidth: minW }}>
        <thead role="rowgroup">
          <tr role="row" style={{ height: HEAD_H }}>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  role="columnheader"
                  style={{ width: c.width }}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`sticky top-0 z-10 border-b border-line bg-sunken px-3 text-sm font-medium text-ink-600 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.sortable && onSort ? (
                    <button tabIndex={-1} onClick={() => onSort(c.key)} className={`inline-flex items-center gap-1 hover:text-ink-900 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  ) : c.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.length === 0 && (
            <tr role="row"><td role="gridcell" colSpan={columns.length} className="px-3 py-8 text-center text-ink-600">{empty ?? t('status.nothingHere')}</td></tr>
          )}
          {start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden />}
          {rows.slice(start, end).map((r) => {
            const id = rowKey(r)
            const selected = id === selectedId
            return (
              <tr
                key={id}
                id={`${uid}-${id}`}
                role="row"
                aria-selected={selected}
                style={{ height: ROW_H }}
                onClick={() => { onSelect(id); if (activateOnClick) onActivate?.(r) }}
                onDoubleClick={() => onActivate?.(r)}
                className={`cursor-default border-b border-line ${selected ? 'bg-primary-soft shadow-[inset_2px_0_0_rgb(var(--primary))]' : `hover:bg-sunken/70 ${rowClass?.(r) ?? ''}`}`}
              >
                {columns.map((c) => (
                  <td key={c.key} role="gridcell" className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 ${c.align === 'right' ? 'num' : 'text-left'}`}>{c.cell(r)}</td>
                ))}
              </tr>
            )
          })}
          {end < rows.length && <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden />}
        </tbody>
      </table>
    </div>
  )
}
