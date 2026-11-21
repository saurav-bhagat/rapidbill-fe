import { Search } from 'lucide-react'
import type { RefObject } from 'react'
import { Keycap } from './Keycap'

interface Props {
  value: string
  onChange: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  placeholder: string
  /** Called on ArrowDown / Enter so focus can drop into the results. */
  onEnterResults?: () => void
}

export function SearchInput({ value, onChange, inputRef, placeholder, onEnterResults }: Props) {
  return (
    <div className="relative w-80">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); onEnterResults?.() }
          else if (e.key === 'Escape') { if (value) onChange(''); else inputRef.current?.blur() }
        }}
        className="h-9 w-full rounded border border-line bg-surface pl-8 pr-10 text-base placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {!value && <Keycap combo="/" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />}
    </div>
  )
}
