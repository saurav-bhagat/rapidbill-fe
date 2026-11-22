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
  /** What this person is in the business: OWNER, MANAGER or STAFF. */
  role?: string
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
}

const REFRESH_KEY = 'rapidbill:refresh-token'
let accessToken: string | null = null
let accessExpiresAt = 0
/** The business the signed-in session is for. Sent on every call so a late request from a screen that has since moved to another business is refused, not written into the wrong one. */
let businessId: string | null = null
let lostHandler: (() => void) | null = null

const readRefresh = () => { try { return localStorage.getItem(REFRESH_KEY) } catch { return null } }
const writeRefresh = (v: string | null) => {
  try { if (v) localStorage.setItem(REFRESH_KEY, v); else localStorage.removeItem(REFRESH_KEY) } catch { /* storage blocked: stay signed in for this tab only */ }
}

const blockedListeners = new Set<() => void>()
/** Called when the server answers 402: the license ended, so the app should look again. */
export const onLicenseBlocked = (fn: () => void) => { blockedListeners.add(fn); return () => { blockedListeners.delete(fn) } }

export const tokens = {
  hasRefresh: () => readRefresh() !== null,
  /** The refresh token of the session in this browser (shared by its tabs). */
  refreshToken: readRefresh,
  set(s: Session) { accessToken = s.accessToken; accessExpiresAt = Date.parse(s.accessTokenExpiresAt); businessId = s.workspace.id; writeRefresh(s.refreshToken) },
  clear() { pendingBusiness = null; accessToken = null; accessExpiresAt = 0; businessId = null; writeRefresh(null) },
  /** Offline: the screen moved to another business of this device; tell the server at the first chance. */
  moveLocally(id: string) { businessId = id; pendingBusiness = id },
  /** The business this session is for (null when signed out). */
  businessId: () => businessId,
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

/** Send one request as another business of the same person, with a token made for it (the background sender). It never touches the open session: a refusal here must not sign anyone out. */
export interface AsBusiness { id: string; token: string }
interface Opts { as?: AsBusiness; /** An account-level call (about the person): no business header. */ account?: boolean; method?: string; body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean; /** Give up (as if offline) after this long. */ timeoutMs?: number }

async function send(path: string, o: Opts): Promise<Response> {
  const url = new URL(`${API_URL}${path}`, window.location.origin) // VITE_API_URL may be absolute (https://api.example.com) or same-origin (/api)
  for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: Record<string, string> = {}
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (o.as) {
    headers.Authorization = `Bearer ${o.as.token}`
    headers['X-Client'] = 'web'
    headers['X-Business-Id'] = o.as.id
  } else if (o.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
    headers['X-Client'] = 'web'
    if (businessId && !o.account) headers['X-Business-Id'] = businessId
  }
  try {
    return await fetch(url, { method: o.method ?? 'GET', headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: o.timeoutMs ? AbortSignal.timeout(o.timeoutMs) : undefined })
  } catch {
    throw new AppError('networkError')
  }
}

/** After an offline switch the server still thinks the login is for the other business: say so with the first call that can reach it. */
let pendingBusiness: string | null = null

async function settlePending(): Promise<void> {
  const target = pendingBusiness
  if (!target) return
  const rt = readRefresh()
  const res = await send('/auth/switch', { method: 'POST', body: { businessId: target, refreshToken: rt ?? undefined }, account: true, timeoutMs: 15_000 })
  if (res.ok) { tokens.set((await res.json()) as Session); if (pendingBusiness === target) pendingBusiness = null }
  else if (res.status === 401 || res.status === 403) { pendingBusiness = null } // no longer allowed: the next call will say so
}

async function request(path: string, o: Opts): Promise<Response> {
  if (pendingBusiness && !o.as && o.auth !== false && !o.account) { try { await settlePending() } catch { /* still offline: the call below fails the same way */ } }
  // Renew a little early so a request does not start with a token that expires in flight.
  if (!o.as && o.auth !== false && readRefresh() && (!accessToken || Date.now() > accessExpiresAt - 30_000)) await refresh()
  let res = await send(path, o)
  if (!o.as && res.status === 401 && o.auth !== false && readRefresh() && (await refresh())) res = await send(path, o)
  if (!res.ok) {
    let body: ErrorBody | null = null
    try { body = (await res.json()) as ErrorBody } catch { /* not JSON */ }
    if (!o.as && res.status === 401 && o.auth !== false) { tokens.clear(); lostHandler?.() }
    if (!o.as && res.status === 402) blockedListeners.forEach((f) => f())
    throw toAppError(res.status, body)
  }
  return res
}

export async function api<T>(path: string, o: Opts = {}): Promise<T> {
  const res = await request(path, o)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** A file the server sends back (an invoice PDF), with the same sign-in, renewal and error handling as every other call. */
export async function apiBlob(path: string, o: Opts = {}): Promise<Blob> {
  return (await request(path, o)).blob()
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
