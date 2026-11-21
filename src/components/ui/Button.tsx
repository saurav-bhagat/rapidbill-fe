import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Keycap } from './Keycap'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  hotkey?: string
  icon?: ReactNode
}

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover border-transparent',
  secondary: 'bg-surface text-ink-900 border-line hover:bg-sunken',
  ghost: 'bg-transparent text-ink-600 border-transparent hover:bg-sunken hover:text-ink-900',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
}

export function Button({ variant = 'secondary', hotkey, icon, children, className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {icon}
      {children}
      {hotkey && (
        <span className={variant === 'primary' || variant === 'danger' ? 'opacity-80 [&_kbd]:border-white/30 [&_kbd]:bg-white/15 [&_kbd]:text-white' : ''}>
          <Keycap combo={hotkey} />
        </span>
      )}
    </button>
  )
}
