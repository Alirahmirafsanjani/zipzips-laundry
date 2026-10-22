/**
 * Klien HTTP untuk backend ZIP-ZIPS.
 *
 * - Token bearer disimpan di localStorage (MVP, mengikuti pola STIMBADUTA).
 * - Semua respons backend berbentuk { data, meta } atau { error }.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const TOKEN_KEY = 'zipzips.token'

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/* ------------------------------------------------------------------ *
 * Penyimpanan token
 * ------------------------------------------------------------------ */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* localStorage tidak tersedia (mode privat) */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* abaikan */
  }
}

/* ------------------------------------------------------------------ *
 * Callback saat sesi berakhir
 * ------------------------------------------------------------------ */
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Lewati parsing JSON (untuk unduhan file/CSV). */
  raw?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, headers, ...rest } = options

  const finalHeaders = new Headers(headers)
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Tidak bisa menghubungi server. Periksa koneksi internet Anda.',
    )
  }

  if (raw) {
    if (!response.ok) {
      throw new ApiError(response.status, 'HTTP_ERROR', `Gagal (${response.status})`)
    }
    return (await response.text()) as unknown as T
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error
    const code = error?.code ?? 'HTTP_ERROR'
    const message = error?.message ?? `Terjadi kesalahan (${response.status}).`

    if (response.status === 401) {
      clearToken()
      unauthorizedHandler?.()
    }

    throw new ApiError(response.status, code, message, error?.details)
  }

  return (payload as { data: T })?.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/**
 * Ambil data beserta meta (pagination). Backend mengembalikan { data, meta }.
 */
export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: Record<string, unknown> | null }> {
  const { body, headers, ...rest } = options
  const finalHeaders = new Headers(headers)
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let payload: { data?: T; meta?: Record<string, unknown>; error?: { code: string; message: string } } | null =
    null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? `Terjadi kesalahan (${response.status}).`
    if (response.status === 401) {
      clearToken()
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, payload?.error?.code ?? 'HTTP_ERROR', message)
  }

  return { data: payload?.data as T, meta: payload?.meta ?? null }
}

export default api
