import { api } from '@/services/http/client'

export const createBusiness = (body: object) => api<{ id: string; name: string; color: string | null }>('/businesses', { method: 'POST', body, timeoutMs: 30_000 })
export const patchBusiness = (id: string, body: { name?: string; color?: string }) => api<{ id: string; name: string; color: string | null }>(`/businesses/${encodeURIComponent(id)}`, { method: 'PATCH', body })
