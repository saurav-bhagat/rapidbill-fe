import { useCallback, useEffect, useState } from 'react'

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
  return { data, error, loading, reload }
}
