import { useEffect, useRef } from 'react'
import { isMac } from './platform'

/**
 * Combo syntax: "alt+k", "mod+s", "mod+enter", "f2", "shift+/", "escape", "delete".
 * `mod` = Ctrl on Windows/Linux, Cmd on macOS (Ctrl also accepted on macOS).
 * Letters/digits match on physical key (event.code), so Option+K works on a Mac.
 */
export type Scope = 'global' | 'billing' | 'list' | 'modal'

export interface HotkeyOptions {
  scope?: Scope
  enabled?: boolean
  /** Fire even when focus is in an input. Default: true for combos with a modifier, F-keys and Escape. */
  allowInInput?: boolean
}

interface Parsed { mod: boolean; alt: boolean; shift: boolean; key: string }

function parse(combo: string): Parsed {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  return { mod: parts.includes('mod'), alt: parts.includes('alt'), shift: parts.includes('shift'), key }
}

const CODE_ALIASES: Record<string, string> = {
  Slash: '/', Enter: 'enter', NumpadEnter: 'enter', Escape: 'escape', Delete: 'delete', Backspace: 'backspace',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Space: 'space', Tab: 'tab',
}

function eventKey(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase()
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  if (/^F\d+$/.test(e.code)) return e.code.toLowerCase()
  return CODE_ALIASES[e.code] ?? e.key.toLowerCase()
}

function matches(p: Parsed, e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey
  return p.mod === mod && p.alt === e.altKey && p.shift === e.shiftKey && p.key === eventKey(e)
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

interface Entry { parsed: Parsed; handler: (e: KeyboardEvent) => void | false | Promise<void>; scope: Scope; allowInInput: boolean }
const entries: Entry[] = []
let modalDepth = 0
let listening = false

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat && !['up', 'down'].includes(eventKey(e))) return
  // iterate newest-first so the most specific (latest mounted) handler wins
  for (let i = entries.length - 1; i >= 0; i--) {
    const en = entries[i]
    if (modalDepth > 0 && en.scope !== 'modal') continue
    if (!matches(en.parsed, e)) continue
    if (isTyping(e.target) && !en.allowInInput) continue
    if (en.handler(e) === false) continue
    e.preventDefault()
    e.stopPropagation()
    return
  }
}

function ensureListener() {
  if (listening) return
  window.addEventListener('keydown', onKeyDown, true)
  listening = true
}

/** Register a hotkey for the lifetime of the component. Return `false` from handler to let the event through. */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void | false | Promise<void>, opts: HotkeyOptions = {}) {
  const ref = useRef(handler)
  ref.current = handler
  const { scope = 'global', enabled = true } = opts
  const parsed = parse(combo)
  const allowInInput =
    opts.allowInInput ?? (parsed.mod || parsed.alt || /^f\d+$/.test(parsed.key) || parsed.key === 'escape')

  useEffect(() => {
    if (!enabled) return
    ensureListener()
    const entry: Entry = { parsed: parse(combo), handler: (e) => ref.current(e), scope, allowInInput }
    entries.push(entry)
    return () => {
      const i = entries.indexOf(entry)
      if (i >= 0) entries.splice(i, 1)
    }
  }, [combo, scope, enabled, allowInInput])
}

/** Mark that a modal/drawer is open: suppresses every non-modal scope until it closes. */
export function useModalScope(open: boolean) {
  useEffect(() => {
    if (!open) return
    modalDepth++
    return () => { modalDepth-- }
  }, [open])
}

/** Render a combo as keycap labels for the current platform. */
export function comboLabels(combo: string, mac: boolean = isMac): string[] {
  const p = parse(combo)
  const out: string[] = []
  if (p.mod) out.push(mac ? '⌘' : 'Ctrl')
  if (p.alt) out.push(mac ? '⌥' : 'Alt')
  if (p.shift && p.key !== '/') out.push(mac ? '⇧' : 'Shift')
  const names: Record<string, string> = {
    enter: mac ? '↵' : 'Enter', escape: 'Esc', delete: 'Del', backspace: mac ? '⌫' : 'Backspace', up: '↑', down: '↓', left: '←', right: '→',
    '/': p.shift ? '?' : '/', space: 'Space', tab: 'Tab',
  }
  out.push(names[p.key] ?? p.key.toUpperCase())
  return out
}
