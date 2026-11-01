// The session is a cookie that holds which workspace and role the visitor signed in to, signed with HMAC-SHA256 so it
// cannot be forged or edited. It is HTTP-only (scripts cannot read it), Secure, SameSite=Lax, and expires with the
// workspace.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Role } from '../../shared/types'

export const COOKIE_NAME = '__Host-vas_session'

/** Readable by the page and holds nothing secret: it only tells the app a session may exist, so a signed-out visitor
 * sees the sign-in form at once instead of waiting for the API to say so. */
export const HINT_COOKIE_NAME = 'vas_signed_in'

export interface SessionPayload {
  /** Format version, so a future change can reject old cookies. */
  v: 1
  /** Workspace id. */
  w: string
  r: Role
  /** Issued and expires, in seconds since the epoch. */
  iat: number
  exp: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function mac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

export function signSession(payload: SessionPayload, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  const body = b64url(JSON.stringify(payload))
  return `${body}.${b64url(mac(body, secret))}`
}

/** Returns the payload when the signature matches and the session has not expired, otherwise null. */
export function verifySession(token: string | undefined | null, secret: string, nowMs = Date.now()): SessionPayload | null {
  if (!token || token.length > 1024) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  const expected = mac(body, secret)
  let given: Buffer
  try {
    given = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!isPayload(payload)) return null
  if (payload.exp * 1000 <= nowMs) return null
  return payload
}

function isPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    p.v === 1 &&
    typeof p.w === 'string' &&
    /^[A-Za-z0-9_-]{1,40}$/.test(p.w) &&
    (p.r === 'coordinator' || p.r === 'volunteer') &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number'
  )
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function hintCookie(maxAgeSeconds: number): string {
  return `${HINT_COOKIE_NAME}=1; Path=/; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
}

/** Both cookies cleared, for sign-out and for a session the server no longer accepts. */
export function clearedCookies(): string[] {
  return [clearedSessionCookie(), `${HINT_COOKIE_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`]
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}
