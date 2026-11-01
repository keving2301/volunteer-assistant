// The REST API under /api/*. Every route checks the signed session, the role, and the input; every change runs in a
// Firestore transaction that first locks the visitor's workspace document, so the scheduling rules are checked against
// the data as it is at the moment of the write.

import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { semesterStatus, utcIsoDate } from '../../shared/calendar'
import { availabilityReason, findPlacement, validateTeam } from '../../shared/schedule'
import { dayName, formatRange } from '../../shared/time'
import {
  fullName,
  type MyTeam,
  type Role,
  type School,
  type Semester,
  type SessionSlot,
  type Team,
  type Volunteer,
} from '../../shared/types'
import {
  availabilityInputSchema,
  idSchema,
  profileInputSchema,
  roleInputSchema,
  schoolInputSchema,
  semesterInputSchema,
  teamInputSchema,
  teamUpdateSchema,
  volunteerInputSchema,
} from '../../shared/validation'
import { issueSessionCookie, readSession, requireSession, sessionInfo } from './auth'
import { firestore } from './firestore'
import { HttpError, assertSameOrigin, errorResponse, json, parse, readJson } from './http'
import { COOKIE_NAME, clearedSessionCookie, readCookie, type SessionPayload } from './session'
import {
  assertRoom,
  col,
  deleteWorkspace,
  entity,
  lockWorkspace,
  stripId,
  touch,
  type WorkspaceMeta,
} from './workspace'

interface Ctx {
  req: Request
  url: URL
  db: Firestore
  workspaceId: string
  session: SessionPayload
  meta: WorkspaceMeta
  params: Record<string, string>
  now: Date
}

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  roles: Role[]
  handler: (ctx: Ctx) => Promise<Response>
}

const COORDINATOR: Role[] = ['coordinator']
const VOLUNTEER: Role[] = ['volunteer']
const ANY: Role[] = ['coordinator', 'volunteer']

const notFound = (what: string) => new HttpError(404, 'not_found', `That ${what} no longer exists.`)

function param(ctx: Ctx, name: string): string {
  return parse(idSchema, ctx.params[name])
}

async function body(ctx: Ctx): Promise<unknown> {
  return readJson(ctx.req)
}

/** Runs a change in a transaction that holds the workspace lock. */
function write<T>(ctx: Ctx, fn: (tx: Transaction, meta: WorkspaceMeta) => Promise<T>): Promise<T> {
  return ctx.db.runTransaction(async (tx) => fn(tx, await lockWorkspace(tx, ctx.db, ctx.workspaceId, ctx.now)))
}

const ref = (ctx: Ctx, name: 'semesters' | 'schools' | 'volunteers' | 'teams') => col(ctx.db, ctx.workspaceId, name)

async function all<T extends { id: string }>(
  ctx: Ctx,
  name: 'semesters' | 'schools' | 'volunteers' | 'teams',
  tx?: Transaction,
) {
  const query = ref(ctx, name)
  const snap = tx ? await tx.get(query) : await query.get()
  return snap.docs.map((d) => entity<T>(d))
}

const bySemesterStart = (a: Semester, b: Semester) => b.startDate.localeCompare(a.startDate)
const byName = (a: School, b: School) => a.name.localeCompare(b.name)
const byVolunteerName = (a: Volunteer, b: Volunteer) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)

// Session

async function getSession(ctx: Ctx) {
  return json(200, await sessionInfo(ctx.db, ctx.workspaceId, ctx.meta, ctx.session.r))
}

async function switchRole(ctx: Ctx) {
  const { role } = parse(roleInputSchema, await body(ctx))
  const info = await sessionInfo(ctx.db, ctx.workspaceId, ctx.meta, role)
  return json(200, info, { 'set-cookie': issueSessionCookie(ctx.workspaceId, role, ctx.meta, ctx.now) })
}

// Semesters

async function listSemesters(ctx: Ctx) {
  return json(200, (await all<Semester>(ctx, 'semesters')).sort(bySemesterStart))
}

async function createSemester(ctx: Ctx) {
  const input = parse(semesterInputSchema, await body(ctx))
  const stamp = ctx.now.toISOString()
  const semester = await write(ctx, async (tx, meta) => {
    assertRoom(meta, 'semesters')
    const doc = ref(ctx, 'semesters').doc()
    const value: Semester = { id: doc.id, ...input, createdAt: stamp, updatedAt: stamp }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId, { semesters: 1 })
    return value
  })
  return json(201, semester)
}

async function updateSemester(ctx: Ctx) {
  const id = param(ctx, 'id')
  const input = parse(semesterInputSchema, await body(ctx))
  const semester = await write(ctx, async (tx) => {
    const doc = ref(ctx, 'semesters').doc(id)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('semester')
    const value = { ...entity<Semester>(snap), ...input, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  return json(200, semester)
}

async function deleteSemester(ctx: Ctx) {
  const id = param(ctx, 'id')
  await write(ctx, async (tx) => {
    const doc = ref(ctx, 'semesters').doc(id)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('semester')
    const teams = await tx.get(ref(ctx, 'teams').where('semesterId', '==', id))
    teams.docs.forEach((t) => tx.delete(t.ref))
    tx.delete(doc)
    touch(tx, ctx.db, ctx.workspaceId, { semesters: -1, teams: -teams.size })
  })
  return json(204, null)
}

// Schools

async function listSchools(ctx: Ctx) {
  return json(200, (await all<School>(ctx, 'schools')).sort(byName))
}

async function createSchool(ctx: Ctx) {
  const input = parse(schoolInputSchema, await body(ctx))
  const stamp = ctx.now.toISOString()
  const school = await write(ctx, async (tx, meta) => {
    assertRoom(meta, 'schools')
    const doc = ref(ctx, 'schools').doc()
    const sessions: SessionSlot[] = input.sessions.map((s) => ({ id: ref(ctx, 'schools').doc().id, day: s.day, start: s.start, end: s.end }))
    const value: School = { id: doc.id, ...input, sessions, createdAt: stamp, updatedAt: stamp }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId, { schools: 1 })
    return value
  })
  return json(201, school)
}

async function updateSchool(ctx: Ctx) {
  const id = param(ctx, 'id')
  const input = parse(schoolInputSchema, await body(ctx))
  const school = await write(ctx, async (tx) => {
    const doc = ref(ctx, 'schools').doc(id)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('school')
    const current = entity<School>(snap)
    const teams = (await tx.get(ref(ctx, 'teams').where('schoolId', '==', id))).docs.map((d) => entity<Team>(d))
    const semesters = await all<Semester>(ctx, 'semesters', tx)

    // A session keeps its id only if it already belonged to this school; anything else is a new session.
    const sessions: SessionSlot[] = input.sessions.map((s) =>
      s.id && current.sessions.some((c) => c.id === s.id)
        ? { id: s.id, day: s.day, start: s.start, end: s.end }
        : { id: ref(ctx, 'schools').doc().id, day: s.day, start: s.start, end: s.end },
    )
    // A session that has a team keeps its day and time: changing it would move the team without checking its members.
    for (const team of teams) {
      const before = current.sessions.find((s) => s.id === team.sessionId)
      const after = sessions.find((s) => s.id === team.sessionId)
      if (before && (!after || after.day !== before.day || after.start !== before.start || after.end !== before.end)) {
        const semester = semesters.find((s) => s.id === team.semesterId)?.name ?? 'a semester'
        const index = input.sessions.findIndex((s) => s.id === before.id)
        throw new HttpError(
          409,
          'session_in_use',
          `${dayName(before.day)} ${formatRange(before.start, before.end)} has a team in ${semester}. Remove that team before changing or removing this session.`,
          index >= 0 ? { fields: { [`sessions.${index}.start`]: 'Has a team' } } : {},
        )
      }
    }
    const value: School = { ...current, ...input, sessions, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  return json(200, school)
}

async function deleteSchool(ctx: Ctx) {
  const id = param(ctx, 'id')
  await write(ctx, async (tx) => {
    const doc = ref(ctx, 'schools').doc(id)
    if (!(await tx.get(doc)).exists) throw notFound('school')
    const teams = await tx.get(ref(ctx, 'teams').where('schoolId', '==', id))
    teams.docs.forEach((t) => tx.delete(t.ref))
    tx.delete(doc)
    touch(tx, ctx.db, ctx.workspaceId, { schools: -1, teams: -teams.size })
  })
  return json(204, null)
}

// Volunteers

async function listVolunteers(ctx: Ctx) {
  return json(200, (await all<Volunteer>(ctx, 'volunteers')).sort(byVolunteerName))
}

async function assertEmailFree(ctx: Ctx, tx: Transaction, email: string, exceptId?: string) {
  const taken = await tx.get(ref(ctx, 'volunteers').where('email', '==', email).limit(2))
  if (taken.docs.some((d) => d.id !== exceptId)) {
    throw new HttpError(409, 'email_taken', 'Another volunteer already uses this email.', {
      fields: { email: 'Another volunteer already uses this email' },
    })
  }
}

async function createVolunteer(ctx: Ctx) {
  const input = parse(volunteerInputSchema, await body(ctx))
  const stamp = ctx.now.toISOString()
  const volunteer = await write(ctx, async (tx, meta) => {
    assertRoom(meta, 'volunteers')
    await assertEmailFree(ctx, tx, input.email)
    const doc = ref(ctx, 'volunteers').doc()
    const value: Volunteer = { id: doc.id, ...input, availability: [], createdAt: stamp, updatedAt: stamp }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId, { volunteers: 1 })
    return value
  })
  return json(201, volunteer)
}

const DEMO_ACCOUNT_LOCKED = (what: string) =>
  new HttpError(409, 'demo_account', `${what} Not available for the demo volunteer account.`)

async function updateVolunteer(ctx: Ctx) {
  const id = param(ctx, 'id')
  const input = parse(volunteerInputSchema, await body(ctx))
  const volunteer = await write(ctx, async (tx, meta) => {
    const doc = ref(ctx, 'volunteers').doc(id)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('volunteer')
    const current = entity<Volunteer>(snap)
    if (id === meta.demoVolunteerId && input.email !== current.email) {
      throw new HttpError(409, 'demo_account', 'The demo volunteer signs in with this email, so it stays the same.', {
        fields: { email: 'Not available for the demo volunteer account' },
      })
    }
    await assertEmailFree(ctx, tx, input.email, id)
    const value: Volunteer = { ...current, ...input, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  return json(200, volunteer)
}

async function deleteVolunteer(ctx: Ctx) {
  const id = param(ctx, 'id')
  if (id === ctx.meta.demoVolunteerId) throw DEMO_ACCOUNT_LOCKED('Deleting is')
  await write(ctx, async (tx) => {
    const doc = ref(ctx, 'volunteers').doc(id)
    if (!(await tx.get(doc)).exists) throw notFound('volunteer')
    // Removing a volunteer takes them off their teams; the dashboard then flags any team left short.
    const teams = await tx.get(ref(ctx, 'teams').where('memberIds', 'array-contains', id))
    teams.docs.forEach((t) => tx.update(t.ref, { memberIds: FieldValue.arrayRemove(id), updatedAt: ctx.now.toISOString() }))
    tx.delete(doc)
    touch(tx, ctx.db, ctx.workspaceId, { volunteers: -1 })
  })
  return json(204, null)
}

// Teams

async function listTeams(ctx: Ctx) {
  const semesterId = parse(idSchema, ctx.url.searchParams.get('semesterId') ?? '')
  const snap = await ref(ctx, 'teams').where('semesterId', '==', semesterId).get()
  return json(200, snap.docs.map((d) => entity<Team>(d)))
}

/** Reads everything the team rules need, inside the transaction, and throws 422 with the issues if any rule fails. */
async function checkTeam(
  ctx: Ctx,
  tx: Transaction,
  semesterId: string,
  draft: { schoolId: string; sessionId: string; memberIds: string[] },
  teamId?: string,
) {
  const semesterSnap = await tx.get(ref(ctx, 'semesters').doc(semesterId))
  if (!semesterSnap.exists) throw notFound('semester')
  const semester = entity<Semester>(semesterSnap)
  const schools = await all<School>(ctx, 'schools', tx)
  const teams = (await tx.get(ref(ctx, 'teams').where('semesterId', '==', semesterId))).docs.map((d) => entity<Team>(d))
  const unique = [...new Set(draft.memberIds)]
  const volunteers = unique.length
    ? (await tx.getAll(...unique.map((id) => ref(ctx, 'volunteers').doc(id))))
        .filter((s) => s.exists)
        .map((s) => entity<Volunteer>(s))
    : []
  const issues = validateTeam(draft, { semester, schools, volunteers, teams, teamId })
  if (issues.length) {
    throw new HttpError(422, 'team_invalid', issues[0].message, { issues })
  }
}

async function createTeam(ctx: Ctx) {
  const input = parse(teamInputSchema, await body(ctx))
  const stamp = ctx.now.toISOString()
  const team = await write(ctx, async (tx, meta) => {
    assertRoom(meta, 'teams')
    await checkTeam(ctx, tx, input.semesterId, input)
    const doc = ref(ctx, 'teams').doc()
    const value: Team = { id: doc.id, ...input, createdAt: stamp, updatedAt: stamp }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId, { teams: 1 })
    return value
  })
  return json(201, team)
}

async function updateTeam(ctx: Ctx) {
  const id = param(ctx, 'id')
  const input = parse(teamUpdateSchema, await body(ctx))
  const team = await write(ctx, async (tx) => {
    const doc = ref(ctx, 'teams').doc(id)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('team')
    const current = entity<Team>(snap)
    await checkTeam(ctx, tx, current.semesterId, input, id)
    const value: Team = { ...current, ...input, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  return json(200, team)
}

async function deleteTeam(ctx: Ctx) {
  const id = param(ctx, 'id')
  await write(ctx, async (tx) => {
    const doc = ref(ctx, 'teams').doc(id)
    if (!(await tx.get(doc)).exists) throw notFound('team')
    tx.delete(doc)
    touch(tx, ctx.db, ctx.workspaceId, { teams: -1 })
  })
  return json(204, null)
}

// The signed-in volunteer

async function getMe(ctx: Ctx) {
  const snap = await ref(ctx, 'volunteers').doc(ctx.meta.demoVolunteerId).get()
  if (!snap.exists) throw notFound('volunteer')
  return json(200, entity<Volunteer>(snap))
}

async function updateMe(ctx: Ctx) {
  const input = parse(profileInputSchema, await body(ctx))
  const volunteer = await write(ctx, async (tx, meta) => {
    const doc = ref(ctx, 'volunteers').doc(meta.demoVolunteerId)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('volunteer')
    const value: Volunteer = { ...entity<Volunteer>(snap), ...input, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  return json(200, volunteer)
}

async function myTeams(ctx: Ctx, volunteerId: string) {
  const [teamSnap, semesters, schools] = await Promise.all([
    ref(ctx, 'teams').where('memberIds', 'array-contains', volunteerId).get(),
    all<Semester>(ctx, 'semesters'),
    all<School>(ctx, 'schools'),
  ])
  return { teams: teamSnap.docs.map((d) => entity<Team>(d)), semesters, schools }
}

async function updateMyAvailability(ctx: Ctx) {
  const { availability } = parse(availabilityInputSchema, await body(ctx))
  const volunteer = await write(ctx, async (tx, meta) => {
    const doc = ref(ctx, 'volunteers').doc(meta.demoVolunteerId)
    const snap = await tx.get(doc)
    if (!snap.exists) throw notFound('volunteer')
    const value: Volunteer = { ...entity<Volunteer>(snap), availability, updatedAt: ctx.now.toISOString() }
    tx.set(doc, stripId(value))
    touch(tx, ctx.db, ctx.workspaceId)
    return value
  })
  // Teams this change leaves uncovered, in semesters that are not over. They are saved anyway: the coordinator's
  // dashboard flags them so the team can be adjusted.
  const today = utcIsoDate(ctx.now)
  const { teams, semesters, schools } = await myTeams(ctx, volunteer.id)
  const warnings = teams.flatMap((team) => {
    const semester = semesters.find((s) => s.id === team.semesterId)
    const place = findPlacement(schools, team.schoolId, team.sessionId)
    if (!semester || !place || semesterStatus(semester, today) === 'past') return []
    const reason = availabilityReason(volunteer, place.session, semester.travelBufferMinutes)
    if (!reason) return []
    const { day, start, end } = place.session
    return [
      {
        teamId: team.id,
        message: `${place.school.name}, ${dayName(day)} ${formatRange(start, end)} (${semester.name}): ${reason.message}.`,
      },
    ]
  })
  return json(200, { volunteer, warnings })
}

async function getMyTeams(ctx: Ctx) {
  const { teams, semesters, schools } = await myTeams(ctx, ctx.meta.demoVolunteerId)
  const teammateIds = [...new Set(teams.flatMap((t) => t.memberIds))].filter((id) => id !== ctx.meta.demoVolunteerId)
  const people = teammateIds.length
    ? (await ctx.db.getAll(...teammateIds.map((id) => ref(ctx, 'volunteers').doc(id))))
        .filter((s) => s.exists)
        .map((s) => entity<Volunteer>(s))
    : []
  const result: MyTeam[] = teams.flatMap((team) => {
    const semester = semesters.find((s) => s.id === team.semesterId)
    const place = findPlacement(schools, team.schoolId, team.sessionId)
    if (!semester || !place) return []
    const { id, name, address, contact, gradeBands } = place.school
    return [
      {
        team,
        semester: {
          id: semester.id,
          name: semester.name,
          startDate: semester.startDate,
          endDate: semester.endDate,
          travelBufferMinutes: semester.travelBufferMinutes,
        },
        school: { id, name, address, contact, gradeBands },
        session: place.session,
        teammates: team.memberIds
          .filter((m) => m !== ctx.meta.demoVolunteerId)
          .map((m) => people.find((p) => p.id === m))
          .filter((p): p is Volunteer => Boolean(p))
          .map((p) => ({ id: p.id, name: fullName(p) })),
      },
    ]
  })
  result.sort((a, b) => a.session.day - b.session.day || a.session.start - b.session.start)
  return json(200, result)
}

const ROUTES: Route[] = [
  { method: 'GET', path: '/api/session', roles: ANY, handler: getSession },
  { method: 'POST', path: '/api/session/role', roles: ANY, handler: switchRole },

  { method: 'GET', path: '/api/semesters', roles: ANY, handler: listSemesters },
  { method: 'POST', path: '/api/semesters', roles: COORDINATOR, handler: createSemester },
  { method: 'PATCH', path: '/api/semesters/:id', roles: COORDINATOR, handler: updateSemester },
  { method: 'DELETE', path: '/api/semesters/:id', roles: COORDINATOR, handler: deleteSemester },

  { method: 'GET', path: '/api/schools', roles: COORDINATOR, handler: listSchools },
  { method: 'POST', path: '/api/schools', roles: COORDINATOR, handler: createSchool },
  { method: 'PATCH', path: '/api/schools/:id', roles: COORDINATOR, handler: updateSchool },
  { method: 'DELETE', path: '/api/schools/:id', roles: COORDINATOR, handler: deleteSchool },

  { method: 'GET', path: '/api/volunteers', roles: COORDINATOR, handler: listVolunteers },
  { method: 'POST', path: '/api/volunteers', roles: COORDINATOR, handler: createVolunteer },
  { method: 'PATCH', path: '/api/volunteers/:id', roles: COORDINATOR, handler: updateVolunteer },
  { method: 'DELETE', path: '/api/volunteers/:id', roles: COORDINATOR, handler: deleteVolunteer },

  { method: 'GET', path: '/api/teams', roles: COORDINATOR, handler: listTeams },
  { method: 'POST', path: '/api/teams', roles: COORDINATOR, handler: createTeam },
  { method: 'PATCH', path: '/api/teams/:id', roles: COORDINATOR, handler: updateTeam },
  { method: 'DELETE', path: '/api/teams/:id', roles: COORDINATOR, handler: deleteTeam },

  { method: 'GET', path: '/api/me', roles: VOLUNTEER, handler: getMe },
  { method: 'PATCH', path: '/api/me', roles: VOLUNTEER, handler: updateMe },
  { method: 'PUT', path: '/api/me/availability', roles: VOLUNTEER, handler: updateMyAvailability },
  { method: 'GET', path: '/api/me/teams', roles: VOLUNTEER, handler: getMyTeams },
]

function match(path: string, pattern: string): Record<string, string> | null {
  const a = path.split('/')
  const b = pattern.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

/** Signing out deletes the workspace right away rather than waiting for it to expire. */
async function signOut(req: Request, db: () => Firestore, now: Date): Promise<Response> {
  const session = readSession(req, now)
  if (session) {
    await deleteWorkspace(db(), session.w).catch((error) => console.error('Could not delete workspace', error))
  }
  return json(204, null, { 'set-cookie': clearedSessionCookie() })
}

export interface ApiOptions {
  now?: Date
  db?: () => Firestore
}

export async function handleApi(req: Request, options: ApiOptions = {}): Promise<Response> {
  const now = options.now ?? new Date()
  const getDb = options.db ?? firestore
  try {
    assertSameOrigin(req)
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '')
    if (req.method === 'DELETE' && path === '/api/session') return await signOut(req, getDb, now)
    // Signed out is a normal state for the sign-in page, not an error: no cookie at all answers null.
    if (req.method === 'GET' && path === '/api/session' && !readCookie(req.headers.get('cookie'), COOKIE_NAME)) {
      return json(200, null)
    }

    const candidates = ROUTES.map((route) => ({ route, params: match(path, route.path) })).filter((c) => c.params)
    if (!candidates.length) throw new HttpError(404, 'not_found', 'No such API route.')
    const found = candidates.find((c) => c.route.method === req.method)
    if (!found) throw new HttpError(405, 'method_not_allowed', `${req.method} is not supported here.`)

    const db = getDb()
    const { session, meta, workspaceId } = await requireSession(req, db, now)
    if (!found.route.roles.includes(session.r)) {
      throw new HttpError(403, 'forbidden', 'Your role cannot do that. Switch roles from the menu to try it.')
    }
    return await found.route.handler({ req, url, db, workspaceId, session, meta, params: found.params!, now })
  } catch (error) {
    const response = errorResponse(error)
    if (error instanceof HttpError && error.status === 401) {
      response.headers.append('set-cookie', clearedSessionCookie())
    }
    return response
  }
}
