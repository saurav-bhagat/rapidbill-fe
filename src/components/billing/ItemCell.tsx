import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { rankItems, type Row } from '@/lib/billing'
import { formatAmount, formatQty } from '@/lib/format'
import { matchesQuery } from '@/lib/search'
import type { Item } from '@/services'

interface Props {
  row: Row
  rowIndex: number
  items: Item[]
  onQuery: (q: string) => void
  onPick: (item: Item) => void
  onClear: (nextQuery: string) => void
  /** Enter on an already-chosen item: move on to Qty. */
  onAdvance: () => void
  onRemove: () => void
  onFocused: () => void
  showGst: boolean
}

const POP_W = 780
const POP_H = 330

const stockClass = (i: Item) => (i.currentStock <= 0 ? 'text-danger' : i.currentStock <= i.lowStockThreshold ? 'text-warn' : 'text-ok')

/** Item input with a floating, keyboard-driven picker. */
export function ItemCell({ row, rowIndex, items, onQuery, onPick, onClear, onAdvance, onRemove, onFocused, showGst }: Props) {
  const { t } = useTranslation('billing')
  const cols = showGst ? 'grid-cols-[1fr_88px_110px_96px_72px_72px_48px]' : 'grid-cols-[1fr_88px_110px_96px_72px_72px]'
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [hl, setHl] = useState(0)
  const [pos, setPos] = useState({ left: 0, top: 0, up: false })

  const results = useMemo(() => (open ? rankItems(items, row.query, matchesQuery) : []), [open, items, row.query])

  useLayoutEffect(() => {
    if (!open || !input.current) return
    const r = input.current.getBoundingClientRect()
    const up = r.bottom + POP_H > window.innerHeight && r.top > POP_H
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)), top: up ? r.top : r.bottom + 2, up })
  }, [open, results.length])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-hl=true]')?.scrollIntoView({ block: 'nearest' })
  }, [hl, results])

  const close = () => setOpen(false)
  const pick = (i: Item) => { close(); onPick(i) }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (row.item) {
      if (e.key === 'Enter') { e.preventDefault(); onAdvance() }
      else if (e.key === 'Delete') { e.preventDefault(); onRemove() }
      else if (e.key === 'Backspace') { e.preventDefault(); onClear(''); setHl(0); setOpen(true) }
      else if (e.key.length === 1) { e.preventDefault(); onClear(e.key); setHl(0); setOpen(true) }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!open) { setOpen(true); setHl(0) } else setHl((h) => Math.min(results.length - 1, h + 1)); break
      case 'ArrowUp': if (open) { e.preventDefault(); setHl((h) => Math.max(0, h - 1)) } break
      case 'Enter':
        e.preventDefault()
        if (!open) { setOpen(true); setHl(0) } else if (results[hl]) pick(results[hl])
        break
      case 'Escape': if (open) { e.preventDefault(); close() } break
      case 'Tab': close(); break
    }
  }

  return (
    <>
      <input
        ref={input}
        data-row={rowIndex}
        data-col="item"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={t('grid.aria.item', { n: rowIndex + 1 })}
        autoComplete="off"
        spellCheck={false}
        value={row.item ? row.item.name : row.query}
        readOnly={!!row.item}
        placeholder={rowIndex === 0 && !row.item ? t('picker.placeholder') : ''}
        onChange={(e) => { onQuery(e.target.value); setHl(0); setOpen(true) }}
        onKeyDown={onKeyDown}
        onFocus={onFocused}
        onBlur={() => setTimeout(close, 120)}
        className={`h-full w-full bg-transparent px-2 outline-none placeholder:text-ink-400 ${row.item ? 'cursor-default font-medium' : ''}`}
      />
      {open && (
        <div
          style={{ position: 'fixed', left: pos.left, top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top + 2 : undefined, width: POP_W, maxHeight: POP_H }}
          className="z-30 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-float"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className={`grid shrink-0 ${cols} gap-x-2 border-b border-line bg-sunken px-3 py-1.5 text-sm font-medium text-ink-600`}>
            <span>{t('picker.item')}</span><span>{t('picker.code')}</span><span>{t('picker.batch')}</span><span className="text-right">{t('picker.stock')}</span><span className="text-right">{t('picker.mrp')}</span><span className="text-right">{t('picker.rate')}</span>{showGst && <span className="text-right">{t('picker.gst')}</span>}
          </div>
          <ul ref={list} role="listbox" className="min-h-0 flex-1 overflow-auto">
            {results.length === 0 && (
              <li className="px-3 py-4 text-center text-ink-600">
                <Trans
                  t={t}
                  i18nKey={row.query ? 'picker.noMatchQuery' : 'picker.noMatch'}
                  values={{ query: row.query }}
                  components={{ q: <span className="font-medium text-ink-900" />, kbd: <kbd className="rounded border border-line bg-sunken px-1 font-mono text-xs" /> }}
                />
              </li>
            )}
            {results.map((i, n) => (
              <li
                key={i.id}
                role="option"
                aria-selected={n === hl}
                data-hl={n === hl}
                onMouseMove={() => n !== hl && setHl(n)}
                onClick={() => pick(i)}
                className={`grid h-9 cursor-default ${cols} items-center gap-x-2 px-3 ${n === hl ? 'bg-primary-soft' : ''}`}
              >
                <span className="truncate font-medium">{i.name}</span>
                <span className="font-mono text-sm text-ink-600">{i.code}</span>
                <span className="truncate font-mono text-sm text-ink-600">{i.batchNo || '-'}</span>
                <span className={`num font-medium ${stockClass(i)}`}>{formatQty(i.currentStock)} {i.unit}</span>
                <span className="num text-ink-600">{formatAmount(i.mrp)}</span>
                <span className="num">{formatAmount(i.issueRate)}</span>
                {showGst && <span className="num text-ink-600">{i.gstPercent}%</span>}
              </li>
            ))}
          </ul>
          <div className="shrink-0 border-t border-line bg-sunken px-3 py-1 text-sm text-ink-600">{t('picker.hint')}</div>
        </div>
      )}
    </>
  )
}
