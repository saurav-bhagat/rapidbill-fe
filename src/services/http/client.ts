import en from '@/i18n/locales/en/errors.json'
import { AppError, type ErrorKey, type ErrorParams } from '../errors'
import { BillingError, type Shortage } from '../voucher'

/** Where the API lives. Empty = no backend: the app runs on this browser's own storage (demo / tests). */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const apiEnabled = API_URL !== ''

export interface SessionUser { id: string; email: string; name: string }
export interface SessionWorkspace { id: string; name: string }
export interface Session {
  user: SessionUser
  workspace: SessionWorkspace
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
}

const REFRESH_KEY = 'rapidbill:refresh-token'
let accessToken: string | null = null
let accessExpiresAt = 0
let lostHandler: (() => void) | null = null

const readRefresh = () => { try { return localStorage.getItem(REFRESH_KEY) } catch { return null } }
const writeRefresh = (v: string | null) => {
  try { if (v) localStorage.setItem(REFRESH_KEY, v); else localStorage.removeItem(REFRESH_KEY) } catch { /* storage blocked: stay signed in for this tab only */ }
}

export const tokens = {
  hasRefresh: () => readRefresh() !== null,
  set(s: Session) { accessToken = s.accessToken; accessExpiresAt = Date.parse(s.accessTokenExpiresAt); writeRefresh(s.refreshToken) },
  clear() { accessToken = null; accessExpiresAt = 0; writeRefresh(null) },
  /** Called when the refresh token is rejected, so the app can send the user to the login screen. */
  onLost(fn: () => void) { lostHandler = fn },
}

const isKey = (k: unknown): k is ErrorKey => typeof k === 'string' && Object.prototype.hasOwnProperty.call(en, k)

interface ErrorBody { code?: string; message?: string; key?: string; params?: ErrorParams; details?: unknown }

/** Turn an API error body into the same error classes the UI already understands. */
export function toAppError(status: number, body: ErrorBody | null): AppError {
  const code = body?.code
  const key: ErrorKey = isKey(body?.key) ? body.key
    : body?.message && status < 500 ? 'serverMessage'
    : 'serverError'
  const params: ErrorParams = key === 'serverMessage' ? { message: body?.message ?? '' } : body?.params ?? {}
  if (code === 'STOCK' || code === 'DUPLICATE_NUMBER' || code === 'VALIDATION' || code === 'STORAGE') {
    return new BillingError(key, code, params, code === 'STOCK' && Array.isArray(body?.details) ? (body.details as Shortage[]) : [])
  }
  return new AppError(key, params)
}

let refreshing: Promise<boolean> | null = null

/** One refresh at a time: the server treats a second use of the same token as theft. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = readRefresh()
    if (!rt) return false
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) })
      if (!res.ok) {
        // 401/400 = token spent or revoked. Anything else (429, 5xx) is temporary: keep the token and let the caller see the error.
        if (res.status === 401 || res.status === 400) { tokens.clear(); lostHandler?.() }
        return false
      }
      tokens.set((await res.json()) as Session)
      return true
    } catch { return false }
  })().finally(() => { refreshing = null })
  return refreshing
}

interface Opts { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean }

async function send(path: string, o: Opts): Promise<Response> {
  const url = new URL(`${API_URL}${path}`) // VITE_API_URL must be an absolute URL
  for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: Record<string, string> = {}
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (o.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    return await fetch(url, { method: o.method ?? 'GET', headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) })
  } catch {
    throw new AppError('networkError')
  }
}

export async function api<T>(path: string, o: Opts = {}): Promise<T> {
  // Renew a little early so a request does not start with a token that expires in flight.
  if (o.auth !== false && readRefresh() && (!accessToken || Date.now() > accessExpiresAt - 30_000)) await refresh()
  let res = await send(path, o)
  if (res.status === 401 && o.auth !== false && readRefresh() && (await refresh())) res = await send(path, o)
  if (!res.ok) {
    let body: ErrorBody | null = null
    try { body = (await res.json()) as ErrorBody } catch { /* not JSON */ }
    if (res.status === 401 && o.auth !== false) { tokens.clear(); lostHandler?.() }
    throw toAppError(res.status, body)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface Page<T> { data: T[]; total: number; page: number; limit: number }

/** Reads every page of a list endpoint. The screens still filter and sort in the browser. */
export async function apiAll<T>(path: string, query: Record<string, string | number | undefined> = {}, limit = 200): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const r = await api<Page<T>>(path, { query: { ...query, page, limit } })
    out.push(...r.data)
    if (out.length >= r.total || r.data.length === 0) return out
  }
}
