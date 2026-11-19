import { comboLabels } from '@/lib/hotkeys'

/** Subtle keycap hint. Pass a combo string, e.g. "mod+s". */
export function Keycap({ combo, className = '' }: { combo: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {comboLabels(combo).map((k, i) => (
        <kbd key={i} className="min-w-[18px] rounded border border-line border-b-2 bg-sunken px-1 text-center font-mono text-[10px] leading-4 text-ink-600">
          {k}
        </kbd>
      ))}
    </span>
  )
}
