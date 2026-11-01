// POST /api/session/demo: signs a visitor in to one of the demo accounts and gives them a private workspace seeded
// with a fresh copy of the demo data. It is its own function so Netlify can rate limit it per IP.

import { DEMO_ACCOUNTS, demoAccountFor } from '../../shared/demo'
import { demoSignInSchema } from '../../shared/validation'
import { issueSessionCookies, readSession, sessionInfo, sessionSecret } from './auth'
import { firestore } from './firestore'
import { HttpError, assertSameOrigin, errorResponse, json, parse, readJson } from './http'
import { createWorkspace, deleteWorkspace, hashIp } from './workspace'

export async function handleDemoSignIn(req: Request, options: { ip?: string; now?: Date } = {}): Promise<Response> {
  const now = options.now ?? new Date()
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST to sign in.')
    assertSameOrigin(req)
    const input = parse(demoSignInSchema, await readJson(req))
    const account =
      'role' in input ? DEMO_ACCOUNTS.find((a) => a.role === input.role) : demoAccountFor(input.email, input.password)
    if (!account) {
      throw new HttpError(401, 'invalid_credentials', 'That email and password do not match an account.')
    }

    const db = firestore()
    // Starting again replaces the visitor's previous workspace instead of leaving it to expire.
    const previous = readSession(req, now)
    if (previous) await deleteWorkspace(db, previous.w).catch((error) => console.error(error))

    const { id, meta } = await createWorkspace(db, { ipHash: hashIp(options.ip ?? 'unknown', sessionSecret()), now })
    const info = await sessionInfo(db, id, meta, account.role)
    return json(201, info, issueSessionCookies(id, account.role, meta, now))
  } catch (error) {
    return errorResponse(error)
  }
}
