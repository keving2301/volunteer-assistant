import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  COOKIE_NAME,
  clearedSessionCookie,
  readCookie,
  sessionCookie,
  signSession,
  verifySession,
  type SessionPayload,
} from '../../netlify/lib/session'

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long'
const NOW = Date.UTC(2026, 10, 1, 12)
const payload: SessionPayload = { v: 1, w: 'workspace123', r: 'coordinator', iat: NOW / 1000, exp: NOW / 1000 + 3600 }

describe('session cookie signing', () => {
  it('round trips a signed payload', () => {
    expect(verifySession(signSession(payload, SECRET), SECRET, NOW)).toEqual(payload)
  })

  it('rejects a token signed with another secret', () => {
    const token = signSession(payload, SECRET)
    expect(verifySession(token, `${SECRET}-other`, NOW)).toBeNull()
  })

  it('rejects an edited payload, such as a changed role or workspace', () => {
    const [, signature] = signSession(payload, SECRET).split('.')
    for (const change of [{ r: 'volunteer' }, { w: 'someone-else' }, { exp: payload.exp + 86_400 }]) {
      const forged = Buffer.from(JSON.stringify({ ...payload, ...change })).toString('base64url')
      expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull()
    }
  })

  it('rejects an expired session', () => {
    const token = signSession(payload, SECRET)
    expect(verifySession(token, SECRET, (payload.exp - 1) * 1000)).not.toBeNull()
    expect(verifySession(token, SECRET, payload.exp * 1000)).toBeNull()
  })

  it('rejects malformed tokens without throwing', () => {
    for (const token of [null, undefined, '', 'abc', 'a.b.c', '.', 'x'.repeat(2000), `${'e30'}.${'!!!'}`]) {
      expect(verifySession(token, SECRET, NOW)).toBeNull()
    }
  })

  it('rejects a correctly signed body that is not a session', () => {
    const body = Buffer.from(JSON.stringify({ v: 1, w: '../../etc', r: 'admin', iat: 0, exp: 9e9 })).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
    expect(verifySession(`${body}.${sig}`, SECRET, NOW)).toBeNull()
  })

  it('refuses to sign with a short secret', () => {
    expect(() => signSession(payload, 'short')).toThrow(/32 characters/)
  })

  it('sets an HTTP-only, Secure, SameSite=Lax host cookie', () => {
    const cookie = sessionCookie('token', 3600)
    expect(cookie).toBe(`${COOKIE_NAME}=token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`)
    expect(COOKIE_NAME.startsWith('__Host-')).toBe(true)
    expect(clearedSessionCookie()).toContain('Max-Age=0')
  })

  it('reads one cookie from a Cookie header', () => {
    expect(readCookie(`theme=dark; ${COOKIE_NAME}=abc.def; other=1`, COOKIE_NAME)).toBe('abc.def')
    expect(readCookie('theme=dark', COOKIE_NAME)).toBeNull()
    expect(readCookie(null, COOKIE_NAME)).toBeNull()
  })
})
