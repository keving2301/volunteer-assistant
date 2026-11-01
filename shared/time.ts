// Times are stored as minutes after midnight (14:30 is 870) and days as 1 (Monday) to 5 (Friday).
// Sessions run on school days only, so the week here is Monday to Friday.

export type Weekday = 1 | 2 | 3 | 4 | 5

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5]

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

export interface TimeRange {
  day: Weekday
  start: number
  end: number
}

export function dayName(day: Weekday): string {
  return DAY_NAMES[day]
}

export function dayShort(day: Weekday): string {
  return DAY_SHORT[day]
}

export function isWeekday(value: unknown): value is Weekday {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

/** 870 -> "2:30 PM", 720 -> "12:00 PM". */
export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** "2:30 to 3:30 PM" when both ends share AM or PM, "11:30 AM to 1:00 PM" otherwise. */
export function formatRange(start: number, end: number): string {
  const a = formatTime(start)
  const b = formatTime(end)
  if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)} to ${b}`
  return `${a} to ${b}`
}

/** "14:30" -> 870. Returns null for anything that is not a valid 24 hour time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 870 -> "14:30", the value format of <input type="time"> and <select> options. */
export function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return h === 1 ? '1 hour' : `${h} hours`
  return `${h} h ${m} min`
}

/** Two intervals overlap when each starts before the other ends. `gap` widens both, for travel time. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number, gap = 0): boolean {
  return aStart < bEnd + gap && bStart < aEnd + gap
}

/** Sorts by day and start, and merges ranges on the same day that overlap or touch. */
export function normalizeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .map((r) => ({ day: r.day, start: r.start, end: r.end }))
    .sort((a, b) => a.day - b.day || a.start - b.start)
  const out: TimeRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && last.day === r.day && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
    } else {
      out.push(r)
    }
  }
  return out
}

/** True when one range of availability holds the whole interval. Ranges are merged first. */
export function covers(ranges: readonly TimeRange[], day: Weekday, start: number, end: number): boolean {
  return normalizeRanges(ranges).some((r) => r.day === day && r.start <= start && r.end >= end)
}

export function rangesOn(ranges: readonly TimeRange[], day: Weekday): TimeRange[] {
  return normalizeRanges(ranges).filter((r) => r.day === day)
}

export function totalMinutes(ranges: readonly TimeRange[]): number {
  return normalizeRanges(ranges).reduce((sum, r) => sum + (r.end - r.start), 0)
}

/** Availability as one boolean per cell, for the grid editor. Cell i covers [from + i*step, from + (i+1)*step). */
export function rangesToCells(ranges: readonly TimeRange[], from: number, to: number, step: number): Record<Weekday, boolean[]> {
  const count = Math.round((to - from) / step)
  const cells = {} as Record<Weekday, boolean[]>
  for (const day of WEEKDAYS) {
    const list = rangesOn(ranges, day)
    cells[day] = Array.from({ length: count }, (_, i) => {
      const s = from + i * step
      return list.some((r) => r.start <= s && r.end >= s + step)
    })
  }
  return cells
}

export function cellsToRanges(cells: Record<Weekday, boolean[]>, from: number, step: number): TimeRange[] {
  const out: TimeRange[] = []
  for (const day of WEEKDAYS) {
    let open: number | null = null
    const row = cells[day] ?? []
    row.forEach((on, i) => {
      if (on && open === null) open = i
      if (!on && open !== null) {
        out.push({ day, start: from + open * step, end: from + i * step })
        open = null
      }
    })
    if (open !== null) out.push({ day, start: from + open * step, end: from + row.length * step })
  }
  return out
}

/** A short summary such as "Mon, Wed, Thu" for the days with any availability. */
export function daysSummary(ranges: readonly TimeRange[]): string {
  const days = WEEKDAYS.filter((d) => ranges.some((r) => r.day === d))
  return days.length ? days.map(dayShort).join(', ') : 'No times given'
}
