import { describe, expect, it } from 'vitest'
import { formatDateRange, pickSemester, schoolWeek, semesterStatus, termsAround, termsOfYear } from '../../shared/calendar'

describe('calendar', () => {
  it('builds the academic terms of a year', () => {
    expect(termsOfYear(2026)).toEqual([
      { name: 'Spring 2026', startDate: '2026-01-12', endDate: '2026-05-01' },
      { name: 'Fall 2026', startDate: '2026-08-24', endDate: '2026-12-11' },
    ])
  })

  it('finds the term in session, or the next one during a break', () => {
    expect(termsAround('2026-11-01').current.name).toBe('Fall 2026')
    expect(termsAround('2026-11-01').previous.name).toBe('Spring 2026')
    expect(termsAround('2026-11-01').next.name).toBe('Spring 2027')
    expect(termsAround('2026-06-15').current.name).toBe('Fall 2026')
    expect(termsAround('2026-12-20').current.name).toBe('Spring 2027')
    expect(termsAround('2027-01-05').previous.name).toBe('Fall 2026')
  })

  it('shows the coming week on a weekend', () => {
    expect(schoolWeek('2026-11-01').monday).toBe('2026-11-02')
    expect(schoolWeek('2026-10-31').monday).toBe('2026-11-02')
    expect(schoolWeek('2026-11-04').monday).toBe('2026-11-02')
    expect(schoolWeek('2026-11-06').days.map((d) => d.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
  })

  it('picks the semester in session, else the next, else the latest', () => {
    const spring = { startDate: '2026-01-12', endDate: '2026-05-01' }
    const fall = { startDate: '2026-08-24', endDate: '2026-12-11' }
    expect(pickSemester([spring, fall], '2026-11-01')).toBe(fall)
    expect(pickSemester([spring, fall], '2026-06-01')).toBe(fall)
    expect(pickSemester([spring, fall], '2027-02-01')).toBe(fall)
    expect(semesterStatus(fall, '2026-12-11')).toBe('current')
    expect(semesterStatus(fall, '2026-12-12')).toBe('past')
  })

  it('formats date ranges', () => {
    expect(formatDateRange('2026-11-02', '2026-11-06')).toBe('Nov 2 to 6, 2026')
    expect(formatDateRange('2026-10-26', '2026-11-30')).toBe('Oct 26 to Nov 30, 2026')
    expect(formatDateRange('2026-12-28', '2027-01-01')).toBe('Dec 28, 2026 to Jan 1, 2027')
  })
})
