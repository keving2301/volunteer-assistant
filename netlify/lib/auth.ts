import type { Firestore } from 'firebase-admin/firestore'
import { fullName, type Role, type SessionInfo, type Volunteer } from '../../shared/types'
import { env } from './env'
import { HttpError } from './http'
import {
  COOKIE_NAME,
  hintCookie,
  readCookie,
  sessionCookie,
  signSession,
  verifySession,
  type SessionPayload,
} from './session'
import { col, getWorkspace, type WorkspaceMeta } from './workspace'

export function sessionSecret(): string {
  return env('SESSION_SECRET')
}

export function readSession(req: Request, now = new Date()): SessionPayload | null {
  return verifySession(readCookie(req.headers.get('cookie'), COOKIE_NAME), sessionSecret(), now.getTime())
}

/** The signed-in visitor and their workspace, or a 401 that sends the browser back to sign-in. */
export async function requireSession(req: Request, db: Firestore, now = new Date()) {
  const session = readSession(req, now)
  if (!session) throw new HttpError(401, 'no_session', 'Sign in to continue.')
  const meta = await getWorkspace(db, session.w, now)
  return { session, meta, workspaceId: session.w }
}

/** Set-Cookie values for this workspace and role: the signed session and the hint. Both expire with the workspace. */
export function issueSessionCookies(workspaceId: string, role: Role, meta: WorkspaceMeta, now = new Date()): string[] {
  const exp = Math.floor(meta.expiresAt.toMillis() / 1000)
  const token = signSession({ v: 1, w: workspaceId, r: role, iat: Math.floor(now.getTime() / 1000), exp }, sessionSecret())
  const maxAge = exp - Math.floor(now.getTime() / 1000)
  return [sessionCookie(token, maxAge), hintCookie(maxAge)]
}

export async function sessionInfo(db: Firestore, workspaceId: string, meta: WorkspaceMeta, role: Role): Promise<SessionInfo> {
  const workspace = { createdAt: meta.createdAt.toDate().toISOString(), expiresAt: meta.expiresAt.toDate().toISOString() }
  if (role === 'coordinator') {
    return {
      role,
      name: meta.coordinator.name,
      email: meta.coordinator.email,
      volunteerId: null,
      demoVolunteerId: meta.demoVolunteerId,
      workspace,
    }
  }
  const snap = await col(db, workspaceId, 'volunteers').doc(meta.demoVolunteerId).get()
  const volunteer = snap.data() as Omit<Volunteer, 'id'> | undefined
  if (!volunteer) throw new HttpError(401, 'workspace_expired', 'This demo workspace is incomplete. Sign in again.')
  return {
    role,
    name: fullName(volunteer),
    email: volunteer.email,
    volunteerId: snap.id,
    demoVolunteerId: meta.demoVolunteerId,
    workspace,
  }
}
