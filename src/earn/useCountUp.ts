import { useEffect, useRef, useState } from 'react'

/** A number that counts up to its value once when it first shows (not for people who asked for less motion). */
export function useCountUp(target: number, ms = 700): number {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = useState(reduced ? target : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) { setValue(target); return }
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const eased = 1 - (1 - p) ** 3
      const v = Math.round(begin + (target - begin) * eased)
      setValue(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return value
}
