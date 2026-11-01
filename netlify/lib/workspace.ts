// Workspaces: each demo sign-in gets a private copy of the demo data under workspaces/{id}, with the schools,
// volunteers, semesters and teams as subcollections. Every API query goes through a workspace reference taken from
// the signed session, so one visitor can never read or change another visitor's data.

import { createHash, createHmac } from 'node:crypto'
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { utcIsoDate } from '../../shared/calendar'
import { WORKSPACE_LIMITS, WORKSPACE_TTL_HOURS, type LimitedCollection } from '../../shared/demo'
import { HttpError } from './http'
import { buildDemoWorkspace } from './seed'

export const WORKSPACES = 'workspaces'
const RATE_LIMITS = 'rateLimits'

/** Workspaces one network may start per UTC day, on top of Netlify's per-minute limit on the sign-in function. */
export const MAX_WORKSPACES_PER_IP_PER_DAY = 25
/** Workspaces alive at once, which keeps the project inside Firestore's free daily quota. */
export const MAX_ACTIVE_WORKSPACES = 400

export type CollectionName = LimitedCollection

export interface WorkspaceMeta {
  createdAt: Timestamp
  expiresAt: Timestamp
  coordinator: { name: string; email: string }
  demoVolunteerId: string
  counts: Record<LimitedCollection, number>
  /** Incremented by every change. Each write transaction reads and bumps it, so writes to one workspace serialize. */
  rev: number
  ipHash: string
  seedVersion: number
}

export function workspaceRef(db: Firestore, id: string) {
  return db.collection(WORKSPACES).doc(id)
}

export function col(db: Firestore, workspaceId: string, name: CollectionName) {
  return workspaceRef(db, workspaceId).collection(name)
}

/** A document as an entity: its id plus its fields. */
export function entity<T extends { id: string }>(snap: QueryDocumentSnapshot | DocumentSnapshot): T {
  return { id: snap.id, ...snap.data() } as T
}

export function stripId<T extends { id: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value
  return rest
}

/** IPs are never stored: only a keyed hash, enough to count sign-ins per network. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32)
}

function expired(meta: WorkspaceMeta, now: Date): boolean {
  return meta.expiresAt.toMillis() <= now.getTime()
}

const EXPIRED = () =>
  new HttpError(401, 'workspace_expired', 'Your demo workspace has expired. Sign in again to start a new one.')

export async function getWorkspace(db: Firestore, id: string, now = new Date()): Promise<WorkspaceMeta> {
  const snap = await workspaceRef(db, id).get()
  const meta = snap.data() as WorkspaceMeta | undefined
  if (!meta || expired(meta, now)) throw EXPIRED()
  return meta
}

/**
 * Reads the workspace inside a transaction (taking its lock) and checks it is alive. Callers then write their change
 * and call `touch` so the revision moves on.
 */
export async function lockWorkspace(tx: Transaction, db: Firestore, id: string, now = new Date()) {
  const snap = await tx.get(workspaceRef(db, id))
  const meta = snap.data() as WorkspaceMeta | undefined
  if (!meta || expired(meta, now)) throw EXPIRED()
  return meta
}

export function touch(
  tx: Transaction,
  db: Firestore,
  id: string,
  counts: Partial<Record<LimitedCollection, number>> = {},
): void {
  const update: Record<string, unknown> = { rev: FieldValue.increment(1) }
  for (const [name, delta] of Object.entries(counts)) {
    if (delta) update[`counts.${name}`] = FieldValue.increment(delta)
  }
  tx.update(workspaceRef(db, id), update)
}

export function assertRoom(meta: WorkspaceMeta, name: LimitedCollection, adding = 1): void {
  if ((meta.counts[name] ?? 0) + adding > WORKSPACE_LIMITS[name]) {
    throw new HttpError(
      409,
      'workspace_full',
      `A demo workspace can hold up to ${WORKSPACE_LIMITS[name]} ${name}. Delete one to add another.`,
    )
  }
}

/** Creates a workspace seeded with a fresh copy of the demo data, after the per-network and global limits. */
export async function createWorkspace(db: Firestore, opts: { ipHash: string; now?: Date }) {
  const now = opts.now ?? new Date()
  const day = utcIsoDate(now)

  const active = await db.collection(WORKSPACES).where('expiresAt', '>', Timestamp.fromDate(now)).count().get()
  if (active.data().count >= MAX_ACTIVE_WORKSPACES) {
    throw new HttpError(503, 'demo_busy', 'The demo is busy right now. Try again in a few minutes.')
  }

  const limitRef = db.collection(RATE_LIMITS).doc(createHash('sha256').update(`${opts.ipHash}:${day}`).digest('hex'))
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef)
    const count = (snap.get('count') as number | undefined) ?? 0
    if (count >= MAX_WORKSPACES_PER_IP_PER_DAY) {
      throw new HttpError(
        429,
        'too_many_workspaces',
        'This network has started many demo workspaces today. Try again tomorrow.',
      )
    }
    tx.set(limitRef, {
      count: count + 1,
      // The daily cleanup deletes counters past this time.
      expiresAt: Timestamp.fromMillis(now.getTime() + 2 * 86_400_000),
    })
  })

  const ref = db.collection(WORKSPACES).doc()
  const newId = () => db.collection(WORKSPACES).doc().id
  const seed = buildDemoWorkspace(day, newId)
  const meta: WorkspaceMeta = {
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromMillis(now.getTime() + WORKSPACE_TTL_HOURS * 3_600_000),
    coordinator: seed.coordinator,
    demoVolunteerId: seed.demoVolunteerId,
    counts: {
      schools: seed.schools.length,
      volunteers: seed.volunteers.length,
      teams: seed.teams.length,
      semesters: seed.semesters.length,
    },
    rev: 0,
    ipHash: opts.ipHash,
    seedVersion: 1,
  }

  // About 70 documents: one atomic batch, so a workspace is either complete or absent.
  const batch = db.batch()
  batch.set(ref, meta)
  for (const s of seed.semesters) batch.set(ref.collection('semesters').doc(s.id), stripId(s))
  for (const s of seed.schools) batch.set(ref.collection('schools').doc(s.id), stripId(s))
  for (const v of seed.volunteers) batch.set(ref.collection('volunteers').doc(v.id), stripId(v))
  for (const t of seed.teams) batch.set(ref.collection('teams').doc(t.id), stripId(t))
  await batch.commit()

  return { id: ref.id, meta }
}

export async function deleteWorkspace(db: Firestore, id: string): Promise<void> {
  await db.recursiveDelete(workspaceRef(db, id))
}

/** Deletes workspaces past their 24 hours, oldest first, until the time budget runs out. Returns how many. */
export async function deleteExpiredWorkspaces(db: Firestore, now = new Date(), budgetMs = 20_000): Promise<number> {
  const started = Date.now()
  let deleted = 0
  while (Date.now() - started < budgetMs) {
    const page = await db
      .collection(WORKSPACES)
      .where('expiresAt', '<=', Timestamp.fromDate(now))
      .orderBy('expiresAt')
      .limit(20)
      .get()
    if (page.empty) break
    for (const doc of page.docs) {
      await db.recursiveDelete(doc.ref)
      deleted++
    }
  }
  const counters = await db.collection(RATE_LIMITS).where('expiresAt', '<=', Timestamp.fromDate(now)).limit(400).get()
  if (!counters.empty) {
    const batch = db.batch()
    counters.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }
  return deleted
}
