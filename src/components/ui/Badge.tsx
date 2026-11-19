import type { ReactNode } from 'react'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'primary'
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-600',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  primary: 'bg-primary-soft text-primary',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-px text-xs font-medium ${tones[tone]}`}>{children}</span>
}
