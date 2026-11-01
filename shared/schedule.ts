// The scheduling rules. The browser runs them for instant feedback while a coordinator builds a team, and the API
// runs the same functions inside a Firestore transaction before it saves one, so the two can never disagree.

import { covers, dayName, formatRange, overlaps, rangesOn } from './time'
import { fullName, shortName } from './types'
import type { School, Semester, SessionSlot, Team, Volunteer } from './types'

export interface Placement {
  school: School
  session: SessionSlot
}

export type Reason =
  | { kind: 'not_free'; message: string }
  | { kind: 'double_booked'; teamId: string; message: string }
  | { kind: 'travel'; teamId: string; message: string }

export interface ScheduleContext {
  /** Every school, to find the time and place of other teams. */
  schools: readonly School[]
  /** The teams of the semester being scheduled. */
  teams: readonly Team[]
  bufferMinutes: number
  /** The team being edited: its own members are not in conflict with it. */
  excludeTeamId?: string
}

export function findPlacement(schools: readonly School[], schoolId: string, sessionId: string): Placement | null {
  const school = schools.find((s) => s.id === schoolId)
  const session = school?.sessions.find((s) => s.id === sessionId)
  return school && session ? { school, session } : null
}

/** A volunteer must be free for the session plus the travel time on both sides. */
export function requiredWindow(session: Pick<SessionSlot, 'start' | 'end'>, bufferMinutes: number) {
  return { start: session.start - bufferMinutes, end: session.end + bufferMinutes }
}

export function availabilityReason(
  volunteer: Pick<Volunteer, 'availability'>,
  session: SessionSlot,
  bufferMinutes: number,
): Reason | null {
  const need = requiredWindow(session, bufferMinutes)
  if (covers(volunteer.availability, session.day, need.start, need.end)) return null
  const free = rangesOn(volunteer.availability, session.day)
  const day = dayName(session.day)
  if (free.length === 0) return { kind: 'not_free', message: `Not available on ${day}s` }
  const freeText = free.map((r) => formatRange(r.start, r.end)).join(' and ')
  const needText = formatRange(need.start, need.end)
  return {
    kind: 'not_free',
    message: bufferMinutes
      ? `Free ${freeText} on ${day}s, needs ${needText} with travel`
      : `Free ${freeText} on ${day}s, needs ${needText}`,
  }
}

/**
 * Teams the volunteer is already on that clash with the target session: the same time (double booked), or another
 * school too close before or after to travel between them. Two sessions at the same school need no travel time.
 */
export function conflictReasons(volunteerId: string, target: Placement, ctx: ScheduleContext): Reason[] {
  const reasons: Reason[] = []
  for (const team of ctx.teams) {
    if (team.id === ctx.excludeTeamId || !team.memberIds.includes(volunteerId)) continue
    const other = findPlacement(ctx.schools, team.schoolId, team.sessionId)
    if (!other || other.session.day !== target.session.day) continue
    const a = target.session
    const b = other.session
    const when = `${dayName(b.day)} ${formatRange(b.start, b.end)}`
    if (overlaps(a.start, a.end, b.start, b.end)) {
      reasons.push({ kind: 'double_booked', teamId: team.id, message: `On the ${other.school.name} team, ${when}` })
    } else if (other.school.id !== target.school.id && overlaps(a.start, a.end, b.start, b.end, ctx.bufferMinutes)) {
      reasons.push({
        kind: 'travel',
        teamId: team.id,
        message: `Teaches at ${other.school.name} ${when}, less than ${ctx.bufferMinutes} min to travel between`,
      })
    }
  }
  return reasons
}

export function volunteerReasons(volunteer: Volunteer, target: Placement, ctx: ScheduleContext): Reason[] {
  const reasons: Reason[] = []
  const notFree = availabilityReason(volunteer, target.session, ctx.bufferMinutes)
  if (notFree) reasons.push(notFree)
  reasons.push(...conflictReasons(volunteer.id, target, ctx))
  return reasons
}

export interface Candidate {
  volunteer: Volunteer
  /** Teams this volunteer is already on this semester, not counting the one being edited. */
  teamCount: number
  reasons: Reason[]
}

const byName = (a: Volunteer, b: Volunteer) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)

/** How close an unavailable volunteer is to fitting: a clash with another team first, then some free time that day,
 * then no time that day at all. */
function closeness(reasons: readonly Reason[]): number {
  if (reasons.some((r) => r.kind === 'travel' || r.kind === 'double_booked')) return 0
  if (reasons.some((r) => r.kind === 'not_free' && r.message.startsWith('Free '))) return 1
  return 2
}

/**
 * Splits volunteers into those who can take the session and those who cannot (with the reasons). Available
 * volunteers with the fewest teams come first, so the work is spread across the group; unavailable ones are listed
 * from the closest to fitting, so a coordinator sees first whom a small change would free up.
 */
export function rankCandidates(volunteers: readonly Volunteer[], target: Placement, ctx: ScheduleContext) {
  const available: Candidate[] = []
  const unavailable: Candidate[] = []
  for (const volunteer of volunteers) {
    const teamCount = ctx.teams.filter((t) => t.id !== ctx.excludeTeamId && t.memberIds.includes(volunteer.id)).length
    const reasons = volunteerReasons(volunteer, target, ctx)
    ;(reasons.length ? unavailable : available).push({ volunteer, teamCount, reasons })
  }
  available.sort((a, b) => a.teamCount - b.teamCount || byName(a.volunteer, b.volunteer))
  unavailable.sort((a, b) => closeness(a.reasons) - closeness(b.reasons) || byName(a.volunteer, b.volunteer))
  return { available, unavailable }
}

export type TeamIssueCode =
  | 'school_not_found'
  | 'session_not_found'
  | 'session_taken'
  | 'too_few'
  | 'too_many'
  | 'duplicate_member'
  | 'member_not_found'
  | 'member_unavailable'
  | 'member_conflict'

export interface TeamIssue {
  code: TeamIssueCode
  message: string
  memberId?: string
}

export interface TeamDraft {
  schoolId: string
  sessionId: string
  memberIds: readonly string[]
}

export interface TeamRulesContext {
  semester: Pick<Semester, 'minTeamSize' | 'maxTeamSize' | 'travelBufferMinutes'>
  schools: readonly School[]
  volunteers: readonly Volunteer[]
  /** Every team of the semester, including the one being edited. */
  teams: readonly Team[]
  /** Set when editing an existing team. */
  teamId?: string
}

export function teamSizeText(min: number, max: number): string {
  return min === max ? `${min} volunteers` : `${min} to ${max} volunteers`
}

/** Every rule a team must meet before it is saved. An empty list means the team is valid. */
export function validateTeam(draft: TeamDraft, ctx: TeamRulesContext): TeamIssue[] {
  const issues: TeamIssue[] = []
  const school = ctx.schools.find((s) => s.id === draft.schoolId)
  if (!school) return [{ code: 'school_not_found', message: 'Choose a school.' }]
  const session = school.sessions.find((s) => s.id === draft.sessionId)
  if (!session) return [{ code: 'session_not_found', message: `Choose one of ${school.name}'s session times.` }]
  const target = { school, session }

  const taken = ctx.teams.find(
    (t) => t.id !== ctx.teamId && t.schoolId === draft.schoolId && t.sessionId === draft.sessionId,
  )
  if (taken) {
    issues.push({
      code: 'session_taken',
      message: `${school.name} already has a team on ${dayName(session.day)} ${formatRange(session.start, session.end)} this semester.`,
    })
  }

  const seen = new Set<string>()
  const scheduleCtx: ScheduleContext = {
    schools: ctx.schools,
    teams: ctx.teams,
    bufferMinutes: ctx.semester.travelBufferMinutes,
    excludeTeamId: ctx.teamId,
  }
  for (const id of draft.memberIds) {
    if (seen.has(id)) {
      issues.push({ code: 'duplicate_member', memberId: id, message: 'A volunteer is listed twice.' })
      continue
    }
    seen.add(id)
    const volunteer = ctx.volunteers.find((v) => v.id === id)
    if (!volunteer) {
      issues.push({ code: 'member_not_found', memberId: id, message: 'A selected volunteer no longer exists.' })
      continue
    }
    for (const reason of volunteerReasons(volunteer, target, scheduleCtx)) {
      issues.push({
        code: reason.kind === 'not_free' ? 'member_unavailable' : 'member_conflict',
        memberId: id,
        message: `${fullName(volunteer)}: ${reason.message}.`,
      })
    }
  }

  const size = seen.size
  const { minTeamSize: min, maxTeamSize: max } = ctx.semester
  if (size < min) {
    const missing = min - size
    issues.push({
      code: 'too_few',
      message: `A team needs ${teamSizeText(min, max)}. Add ${missing} more.`,
    })
  } else if (size > max) {
    issues.push({ code: 'too_many', message: `A team needs ${teamSizeText(min, max)}. Remove ${size - max}.` })
  }
  return issues
}

export type SessionFlag =
  | { kind: 'no_team'; message: string }
  | { kind: 'short'; message: string }
  | { kind: 'over'; message: string }
  | { kind: 'member_unavailable'; memberId: string; message: string }
  | { kind: 'member_conflict'; memberId: string; message: string }

export interface SessionStatus {
  school: School
  session: SessionSlot
  team: Team | null
  members: Volunteer[]
  flags: SessionFlag[]
}

/**
 * Every weekly session of every school for one semester, with its team and what needs a coordinator's attention:
 * no team, too few or too many members, or a member who is no longer free (their availability changed) or now
 * clashes with another team (the travel time changed).
 */
export function semesterBoard(ctx: {
  semester: Pick<Semester, 'minTeamSize' | 'maxTeamSize' | 'travelBufferMinutes'>
  schools: readonly School[]
  volunteers: readonly Volunteer[]
  teams: readonly Team[]
  /** Past semesters are history: no flags. */
  checkFlags?: boolean
}): SessionStatus[] {
  const check = ctx.checkFlags ?? true
  const rows: SessionStatus[] = []
  for (const school of ctx.schools) {
    for (const session of school.sessions) {
      const team = ctx.teams.find((t) => t.schoolId === school.id && t.sessionId === session.id) ?? null
      const members = team
        ? team.memberIds
            .map((id) => ctx.volunteers.find((v) => v.id === id))
            .filter((v): v is Volunteer => Boolean(v))
        : []
      const flags: SessionFlag[] = []
      if (check) {
        const { minTeamSize: min, maxTeamSize: max, travelBufferMinutes } = ctx.semester
        if (!team) {
          flags.push({ kind: 'no_team', message: 'No team yet' })
        } else {
          if (members.length < min) {
            const missing = min - members.length
            flags.push({ kind: 'short', message: `Needs ${missing} more volunteer${missing === 1 ? '' : 's'}` })
          } else if (members.length > max) {
            flags.push({ kind: 'over', message: `${members.length - max} over the team size` })
          }
          const scheduleCtx: ScheduleContext = {
            schools: ctx.schools,
            teams: ctx.teams,
            bufferMinutes: travelBufferMinutes,
            excludeTeamId: team.id,
          }
          for (const member of members) {
            const notFree = availabilityReason(member, session, travelBufferMinutes)
            if (notFree) {
              flags.push({
                kind: 'member_unavailable',
                memberId: member.id,
                message: `${shortName(member)} is no longer free for this time`,
              })
            }
            const clash = conflictReasons(member.id, { school, session }, scheduleCtx)[0]
            if (clash) {
              flags.push({ kind: 'member_conflict', memberId: member.id, message: `${shortName(member)}: ${clash.message}` })
            }
          }
        }
      }
      rows.push({ school, session, team, members, flags })
    }
  }
  return rows.sort(
    (a, b) =>
      a.session.day - b.session.day || a.session.start - b.session.start || a.school.name.localeCompare(b.school.name),
  )
}

/** The volunteer's teams in a semester, as placements, for availability warnings. */
export function placementsFor(volunteerId: string, teams: readonly Team[], schools: readonly School[]) {
  return teams
    .filter((t) => t.memberIds.includes(volunteerId))
    .map((team) => ({ team, placement: findPlacement(schools, team.schoolId, team.sessionId) }))
    .filter((x): x is { team: Team; placement: Placement } => Boolean(x.placement))
}
