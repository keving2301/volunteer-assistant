// The demo data every new workspace starts from: a program with seven schools, 32 volunteers and their weekly
// availability, last semester's teams, this semester's teams with three realistic gaps for the dashboard to flag, and
// an empty next semester. Dates follow the day the workspace is created, so the demo never goes stale.
//
// Everyone and everything here is invented. Emails use example.com and phone numbers the 555-0100 to 555-0199 range.

import { addDays, termsAround, type Term } from '../../shared/calendar'
import { findPlacement, volunteerReasons, type ScheduleContext } from '../../shared/schedule'
import { parseClock, type TimeRange, type Weekday } from '../../shared/time'
import type { GradeBand, School, Semester, SessionSlot, Team, Volunteer } from '../../shared/types'

export interface DemoWorkspace {
  coordinator: { name: string; email: string }
  demoVolunteerId: string
  semesters: Semester[]
  schools: School[]
  volunteers: Volunteer[]
  teams: Team[]
  /** The semester in session (or the next one, in a break): the one the dashboard opens on. */
  currentSemesterId: string
}

const DAYS: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 }

/** "Mon 12:00-16:00; Wed 13:30-17:30" as ranges. */
function times(spec: string): TimeRange[] {
  return spec.split(';').map((part) => {
    const [day, span] = part.trim().split(' ')
    const [from, to] = span.split('-')
    return { day: DAYS[day], start: parseClock(from)!, end: parseClock(to)! }
  })
}

interface SchoolSeed {
  key: string
  name: string
  street: string
  city: string
  zip: string
  grades: GradeBand[]
  contact: [name: string, title: string, email: string, phone: string]
  sessions: string
  /** Joined this semester (created after it started). */
  isNew?: boolean
}

const SCHOOLS: SchoolSeed[] = [
  {
    key: 'ridgeview',
    name: 'Ridgeview Elementary School',
    street: '2150 Ridgeview Road',
    city: 'Bayview',
    zip: '21219',
    grades: ['K-5'],
    contact: ['Teresa Holt', 'STEM coordinator', 'teresa.holt@example.com', '(410) 555-0111'],
    sessions: 'Mon 14:30-15:30; Wed 14:30-15:30',
  },
  {
    key: 'lakeside',
    name: 'Lakeside Middle School',
    street: '880 Shoreline Drive',
    city: 'Bayview',
    zip: '21219',
    grades: ['6-8'],
    contact: ['Marcus Bell', 'Assistant principal', 'marcus.bell@example.com', '(410) 555-0114'],
    sessions: 'Tue 15:00-16:30; Thu 15:00-16:30',
  },
  {
    key: 'harbor',
    name: 'Harbor Point K-8 Center',
    street: '41 Harbor Point Way',
    city: 'Northgate',
    zip: '21222',
    grades: ['K-5', '6-8'],
    contact: ['Gloria Adams', 'Media specialist', 'gloria.adams@example.com', '(410) 555-0117'],
    sessions: 'Mon 15:00-16:00; Thu 14:00-15:00',
  },
  {
    key: 'cedar',
    name: 'Cedar Grove Elementary School',
    street: '1207 Cedar Grove Lane',
    city: 'Elm Park',
    zip: '21234',
    grades: ['K-5'],
    contact: ['Paul Whitman', 'Fourth grade teacher', 'paul.whitman@example.com', '(410) 555-0120'],
    sessions: 'Tue 14:15-15:15; Fri 13:30-14:30',
  },
  {
    key: 'westbrook',
    name: 'Westbrook High School',
    street: '3600 Westbrook Avenue',
    city: 'Northgate',
    zip: '21222',
    grades: ['9-12'],
    contact: ['Renee Dawson', 'Computer science teacher', 'renee.dawson@example.com', '(410) 555-0123'],
    sessions: 'Wed 15:30-17:00; Fri 14:30-16:00',
  },
  {
    key: 'brightwater',
    name: 'Brightwater Academy',
    street: '77 Brightwater Court',
    city: 'Elm Park',
    zip: '21234',
    grades: ['6-8', '9-12'],
    contact: ['Victor Lang', 'After school director', 'victor.lang@example.com', '(410) 555-0126'],
    sessions: 'Mon 16:00-17:30; Tue 16:00-17:30',
  },
  {
    key: 'maple',
    name: 'Maple Hollow Elementary School',
    street: '512 Maple Hollow Road',
    city: 'Bayview',
    zip: '21219',
    grades: ['K-5'],
    contact: ['Irene Foster', 'Principal', 'irene.foster@example.com', '(410) 555-0129'],
    sessions: 'Thu 14:30-15:30',
    isNew: true,
  },
]

type VolunteerSeed = [first: string, last: string, major: string, gradYear: number, availability: string]

const DEMO_VOLUNTEER: VolunteerSeed = [
  'Jordan',
  'Ellis',
  'Computer Science',
  2027,
  'Mon 12:00-14:00; Tue 14:00-18:00; Wed 13:30-16:30; Fri 13:00-15:30',
]

const VOLUNTEERS: VolunteerSeed[] = [
  ['Priya', 'Raman', 'Computer Science', 2027, 'Mon 13:30-17:30; Wed 13:30-17:30; Fri 12:00-16:00'],
  ['Mateo', 'Alvarez', 'Computer Engineering', 2028, 'Tue 12:30-17:00; Thu 12:30-17:00'],
  ['Aisha', 'Bello', 'Information Technology', 2027, 'Mon 14:00-18:00; Tue 14:00-18:00; Thu 14:00-18:00'],
  ['Liam', "O'Connor", 'Mathematics', 2028, 'Wed 14:00-18:00; Fri 13:30-17:30'],
  ['Sofia', 'Marchetti', 'Computer Science', 2029, 'Mon 12:00-16:00; Thu 12:00-16:00'],
  ['Daniel', 'Kim', 'Data Science', 2027, 'Tue 13:30-17:30; Wed 15:00-18:30'],
  ['Grace', 'Okafor', 'Computer Science', 2028, 'Mon 15:00-18:30; Tue 15:00-18:30'],
  ['Ethan', 'Brooks', 'Cybersecurity', 2027, 'Thu 13:30-17:30; Fri 12:30-17:00'],
  ['Hannah', 'Weiss', 'Computer Science', 2029, 'Mon 12:30-17:00; Wed 12:30-17:00'],
  ['Marcus', 'Reed', 'Information Technology', 2028, 'Tue 12:00-16:00; Fri 12:00-16:00'],
  ['Yuki', 'Tanaka', 'Computer Engineering', 2027, 'Wed 13:30-17:30; Thu 14:00-18:00'],
  ['Camila', 'Duarte', 'Computer Science', 2028, 'Mon 14:00-18:00; Thu 12:30-17:00'],
  ['Noah', 'Fischer', 'Mathematics', 2027, 'Tue 14:00-18:00; Fri 13:30-17:30'],
  ['Leila', 'Haddad', 'Data Science', 2029, 'Mon 13:30-17:30; Tue 12:30-17:00'],
  ['Owen', 'Gallagher', 'Computer Science', 2028, 'Wed 14:00-18:00; Fri 12:00-16:00'],
  ['Mei', 'Zhou', 'Computer Science', 2027, 'Thu 13:30-17:30; Fri 13:30-17:30'],
  ['Isaac', 'Mendez', 'Information Technology', 2029, 'Mon 15:00-18:30; Wed 15:00-18:30'],
  ['Chloe', 'Dubois', 'Computer Engineering', 2028, 'Tue 12:00-16:00; Thu 12:00-16:00'],
  ['Ravi', 'Patel', 'Computer Science', 2027, 'Mon 13:30-17:30; Thu 14:00-18:00'],
  ['Natalia', 'Petrova', 'Mathematics', 2028, 'Wed 12:30-17:00; Fri 12:30-17:00'],
  ['Samuel', 'Adeyemi', 'Cybersecurity', 2029, 'Tue 15:00-18:30; Wed 14:00-18:00'],
  ['Ava', 'Lindqvist', 'Computer Science', 2028, 'Mon 12:00-16:00; Wed 12:00-16:00'],
  ['Diego', 'Herrera', 'Computer Science', 2027, 'Thu 12:30-17:00; Fri 12:30-17:00'],
  ['Zara', 'Khan', 'Data Science', 2028, 'Mon 14:00-18:00; Tue 13:30-17:30'],
  ['Lucas', 'Moreau', 'Computer Engineering', 2029, 'Wed 13:30-17:30; Thu 13:30-17:30'],
  ['Imani', 'Carter', 'Information Technology', 2027, 'Tue 14:00-18:00; Thu 15:00-18:30'],
  ['Tomas', 'Novak', 'Computer Science', 2028, 'Mon 12:30-17:00; Fri 13:30-17:30'],
  ['Elena', 'Vasquez', 'Mathematics', 2027, 'Wed 14:00-18:00; Thu 12:00-16:00'],
  ['Kenji', 'Mori', 'Computer Science', 2029, 'Tue 12:30-17:00; Wed 12:30-17:00'],
  ['Fatima', 'Rahman', 'Computer Science', 2028, 'Mon 15:00-18:30; Thu 13:30-17:30'],
  ['Ben', 'Hartley', 'Information Technology', 2028, 'Tue 13:30-17:30; Fri 14:00-18:00'],
]

/** Team sizes this semester, by school key and session index. Maple Hollow's Thursday has no team yet (gap one), and
 * Cedar Grove's Friday team is down to one volunteer (gap two). */
const CURRENT_SIZES: Record<string, number[]> = {
  ridgeview: [3, 3],
  lakeside: [4, 3],
  harbor: [3, 3],
  cedar: [3, 1],
  westbrook: [4, 3],
  brightwater: [4, 3],
  maple: [0],
}

const NOTES: Record<string, string> = {
  'lakeside:0': 'Room 114 (computer lab). Sign in at the front office with your student ID.',
  'westbrook:0': 'Intro to Python club. Laptops are provided by the school.',
  'brightwater:0': 'Park in the visitor lot on Brightwater Court.',
  'ridgeview:1': 'Scratch projects with the fourth and fifth graders in the library.',
}

const phone = (n: number) => `(410) 555-01${String(n).padStart(2, '0')}`

function emailOf(first: string, last: string): string {
  return `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com'
}

/** A fixed shuffle (mulberry32), so every workspace gets the same teams and the screenshots stay reproducible. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let a = seed
  const random = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function semesterOf(id: string, term: Term, createdAt: string): Semester {
  return {
    id,
    name: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
    minTeamSize: 2,
    maxTeamSize: 4,
    travelBufferMinutes: 30,
    createdAt,
    updatedAt: createdAt,
  }
}

/**
 * Builds one semester's teams greedily: sessions in weekly order, each filled from the volunteers who are free for it
 * (with travel time) and not on a clashing team, those with the fewest teams first, at most two teams each.
 */
function staffSemester(args: {
  semester: Semester
  schools: School[]
  schoolKeys: Map<string, string>
  volunteers: Volunteer[]
  sizes: (key: string, index: number) => number
  preassigned: { key: string; index: number; volunteerId: string }[]
  shuffleSeed: number
  newId: () => string
  createdAt: string
}): Team[] {
  const teams: Team[] = []
  const order = new Map(shuffled(args.volunteers, args.shuffleSeed).map((v, i) => [v.id, i]))
  const slots = args.schools
    .flatMap((school) => school.sessions.map((session, index) => ({ school, session, index })))
    .sort((a, b) => a.session.day - b.session.day || a.session.start - b.session.start)
  for (const { school, session, index } of slots) {
    const key = args.schoolKeys.get(school.id)!
    const size = args.sizes(key, index)
    if (size === 0) continue
    const memberIds = args.preassigned
      .filter((p) => p.key === key && p.index === index)
      .map((p) => p.volunteerId)
    const ctx: ScheduleContext = {
      schools: args.schools,
      teams,
      bufferMinutes: args.semester.travelBufferMinutes,
    }
    const target = findPlacement(args.schools, school.id, session.id)!
    const load = (id: string) =>
      teams.filter((t) => t.memberIds.includes(id)).length +
      args.preassigned.filter((p) => p.volunteerId === id && !memberIds.includes(id)).length
    const candidates = args.volunteers
      .filter((v) => !memberIds.includes(v.id) && load(v.id) < 2)
      .filter((v) => !args.preassigned.some((p) => p.volunteerId === v.id))
      .filter((v) => volunteerReasons(v, target, ctx).length === 0)
      .sort((a, b) => load(a.id) - load(b.id) || order.get(a.id)! - order.get(b.id)!)
    for (const v of candidates) {
      if (memberIds.length >= size) break
      memberIds.push(v.id)
    }
    teams.push({
      id: args.newId(),
      semesterId: args.semester.id,
      schoolId: school.id,
      sessionId: session.id,
      memberIds,
      notes: NOTES[`${key}:${index}`] ?? '',
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    })
  }
  return teams
}

const at = (date: string, time = '14:00:00') => `${date}T${time}.000Z`

export function buildDemoWorkspace(today: string, newId: () => string): DemoWorkspace {
  const terms = termsAround(today)
  const previous = semesterOf(newId(), terms.previous, at(addDays(terms.previous.startDate, -30)))
  const current = semesterOf(newId(), terms.current, at(addDays(terms.current.startDate, -30)))
  const next = semesterOf(newId(), terms.next, at(addDays(today, -6)))

  const schoolKeys = new Map<string, string>()
  const schools: School[] = SCHOOLS.map((s) => {
    const id = newId()
    schoolKeys.set(id, s.key)
    const created = s.isNew ? at(addDays(terms.current.startDate, 12)) : at(addDays(terms.previous.startDate, -40))
    const sessions: SessionSlot[] = times(s.sessions).map((r) => ({ id: newId(), ...r }))
    return {
      id,
      name: s.name,
      address: { street: s.street, city: s.city, state: 'MD', zip: s.zip },
      contact: { name: s.contact[0], title: s.contact[1], email: s.contact[2], phone: s.contact[3] },
      gradeBands: s.grades,
      sessions,
      createdAt: created,
      updatedAt: created,
    }
  })

  const volunteerCreated = at(addDays(terms.previous.startDate, -20))
  const toVolunteer = ([first, last, major, gradYear, spec]: VolunteerSeed, n: number, email?: string): Volunteer => ({
    id: newId(),
    firstName: first,
    lastName: last,
    email: email ?? emailOf(first, last),
    phone: phone(n),
    major,
    gradYear,
    availability: times(spec),
    createdAt: volunteerCreated,
    updatedAt: volunteerCreated,
  })
  const demoVolunteer = toVolunteer(DEMO_VOLUNTEER, 30, 'demo.volunteer@example.com')
  const volunteers = [demoVolunteer, ...VOLUNTEERS.map((v, i) => toVolunteer(v, 31 + i))]

  const previousTeams = staffSemester({
    semester: previous,
    schools,
    schoolKeys,
    volunteers,
    sizes: () => 3,
    preassigned: [],
    shuffleSeed: 7,
    newId,
    createdAt: at(addDays(terms.previous.startDate, -7)),
  })

  const currentTeams = staffSemester({
    semester: current,
    schools,
    schoolKeys,
    volunteers,
    sizes: (key, index) => CURRENT_SIZES[key]?.[index] ?? 3,
    preassigned: [
      { key: 'lakeside', index: 0, volunteerId: demoVolunteer.id },
      { key: 'ridgeview', index: 1, volunteerId: demoVolunteer.id },
    ],
    shuffleSeed: 2026,
    newId,
    createdAt: at(addDays(terms.current.startDate, -7)),
  })

  // Gap three: a Westbrook Wednesday volunteer changed their availability after the team was built and now has to
  // leave at 5:00 PM, before the session and the trip back are over.
  const westbrook = schools.find((s) => schoolKeys.get(s.id) === 'westbrook')!
  const wednesday = currentTeams.find((t) => t.schoolId === westbrook.id && t.sessionId === westbrook.sessions[0].id)
  const changed = volunteers.find((v) => v.id === wednesday?.memberIds[wednesday.memberIds.length - 1])
  if (changed) {
    changed.availability = changed.availability.map((r) => (r.day === 3 ? { ...r, end: Math.min(r.end, 17 * 60) } : r))
    changed.updatedAt = at(addDays(today, -3), '18:20:00')
  }

  return {
    coordinator: { name: 'Dana Prescott', email: 'demo.coordinator@example.com' },
    demoVolunteerId: demoVolunteer.id,
    semesters: [previous, current, next],
    schools,
    volunteers,
    teams: [...previousTeams, ...currentTeams],
    currentSemesterId: current.id,
  }
}
