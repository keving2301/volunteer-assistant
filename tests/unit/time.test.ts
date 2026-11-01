import { describe, expect, it } from 'vitest'
import {
  cellsToRanges,
  covers,
  formatRange,
  formatTime,
  normalizeRanges,
  overlaps,
  parseClock,
  rangesToCells,
} from '../../shared/time'

describe('time helpers', () => {
  it('formats minutes after midnight', () => {
    expect(formatTime(870)).toBe('2:30 PM')
    expect(formatTime(720)).toBe('12:00 PM')
    expect(formatTime(0)).toBe('12:00 AM')
    expect(formatRange(870, 960)).toBe('2:30 to 4:00 PM')
    expect(formatRange(690, 780)).toBe('11:30 AM to 1:00 PM')
  })

  it('parses 24 hour clock times', () => {
    expect(parseClock('14:30')).toBe(870)
    expect(parseClock('9:05')).toBe(545)
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('2pm')).toBeNull()
  })

  it('treats touching intervals as not overlapping unless a gap is required', () => {
    expect(overlaps(840, 900, 900, 960)).toBe(false)
    expect(overlaps(840, 900, 899, 960)).toBe(true)
    expect(overlaps(840, 900, 920, 960, 30)).toBe(true)
    expect(overlaps(840, 900, 930, 960, 30)).toBe(false)
  })

  it('merges overlapping and touching ranges per day', () => {
    expect(
      normalizeRanges([
        { day: 2, start: 900, end: 960 },
        { day: 1, start: 780, end: 840 },
        { day: 2, start: 840, end: 900 },
        { day: 2, start: 1000, end: 1020 },
        { day: 3, start: 900, end: 900 },
      ]),
    ).toEqual([
      { day: 1, start: 780, end: 840 },
      { day: 2, start: 840, end: 960 },
      { day: 2, start: 1000, end: 1020 },
    ])
  })

  it('checks coverage across merged ranges', () => {
    const ranges = [
      { day: 2 as const, start: 840, end: 900 },
      { day: 2 as const, start: 900, end: 1020 },
    ]
    expect(covers(ranges, 2, 870, 1000)).toBe(true)
    expect(covers(ranges, 2, 830, 1000)).toBe(false)
    expect(covers(ranges, 3, 870, 1000)).toBe(false)
  })

  it('converts between ranges and grid cells without loss', () => {
    const ranges = [
      { day: 1 as const, start: 720, end: 840 },
      { day: 3 as const, start: 900, end: 1080 },
    ]
    const cells = rangesToCells(ranges, 420, 1260, 30)
    expect(cells[1].filter(Boolean)).toHaveLength(4)
    expect(cells[3].filter(Boolean)).toHaveLength(6)
    expect(cellsToRanges(cells, 420, 30)).toEqual(ranges)
  })
})
