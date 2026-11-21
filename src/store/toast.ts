import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export interface Toast { id: number; kind: ToastKind; message: string; /** how many times the same message was raised while it was showing */ count: number }

/** How long each kind stays. Errors stay longest: they are the ones a person must read. */
export const TOAST_MS: Record<ToastKind, number> = { success: 3500, info: 4500, warning: 6500, error: 8000 }
const MAX_VISIBLE = 4

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
  /** Keep a toast on screen while the pointer or keyboard focus is on it. */
  hold: (id: number) => void
  release: (id: number) => void
  clear: () => void
}

let n = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const stop = (id: number) => { const t = timers.get(id); if (t) clearTimeout(t); timers.delete(id) }

export const useToasts = create<ToastState>((set, get) => {
  const arm = (id: number, kind: ToastKind) => { stop(id); timers.set(id, setTimeout(() => get().dismiss(id), TOAST_MS[kind])) }
  return {
    toasts: [],
    push: (kind, message) => {
      if (!message) return
      // The same message again (a repeated failure, a double click) bumps the one on screen instead of piling up.
      const same = get().toasts.find((t) => t.kind === kind && t.message === message)
      if (same) {
        set((s) => ({ toasts: s.toasts.map((t) => (t.id === same.id ? { ...t, count: t.count + 1 } : t)) }))
        arm(same.id, kind)
        return
      }
      const id = ++n
      set((s) => {
        const next = [...s.toasts, { id, kind, message, count: 1 }]
        next.slice(0, Math.max(0, next.length - MAX_VISIBLE)).forEach((t) => stop(t.id))
        return { toasts: next.slice(-MAX_VISIBLE) }
      })
      arm(id, kind)
    },
    dismiss: (id) => { stop(id); set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })) },
    hold: (id) => stop(id),
    release: (id) => { const t = get().toasts.find((x) => x.id === id); if (t) arm(id, t.kind) },
    clear: () => { timers.forEach((_, id) => stop(id)); set({ toasts: [] }) },
  }
})

export const toast = {
  success: (m: string) => useToasts.getState().push('success', m),
  error: (m: string) => useToasts.getState().push('error', m),
  warning: (m: string) => useToasts.getState().push('warning', m),
  info: (m: string) => useToasts.getState().push('info', m),
}
