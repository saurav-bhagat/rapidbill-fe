import { useSyncExternalStore } from 'react'

/** Whole-app text size. Everything is sized in rem, so changing the root size scales text and spacing together. */
export const TEXT_SCALES = [0.875, 1, 1.125, 1.25, 1.5] as const
const KEY = 'rapidbill:text-scale'
const DEFAULT_INDEX = 1

let index = DEFAULT_INDEX
const listeners = new Set<() => void>()

const apply = () => { document.documentElement.style.fontSize = `${TEXT_SCALES[index]! * 100}%` }

/** Call once before first render so there is no flash of the wrong size. */
export function initTextScale() {
  try {
    const saved = Number(localStorage.getItem(KEY))
    const i = TEXT_SCALES.indexOf(saved as (typeof TEXT_SCALES)[number])
    if (i >= 0) index = i
  } catch { /* storage blocked: use the default */ }
  apply()
}

export function setTextScaleIndex(i: number) {
  index = Math.min(TEXT_SCALES.length - 1, Math.max(0, i))
  apply()
  try { localStorage.setItem(KEY, String(TEXT_SCALES[index])) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useTextScale() {
  const i = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => index)
  return { index: i, scale: TEXT_SCALES[i]!, canShrink: i > 0, canGrow: i < TEXT_SCALES.length - 1, isDefault: i === DEFAULT_INDEX }
}
