interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}

/** Compact either/or toggle. Arrow keys move between options like a radio group. */
export function Segmented<T extends string>({ value, onChange, options, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 overflow-hidden rounded border border-line bg-surface">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
              if (!d) return
              e.preventDefault()
              const n = options[(i + d + options.length) % options.length]
              onChange(n.value)
              ;((e.currentTarget.parentElement?.children[(i + d + options.length) % options.length]) as HTMLElement)?.focus()
            }}
            className={`px-3 text-base ${i > 0 ? 'border-l border-line' : ''} ${on ? 'bg-primary font-medium text-white' : 'text-ink-600 hover:bg-sunken'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
