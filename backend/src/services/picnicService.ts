import type {
  PicnicCheckoutRequest,
  PicnicCheckoutResult,
  StoreIntegrationMode,
} from '../types/contracts.js'

interface PicnicCheckoutOutcome {
  integrationMode: StoreIntegrationMode
  cartUpdated: PicnicCheckoutResult[]
}

const PICNIC_TIMEOUT_MS = Number(process.env.PICNIC_TIMEOUT_MS || 15000)
const PICNIC_API_BASE_URL = process.env.PICNIC_API_BASE_URL || 'https://storefront-prod.nl.picnicinternational.com/api/17'
const PICNIC_LOGIN_PATH = process.env.PICNIC_LOGIN_PATH || '/auth/login'
const PICNIC_SEARCH_PATH = process.env.PICNIC_SEARCH_PATH || '/search'
const PICNIC_ADD_TO_CART_PATH = process.env.PICNIC_ADD_TO_CART_PATH || '/cart/add_product'

type PicnicAuthConfig = {
  authToken: string
  sessionCookie: string
  userId: string
  apiKey: string
  email: string
  password: string
}

function resolveAuthConfig(payload: PicnicCheckoutRequest): PicnicAuthConfig {
  return {
    authToken: payload.auth?.authToken || process.env.PICNIC_AUTH_TOKEN || '',
    sessionCookie: payload.auth?.sessionCookie || process.env.PICNIC_SESSION_COOKIE || '',
    userId: payload.auth?.userId || process.env.PICNIC_USER_ID || '',
    apiKey: payload.auth?.apiKey || process.env.PICNIC_API_KEY || '',
    email: payload.auth?.email || process.env.PICNIC_EMAIL || '',
    password: payload.auth?.password || process.env.PICNIC_PASSWORD || '',
  }
}

function hasLiveCredentials(auth: PicnicAuthConfig): boolean {
  return Boolean(
    auth.authToken ||
    auth.sessionCookie ||
    (auth.userId && auth.apiKey) ||
    (auth.email && auth.password)
  )
}

function normalizedBaseUrl(): string {
  return PICNIC_API_BASE_URL.endsWith('/') ? PICNIC_API_BASE_URL.slice(0, -1) : PICNIC_API_BASE_URL
}

function timeoutSignal(): AbortSignal {
  const timeout = Number.isFinite(PICNIC_TIMEOUT_MS) && PICNIC_TIMEOUT_MS > 0 ? PICNIC_TIMEOUT_MS : 15000
  return AbortSignal.timeout(timeout)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function collectCandidates(value: unknown, out: Array<{ id: string; title: string }>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCandidates(item, out)
    return
  }

  const record = asRecord(value)
  if (!record) return

  const id = cleanText(record.product_id) || cleanText(record.id) || cleanText(record.article_id)
  const title = cleanText(record.display_name) || cleanText(record.name) || cleanText(record.title)
  if (id) {
    out.push({ id, title })
  }

  for (const nested of Object.values(record)) {
    collectCandidates(nested, out)
  }
}

function chooseBestProductId(searchPayload: unknown, query: string): { id: string; title: string } | null {
  const candidates: Array<{ id: string; title: string }> = []
  collectCandidates(searchPayload, candidates)
  if (candidates.length === 0) return null

  const normalizedQuery = query.toLowerCase()
  const exact = candidates.find((c) => c.title.toLowerCase().includes(normalizedQuery))
  return exact ?? candidates[0]
}

class PicnicSession {
  private readonly headers: Record<string, string>
  private readonly cookies: Map<string, string>

  constructor() {
    this.headers = { 'Content-Type': 'application/json' }
    this.cookies = new Map<string, string>()
  }

  addHeaders(entries: Record<string, string>): void {
    for (const [k, v] of Object.entries(entries)) {
      if (v) this.headers[k] = v
    }
  }

  addCookieHeader(rawCookie: string): void {
    if (!rawCookie) return
    const parts = rawCookie.split(';')
    for (const part of parts) {
      const [key, ...rest] = part.trim().split('=')
      if (!key || rest.length === 0) continue
      this.cookies.set(key, rest.join('='))
    }
  }

  absorbSetCookie(setCookie: string[] | undefined): void {
    if (!Array.isArray(setCookie)) return
    for (const cookieLine of setCookie) {
      const first = cookieLine.split(';')[0]
      const [key, ...rest] = first.trim().split('=')
      if (!key || rest.length === 0) continue
      this.cookies.set(key, rest.join('='))
    }
  }

  buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const built: Record<string, string> = { ...this.headers, ...(extra || {}) }
    if (this.cookies.size > 0) {
      built.Cookie = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    }
    return built
  }
}

async function picnicFetchJson<T>(
  session: PicnicSession,
  path: string,
  options: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown; extraHeaders?: Record<string, string> }
): Promise<{ ok: boolean; status: number; payload: T | null; errorText: string }> {
  const base = normalizedBaseUrl()
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value) url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: options.method || 'GET',
      headers: session.buildHeaders(options.extraHeaders),
      signal: timeoutSignal(),
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      errorText: error instanceof Error ? error.message : 'Network error',
    }
  }

  session.absorbSetCookie((res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.())

  const text = await res.text()
  let parsed: T | null = null
  if (text) {
    try {
      parsed = JSON.parse(text) as T
    } catch {
      parsed = null
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    payload: parsed,
    errorText: res.ok ? '' : text,
  }
}

async function initializeLiveSession(auth: PicnicAuthConfig): Promise<PicnicSession> {
  const session = new PicnicSession()

  if (auth.authToken) {
    session.addHeaders({ Authorization: `Bearer ${auth.authToken}` })
  }
  if (auth.userId && auth.apiKey) {
    session.addHeaders({
      'X-Picnic-User-Id': auth.userId,
      'X-Picnic-Api-Key': auth.apiKey,
    })
  }
  if (auth.sessionCookie) {
    session.addCookieHeader(auth.sessionCookie)
  }

  if (auth.email && auth.password && !auth.authToken && !auth.sessionCookie) {
    const login = await picnicFetchJson<Record<string, unknown>>(session, PICNIC_LOGIN_PATH, {
      method: 'POST',
      body: { email: auth.email, password: auth.password },
    })

    if (!login.ok) {
      throw new Error(`Picnic login failed (${login.status}): ${login.errorText || 'No response body'}`)
    }

    const loginPayload = asRecord(login.payload)
    const token = cleanText(loginPayload?.token)
    if (token) {
      session.addHeaders({ Authorization: `Bearer ${token}` })
    }
  }

  return session
}

async function checkoutLive(payload: PicnicCheckoutRequest): Promise<PicnicCheckoutResult[]> {
  const auth = resolveAuthConfig(payload)
  const session = await initializeLiveSession(auth)
  const results: PicnicCheckoutResult[] = []

  for (const product of payload.products) {
    const search = await picnicFetchJson<unknown>(session, PICNIC_SEARCH_PATH, {
      method: 'GET',
      query: { query: product.query },
    })

    if (!search.ok) {
      results.push({
        query: product.query,
        status: 'error',
        detail: `Search failed (${search.status}): ${search.errorText || 'No response body'}`,
      })
      continue
    }

    const productMatch = chooseBestProductId(search.payload, product.query)
    if (!productMatch) {
      results.push({
        query: product.query,
        status: 'not_found',
        detail: 'No matching Picnic product found',
      })
      continue
    }

    const add = await picnicFetchJson<unknown>(session, PICNIC_ADD_TO_CART_PATH, {
      method: 'POST',
      body: {
        product_id: productMatch.id,
        count: product.quantity,
      },
    })

    if (!add.ok) {
      results.push({
        query: product.query,
        status: 'error',
        detail: `Add-to-cart failed (${add.status}): ${add.errorText || 'No response body'}`,
      })
      continue
    }

    results.push({
      query: product.query,
      status: 'added',
      detail: productMatch.title ? `Matched: ${productMatch.title}` : undefined,
    })
  }

  return results
}

export async function checkoutWithPicnic(payload: PicnicCheckoutRequest): Promise<PicnicCheckoutOutcome> {
  const auth = resolveAuthConfig(payload)

  if (!hasLiveCredentials(auth)) {
    const detail = 'Missing Picnic credentials. Provide email/password or auth token/session.'

    return {
      integrationMode: 'live',
      cartUpdated: payload.products.map((product) => ({
        query: product.query,
        status: 'error',
        detail,
      })),
    }
  }

  try {
    const cartUpdated = await checkoutLive(payload)
    return {
      integrationMode: 'live',
      cartUpdated,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown live Picnic error'

    return {
      integrationMode: 'live',
      cartUpdated: payload.products.map((product) => ({
        query: product.query,
        status: 'error',
        detail,
      })),
    }
  }
}
