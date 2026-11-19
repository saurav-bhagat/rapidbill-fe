import type { KeyboardEvent } from 'react'

/**
 * Marg-style: Enter advances to the next field; Enter on the last field submits.
 * Attach to a <form onKeyDown>. Textareas and buttons keep their normal Enter.
 */
export function enterAsTab(e: KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement
  if (!['INPUT', 'SELECT'].includes(t.tagName)) return
  e.preventDefault()
  const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])'))
  const i = fields.indexOf(t)
  if (i >= 0 && i < fields.length - 1) { fields[i + 1].focus(); (fields[i + 1] as HTMLInputElement).select?.() }
  else e.currentTarget.requestSubmit()
}

export function focusFirstError(form: HTMLFormElement | null, keys: string[]): void {
  if (!form || keys.length === 0) return
  const el = form.querySelector<HTMLElement>(keys.map((k) => `[name="${k}"]`).join(','))
  el?.focus()
}
