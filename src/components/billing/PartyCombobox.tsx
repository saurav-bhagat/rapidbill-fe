import { useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesQuery } from '@/lib/search'
import type { Party } from '@/services'

const NEW = '__new__'

interface Props {
  parties: Party[]
  value: string | null
  onChange: (id: string | null) => void
  /** Open the add-party drawer, with whatever was typed. */
  onNew: (name: string) => void
  /** Enter on a closed list: move to the first item row. */
  onDone: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

export function PartyCombobox({ parties, value, onChange, onNew, onDone, inputRef }: Props) {
  const { t } = useTranslation('billing')
  const CASH_LABEL = t('party.cash')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [hl, setHl] = useState(0)
  const selected = parties.find((p) => p.id === value)
  const shown = editing ? text : selected?.name ?? CASH_LABEL

  const options = useMemo(() => {
    const q = editing ? text : ''
    const list = parties.filter((p) => matchesQuery(q, [p.name, p.gstin, p.phone]))
    const cash = !q.trim() || CASH_LABEL.toLowerCase().includes(q.trim().toLowerCase())
    return [...(cash ? [{ id: null as string | null, label: CASH_LABEL, meta: '' }] : []), ...list.map((p) => ({ id: p.id as string | null, label: p.name, meta: p.gstin || t('header.unregistered') })), { id: NEW as string | null, label: q.trim() ? t('party.addNamed', { name: q.trim() }) : t('party.add'), meta: '' }]
  }, [parties, text, editing, t, CASH_LABEL])

  const choose = (id: string | null) => {
    setOpen(false); setEditing(false)
    if (id === NEW) return onNew(text.trim())
    onChange(id)
    onDone()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); setHl(0) } else setHl((h) => Math.min(options.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setHl((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && editing) choose(options[hl]?.id ?? null)
      else if (open) choose(options[hl]?.id ?? null)
      else onDone()
    }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); setEditing(false) }
    else if (e.key === 'Tab') { setOpen(false); setEditing(false) }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={t('party.label')}
        autoComplete="off"
        value={shown}
        onFocus={(e) => { e.currentTarget.select(); setOpen(true); setHl(0) }}
        onChange={(e) => { setText(e.target.value); setEditing(true); setOpen(true); setHl(0) }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => { setOpen(false); setEditing(false) }, 120)}
        className="h-9 w-full rounded border border-line bg-surface px-2 text-base font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {open && (
        <ul role="listbox" onMouseDown={(e) => e.preventDefault()} className="absolute left-0 top-full z-30 mt-1 max-h-72 w-[420px] overflow-auto rounded-lg border border-line bg-surface py-1 shadow-float">
          {options.map((o, n) => (
            <li
              key={o.id ?? 'cash'}
              role="option"
              aria-selected={n === hl}
              onMouseMove={() => n !== hl && setHl(n)}
              onClick={() => choose(o.id)}
              className={`flex h-9 cursor-default items-center justify-between gap-3 px-3 ${n === hl ? 'bg-primary-soft' : ''} ${o.id === NEW ? 'border-t border-line text-primary' : ''}`}
            >
              <span className="truncate">{o.label}</span>
              <span className="font-mono text-xs text-ink-400">{o.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
