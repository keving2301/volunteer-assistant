// Calendar dates are plain YYYY-MM-DD strings. All arithmetic runs in UTC so a date never shifts with the time zone
// of the server or the browser; "today" is read from the local clock by the caller.

import type { Weekday } from './time'
import type { Semester } from './types'

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(date: Date): string {
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/** The local calendar date of a moment, as YYYY-MM-DD. */
export function localIsoDate(now: Date = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** The UTC calendar date of a moment (the server's "today"). */
export function utcIsoDate(now: Date = new Date()): string {
  return fromUtc(now)
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay()
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

export interface SchoolWeek {
  monday: string
  days: { day: Weekday; date: string }[]
}

/** The school week a date belongs to. A Saturday or Sunday looks ahead to the coming week. */
export function schoolWeek(iso: string): SchoolWeek {
  const dow = dayOfWeek(iso)
  const offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow
  const monday = addDays(iso, offset)
  return {
    monday,
    days: ([1, 2, 3, 4, 5] as Weekday[]).map((day) => ({ day, date: addDays(monday, day - 1) })),
  }
}

export type SemesterStatus = 'past' | 'current' | 'upcoming'

export function semesterStatus(semester: Pick<Semester, 'startDate' | 'endDate'>, today: string): SemesterStatus {
  if (today < semester.startDate) return 'upcoming'
  if (today > semester.endDate) return 'past'
  return 'current'
}

/** The semester in session on a date, else the next one to start, else the last one to end. */
export function pickSemester<T extends Pick<Semester, 'startDate' | 'endDate'>>(semesters: readonly T[], today: string): T | null {
  const current = semesters.find((s) => semesterStatus(s, today) === 'current')
  if (current) return current
  const upcoming = semesters.filter((s) => s.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (upcoming.length) return upcoming[0]
  const past = [...semesters].sort((a, b) => b.endDate.localeCompare(a.endDate))
  return past[0] ?? null
}

export function sortSemesters<T extends Pick<Semester, 'startDate'>>(semesters: readonly T[]): T[] {
  return [...semesters].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })

/** "Nov 2", or "Nov 2, 2026" with the year. */
export function formatDate(iso: string, withYear = false): string {
  const date = toUtc(iso)
  const base = `${monthShort.format(date)} ${date.getUTCDate()}`
  return withYear ? `${base}, ${date.getUTCFullYear()}` : base
}

/** "Monday, November 2". */
export function formatLongDate(iso: string): string {
  const date = toUtc(iso)
  return `${weekdayLong.format(date)}, ${monthLong.format(date)} ${date.getUTCDate()}`
}

/** "Nov 2 to 6, 2026", "Oct 30 to Nov 3, 2026" or "Dec 28, 2026 to Jan 1, 2027". */
export function formatDateRange(a: string, b: string): string {
  const da = toUtc(a)
  const db = toUtc(b)
  if (da.getUTCFullYear() !== db.getUTCFullYear()) return `${formatDate(a, true)} to ${formatDate(b, true)}`
  if (da.getUTCMonth() === db.getUTCMonth()) return `${formatDate(a)} to ${db.getUTCDate()}, ${db.getUTCFullYear()}`
  return `${formatDate(a)} to ${formatDate(b)}, ${db.getUTCFullYear()}`
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = isoDate(year, month, 1)
  const shift = (weekday - dayOfWeek(first) + 7) % 7
  return addDays(first, shift + (n - 1) * 7)
}

export interface Term {
  name: string
  startDate: string
  endDate: string
}

/** A university calendar: spring runs from the second Monday of January to the first Friday of May, fall from the
 * fourth Monday of August to the second Friday of December. The program does not run in summer. */
export function termsOfYear(year: number): Term[] {
  return [
    { name: `Spring ${year}`, startDate: nthWeekday(year, 1, 1, 2), endDate: nthWeekday(year, 5, 5, 1) },
    { name: `Fall ${year}`, startDate: nthWeekday(year, 8, 1, 4), endDate: nthWeekday(year, 12, 5, 2) },
  ]
}

/** The term in session on a date (or the next one, in a break), with the one before and the one after it. */
export function termsAround(today: string): { previous: Term; current: Term; next: Term } {
  const year = Number(today.slice(0, 4))
  const terms = [year - 1, year, year + 1].flatMap(termsOfYear)
  const index = terms.findIndex((t) => t.endDate >= today)
  return { previous: terms[index - 1], current: terms[index], next: terms[index + 1] }
}
