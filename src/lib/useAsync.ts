import { useCallback, useEffect, useRef, useState } from 'react'
import { useSync } from '@/offline/state'

/** Minimal async loader for service calls. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(() => {
    setLoading(true)
    run().then(setData).catch(setError).finally(() => setLoading(false))
  }, [run])
  useEffect(reload, [reload])
  // When a background sync brought in new data, refresh quietly, and only replace what is shown if it really changed
  // (so a form that was filled from this data is not reset under the user's hands for nothing).
  const version = useSync((s) => s.version)
  const seen = useRef(version)
  useEffect(() => {
    if (seen.current === version) return
    seen.current = version
    run().then((d) => setData((prev) => (JSON.stringify(prev) === JSON.stringify(d) ? prev : d))).catch(() => undefined)
  }, [version, run])
  return { data, error, loading, reload }
}
