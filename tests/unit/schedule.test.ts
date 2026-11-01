import { describe, expect, it } from 'vitest'
import {
  availabilityReason,
  conflictReasons,
  rankCandidates,
  requiredWindow,
  semesterBoard,
  validateTeam,
  type ScheduleContext,
} from '../../shared/schedule'
import type { TimeRange } from '../../shared/time'
import type { School, Semester, Team, Volunteer } from '../../shared/types'

const STAMP = '2026-08-01T00:00:00.000Z'

function school(id: string, name: string, sessions: School['sessions']): School {
  return {
    id,
    name,
    address: { street: '1 Main Street', city: 'Bayview', state: 'MD', zip: '21219' },
    contact: { name: 'Pat Doe', title: 'Teacher', email: 'pat.doe@example.com', phone: '(410) 555-0100' },
    gradeBands: ['K-5'],
    sessions,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

function volunteer(id: string, availability: TimeRange[], name = id): Volunteer {
  return {
    id,
    firstName: name,
    lastName: 'Tester',
    email: `${id}@example.com`,
    phone: '(410) 555-0101',
    major: 'Computer Science',
    gradYear: 2027,
    availability,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

function team(id: string, schoolId: string, sessionId: string, memberIds: string[]): Team {
  return { id, semesterId: 'fall', schoolId, sessionId, memberIds, notes: '', createdAt: STAMP, updatedAt: STAMP }
}

const semester: Semester = {
  id: 'fall',
  name: 'Fall 2026',
  startDate: '2026-08-24',
  endDate: '2026-12-11',
  minTeamSize: 2,
  maxTeamSize: 3,
  travelBufferMinutes: 30,
  createdAt: STAMP,
  updatedAt: STAMP,
}

// Tuesday 3:00 to 4:30 PM at Lakeside; Tuesday 1:30 to 2:30 PM at Cedar Grove; Tuesday 4:30 to 5:30 PM at Lakeside.
const lakeside = school('lakeside', 'Lakeside Middle School', [
  { id: 'tue', day: 2, start: 900, end: 990 },
  { id: 'tue-late', day: 2, start: 990, end: 1050 },
])
const cedar = school('cedar', 'Cedar Grove Elementary School', [{ id: 'tue', day: 2, start: 810, end: 870 }])
const harbor = school('harbor', 'Harbor Point K-8 Center', [{ id: 'tue', day: 2, start: 870, end: 930 }])
const schools = [lakeside, cedar, harbor]
const lakesideTuesday = { school: lakeside, session: lakeside.sessions[0] }

describe('availability with the travel buffer', () => {
  it('needs the session plus the buffer on both sides', () => {
    expect(requiredWindow({ start: 900, end: 990 }, 30)).toEqual({ start: 870, end: 1020 })
  })

  it('accepts a volunteer free exactly for the session and the travel time', () => {
    const v = volunteer('a', [{ day: 2, start: 870, end: 1020 }])
    expect(availabilityReason(v, lakesideTuesday.session, 30)).toBeNull()
  })

  it('rejects a volunteer free for the session but not the trip back', () => {
    const v = volunteer('a', [{ day: 2, start: 870, end: 1000 }])
    const reason = availabilityReason(v, lakesideTuesday.session, 30)
    expect(reason?.kind).toBe('not_free')
    expect(reason?.message).toBe('Free 2:30 to 4:40 PM on Tuesdays, needs 2:30 to 5:00 PM with travel')
  })

  it('accepts the same volunteer when the buffer is zero', () => {
    const v = volunteer('a', [{ day: 2, start: 900, end: 990 }])
    expect(availabilityReason(v, lakesideTuesday.session, 0)).toBeNull()
  })

  it('merges touching ranges before checking', () => {
    const v = volunteer('a', [
      { day: 2, start: 870, end: 930 },
      { day: 2, start: 930, end: 1020 },
    ])
    expect(availabilityReason(v, lakesideTuesday.session, 30)).toBeNull()
  })

  it('says when the volunteer has no time that day', () => {
    const v = volunteer('a', [{ day: 3, start: 780, end: 1080 }])
    expect(availabilityReason(v, lakesideTuesday.session, 30)?.message).toBe('Not available on Tuesdays')
  })
})

describe('double booking', () => {
  const ctx = (teams: Team[], excludeTeamId?: string): ScheduleContext => ({
    schools,
    teams,
    bufferMinutes: 30,
    excludeTeamId,
  })

  it('refuses a volunteer on another team at an overlapping time', () => {
    const reasons = conflictReasons('a', lakesideTuesday, ctx([team('t1', 'harbor', 'tue', ['a'])]))
    expect(reasons).toHaveLength(1)
    expect(reasons[0].kind).toBe('double_booked')
    expect(reasons[0].message).toBe('On the Harbor Point K-8 Center team, Tuesday 2:30 to 3:30 PM')
  })

  it('refuses back to back sessions at different schools without travel time', () => {
    // Cedar Grove ends at 2:30, Lakeside starts at 3:00: 30 minutes apart is exactly the buffer, so it is allowed.
    expect(conflictReasons('a', lakesideTuesday, ctx([team('t1', 'cedar', 'tue', ['a'])]))).toEqual([])
    const tight = { ...ctx([team('t1', 'cedar', 'tue', ['a'])]), bufferMinutes: 45 }
    const reasons = conflictReasons('a', lakesideTuesday, tight)
    expect(reasons.map((r) => r.kind)).toEqual(['travel'])
  })

  it('needs no travel time between two sessions at the same school', () => {
    const late = { school: lakeside, session: lakeside.sessions[1] }
    expect(conflictReasons('a', late, ctx([team('t1', 'lakeside', 'tue', ['a'])]))).toEqual([])
  })

  it('ignores the team being edited', () => {
    expect(conflictReasons('a', lakesideTuesday, ctx([team('t1', 'lakeside', 'tue', ['a'])], 't1'))).toEqual([])
  })

  it('ignores teams on other days and teams the volunteer is not on', () => {
    const monday = school('mon', 'Monday School', [{ id: 'mon', day: 1, start: 900, end: 990 }])
    const c: ScheduleContext = {
      schools: [...schools, monday],
      teams: [team('t1', 'mon', 'mon', ['a']), team('t2', 'harbor', 'tue', ['b'])],
      bufferMinutes: 30,
    }
    expect(conflictReasons('a', lakesideTuesday, c)).toEqual([])
  })
})

describe('ranking candidates', () => {
  it('lists free volunteers with the fewest teams first and explains the rest', () => {
    const free = [{ day: 2 as const, start: 780, end: 1080 }]
    const volunteers = [volunteer('busy', free, 'Busy'), volunteer('idle', free, 'Idle'), volunteer('away', [], 'Away')]
    const result = rankCandidates(volunteers, lakesideTuesday, {
      schools,
      teams: [team('t1', 'cedar', 'tue', ['busy'])],
      bufferMinutes: 30,
    })
    expect(result.available.map((c) => c.volunteer.id)).toEqual(['idle', 'busy'])
    expect(result.available[1].teamCount).toBe(1)
    expect(result.unavailable.map((c) => c.volunteer.id)).toEqual(['away'])
    expect(result.unavailable[0].reasons[0].kind).toBe('not_free')
  })

  it('lists the unavailable closest to fitting first: clashes, then partly free, then not free that day', () => {
    const volunteers = [
      volunteer('away', [], 'Ann'),
      volunteer('partly', [{ day: 2, start: 960, end: 1080 }], 'Bea'),
      volunteer('clash', [{ day: 2, start: 780, end: 1080 }], 'Cy'),
    ]
    const result = rankCandidates(volunteers, lakesideTuesday, {
      schools,
      teams: [team('t1', 'harbor', 'tue', ['clash'])],
      bufferMinutes: 30,
    })
    expect(result.unavailable.map((c) => c.volunteer.id)).toEqual(['clash', 'partly', 'away'])
  })
})

describe('team rules', () => {
  const free = [{ day: 2 as const, start: 780, end: 1080 }]
  const volunteers = ['a', 'b', 'c', 'd'].map((id) => volunteer(id, free))
  const base = { semester, schools, volunteers, teams: [] as Team[] }

  it('accepts a team within the size limits whose members are free', () => {
    expect(validateTeam({ schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'b'] }, base)).toEqual([])
  })

  it('enforces the minimum and maximum team size', () => {
    const tooFew = validateTeam({ schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a'] }, base)
    expect(tooFew.map((i) => i.code)).toEqual(['too_few'])
    expect(tooFew[0].message).toBe('A team needs 2 to 3 volunteers. Add 1 more.')
    const tooMany = validateTeam({ schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'b', 'c', 'd'] }, base)
    expect(tooMany.map((i) => i.code)).toEqual(['too_many'])
  })

  it('counts a duplicated member once', () => {
    const issues = validateTeam({ schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'a'] }, base)
    expect(issues.map((i) => i.code)).toEqual(['duplicate_member', 'too_few'])
  })

  it('refuses a member who is double booked, naming the other team', () => {
    const issues = validateTeam(
      { schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'b'] },
      { ...base, teams: [team('t1', 'harbor', 'tue', ['a', 'c'])] },
    )
    expect(issues).toEqual([
      {
        code: 'member_conflict',
        memberId: 'a',
        message: 'a Tester: On the Harbor Point K-8 Center team, Tuesday 2:30 to 3:30 PM.',
      },
    ])
  })

  it('refuses a member who is not free for the session', () => {
    const issues = validateTeam(
      { schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'late'] },
      { ...base, volunteers: [...volunteers, volunteer('late', [{ day: 2, start: 960, end: 1080 }])] },
    )
    expect(issues.map((i) => [i.code, i.memberId])).toEqual([['member_unavailable', 'late']])
  })

  it('allows one team per session per semester, but lets a team keep its own session when edited', () => {
    const existing = team('t1', 'lakeside', 'tue', ['c', 'd'])
    const ctx = { ...base, teams: [existing] }
    const draft = { schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'b'] }
    expect(validateTeam(draft, ctx).map((i) => i.code)).toEqual(['session_taken'])
    expect(validateTeam(draft, { ...ctx, teamId: 't1' })).toEqual([])
  })

  it('refuses an unknown school, session or volunteer', () => {
    expect(validateTeam({ schoolId: 'x', sessionId: 'tue', memberIds: [] }, base)[0].code).toBe('school_not_found')
    expect(validateTeam({ schoolId: 'lakeside', sessionId: 'x', memberIds: [] }, base)[0].code).toBe('session_not_found')
    const ghost = validateTeam({ schoolId: 'lakeside', sessionId: 'tue', memberIds: ['a', 'b', 'ghost'] }, base)
    expect(ghost.map((i) => i.code)).toEqual(['member_not_found'])
  })
})

describe('the semester board', () => {
  it('flags sessions without a team, short teams and members no longer free', () => {
    const free = [{ day: 2 as const, start: 780, end: 1080 }]
    const volunteers = [volunteer('a', free), volunteer('b', free), volunteer('gone', [{ day: 2, start: 780, end: 960 }])]
    const rows = semesterBoard({
      semester,
      schools,
      volunteers,
      teams: [team('t1', 'lakeside', 'tue', ['a', 'gone']), team('t2', 'cedar', 'tue', ['b'])],
    })
    const flags = Object.fromEntries(rows.map((r) => [`${r.school.id}:${r.session.id}`, r.flags.map((f) => f.kind)]))
    expect(flags).toEqual({
      'cedar:tue': ['short'],
      'harbor:tue': ['no_team'],
      'lakeside:tue': ['member_unavailable'],
      'lakeside:tue-late': ['no_team'],
    })
    // Sorted by day and start time.
    expect(rows.map((r) => r.session.start)).toEqual([810, 870, 900, 990])
  })

  it('shows no flags for a past semester', () => {
    const rows = semesterBoard({ semester, schools, volunteers: [], teams: [], checkFlags: false })
    expect(rows.every((r) => r.flags.length === 0)).toBe(true)
  })
})
