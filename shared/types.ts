import type { TimeRange, Weekday } from './time'

export type Role = 'coordinator' | 'volunteer'

export const GRADE_BANDS = ['K-5', '6-8', '9-12'] as const
export type GradeBand = (typeof GRADE_BANDS)[number]

export const GRADE_BAND_LABELS: Record<GradeBand, string> = {
  'K-5': 'Elementary (K to 5)',
  '6-8': 'Middle (6 to 8)',
  '9-12': 'High (9 to 12)',
}

/** A weekly time a school hosts the program, for example every Tuesday 3:00 to 4:30 PM. */
export interface SessionSlot {
  id: string
  day: Weekday
  start: number
  end: number
}

export interface Address {
  street: string
  city: string
  state: string
  zip: string
}

export interface SchoolContact {
  name: string
  title: string
  email: string
  phone: string
}

export interface School {
  id: string
  name: string
  address: Address
  contact: SchoolContact
  gradeBands: GradeBand[]
  sessions: SessionSlot[]
  createdAt: string
  updatedAt: string
}

export interface Volunteer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  major: string
  gradYear: number
  availability: TimeRange[]
  createdAt: string
  updatedAt: string
}

export interface Semester {
  id: string
  name: string
  /** Inclusive dates, YYYY-MM-DD. */
  startDate: string
  endDate: string
  minTeamSize: number
  maxTeamSize: number
  /** Travel time each way between campus and a school, in minutes. */
  travelBufferMinutes: number
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  semesterId: string
  schoolId: string
  sessionId: string
  memberIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SessionInfo {
  role: Role
  name: string
  email: string
  /** The volunteer record of the signed-in volunteer. */
  volunteerId: string | null
  /** The volunteer who signs in with the demo volunteer account (kept, so it cannot be deleted). */
  demoVolunteerId: string
  workspace: { createdAt: string; expiresAt: string }
}

/** One team of the signed-in volunteer, with what they need to get there. */
export interface MyTeam {
  team: Team
  semester: Pick<Semester, 'id' | 'name' | 'startDate' | 'endDate' | 'travelBufferMinutes'>
  school: Pick<School, 'id' | 'name' | 'address' | 'contact' | 'gradeBands'>
  session: SessionSlot
  teammates: { id: string; name: string }[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    /** Field path to message, for form errors. */
    fields?: Record<string, string>
    /** Scheduling problems found by the server, same shape as the client's own checks. */
    issues?: { code: string; message: string; memberId?: string }[]
  }
}

export function fullName(v: Pick<Volunteer, 'firstName' | 'lastName'>): string {
  return `${v.firstName} ${v.lastName}`
}

/** "Priya R." for tight spaces. */
export function shortName(v: Pick<Volunteer, 'firstName' | 'lastName'>): string {
  return `${v.firstName} ${v.lastName.charAt(0)}.`
}

export function initials(v: Pick<Volunteer, 'firstName' | 'lastName'>): string {
  return `${v.firstName.charAt(0)}${v.lastName.charAt(0)}`.toUpperCase()
}

/** "Harbor Point K-8 Center" -> "Harbor Point", for labels with little room. */
export function shortSchoolName(name: string): string {
  return name.replace(/\s+(Elementary School|Middle School|High School|K-8 Center|Academy|School)$/i, '') || name
}
