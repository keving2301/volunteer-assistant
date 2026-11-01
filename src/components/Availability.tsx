import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  WEEKDAYS,
  cellsToRanges,
  dayName,
  dayShort,
  formatRange,
  formatTime,
  rangesOn,
  rangesToCells,
  totalMinutes,
  type TimeRange,
  type Weekday,
} from '../../shared/time'
import { AVAILABILITY_END, AVAILABILITY_START } from '../../shared/validation'
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery'

const FROM = AVAILABILITY_START
const TO = AVAILABILITY_END
const STEP = 30
const ROWS = (TO - FROM) / STEP

export interface GridMarker {
  day: Weekday
  start: number
  end: number
  label: string
}

type Cells = Record<Weekday, boolean[]>

function markerAt(markers: readonly GridMarker[], day: Weekday, i: number) {
  const s = FROM + i * STEP
  return markers.find((m) => m.day === day && m.start < s + STEP && m.end > s)
}

function markerEndsAt(marker: GridMarker, i: number) {
  const s = FROM + i * STEP
  return marker.end > s && marker.end <= s + STEP
}

function markerStartsAt(marker: GridMarker, i: number) {
  const s = FROM + i * STEP
  return marker.start >= s && marker.start < s + STEP
}

/**
 * The weekly availability editor: Monday to Friday in half hours from 8:00 AM to 8:00 PM.
 * Mouse and pen: press and drag to paint free or busy time. Touch: the same, the grid does not scroll under a finger.
 * Keyboard: arrow keys move, Space or Enter switches the half hour, Shift with an arrow paints as it moves.
 * Markers show the volunteer's teams, so a change that uncovers one is visible before saving.
 */
export function AvailabilityGrid({
  value,
  onChange,
  markers = [],
  label = 'Weekly availability',
}: {
  value: readonly TimeRange[]
  onChange?: (ranges: TimeRange[]) => void
  markers?: readonly GridMarker[]
  label?: string
}) {
  const readOnly = !onChange
  const cells = useMemo(() => rangesToCells(value, FROM, TO, STEP), [value])
  const [focus, setFocus] = useState<{ day: Weekday; i: number }>({ day: 1, i: 12 })
  const paint = useRef<boolean | null>(null)
  const refs = useRef(new Map<string, HTMLDivElement>())

  const set = useCallback(
    (day: Weekday, i: number, on: boolean) => {
      if (!onChange || cells[day][i] === on) return
      const next: Cells = { ...cells, [day]: cells[day].map((c, j) => (j === i ? on : c)) }
      onChange(cellsToRanges(next, FROM, STEP))
    },
    [cells, onChange],
  )

  useEffect(() => {
    const stop = () => {
      paint.current = null
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const cellFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    if (!el) return null
    const [day, i] = el.dataset.cell!.split(':').map(Number)
    return { day: day as Weekday, i }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (readOnly || event.button !== 0) return
    const hit = cellFromPoint(event.clientX, event.clientY)
    if (!hit) return
    event.preventDefault()
    // Touch pointers are captured by the element they start on; release so the move events report the cell under
    // the finger.
    ;(event.target as Element).releasePointerCapture?.(event.pointerId)
    paint.current = !cells[hit.day][hit.i]
    setFocus(hit)
    set(hit.day, hit.i, paint.current)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (paint.current === null) return
    const hit = cellFromPoint(event.clientX, event.clientY)
    if (hit) set(hit.day, hit.i, paint.current)
  }

  const move = (day: Weekday, i: number, painting: boolean, from: { day: Weekday; i: number }) => {
    const next = { day: Math.min(5, Math.max(1, day)) as Weekday, i: Math.min(ROWS - 1, Math.max(0, i)) }
    if (painting) set(next.day, next.i, cells[from.day][from.i])
    setFocus(next)
    refs.current.get(`${next.day}:${next.i}`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, day: Weekday, i: number) => {
    const shift = event.shiftKey && !readOnly
    const here = { day, i }
    switch (event.key) {
      case 'ArrowUp':
        move(day, i - 1, shift, here)
        break
      case 'ArrowDown':
        move(day, i + 1, shift, here)
        break
      case 'ArrowLeft':
        move((day - 1) as Weekday, i, shift, here)
        break
      case 'ArrowRight':
        move((day + 1) as Weekday, i, shift, here)
        break
      case 'Home':
        move(day, 0, false, here)
        break
      case 'End':
        move(day, ROWS - 1, false, here)
        break
      case ' ':
      case 'Enter':
        if (readOnly) return
        set(day, i, !cells[day][i])
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      className={readOnly ? 'avail-grid is-readonly' : 'avail-grid'}
      role="grid"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div role="row" className="avail-row avail-head">
        <div role="columnheader" className="avail-corner">
          <span className="visually-hidden">Time</span>
        </div>
        {WEEKDAYS.map((day) => (
          <div key={day} role="columnheader" className="avail-dayhead">
            <span aria-hidden="true">{dayShort(day)}</span>
            <span className="visually-hidden">{dayName(day)}</span>
          </div>
        ))}
      </div>
      {Array.from({ length: ROWS }, (_, i) => {
        const start = FROM + i * STEP
        return (
          <div role="row" className="avail-row" key={i}>
            <div role="rowheader" className={start % 60 === 0 ? 'avail-time is-hour' : 'avail-time'}>
              {start % 60 === 0 ? <span aria-hidden="true">{formatTime(start).replace(':00', '')}</span> : null}
              <span className="visually-hidden">{formatTime(start)}</span>
            </div>
            {WEEKDAYS.map((day) => {
              const on = cells[day][i]
              const marker = markerAt(markers, day, i)
              const classes = ['avail-cell']
              if (on) classes.push('is-free')
              if (marker) classes.push('has-marker')
              if (marker && markerStartsAt(marker, i)) classes.push('marker-start')
              if (marker && markerEndsAt(marker, i)) classes.push('marker-end')
              if (start % 60 === 0) classes.push('is-hour')
              const isFocus = focus.day === day && focus.i === i
              return (
                <div
                  key={day}
                  ref={(el) => {
                    if (el) refs.current.set(`${day}:${i}`, el)
                    else refs.current.delete(`${day}:${i}`)
                  }}
                  role="gridcell"
                  data-cell={`${day}:${i}`}
                  className={classes.join(' ')}
                  tabIndex={isFocus ? 0 : -1}
                  aria-selected={on}
                  aria-label={`${dayName(day)} ${formatRange(start, start + STEP)}, ${on ? 'free' : 'not free'}${marker ? `, team: ${marker.label}` : ''}`}
                  onKeyDown={(e) => onKeyDown(e, day, i)}
                  onFocus={() => setFocus({ day, i })}
                >
                  {marker && markerStartsAt(marker, i) && <span className="marker-label">{marker.label}</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** On a phone: one day at a time, a list of half hours to tap on or off. */
export function AvailabilityDayList({
  value,
  onChange,
  markers = [],
}: {
  value: readonly TimeRange[]
  onChange: (ranges: TimeRange[]) => void
  markers?: readonly GridMarker[]
}) {
  const [day, setDay] = useState<Weekday>(1)
  const cells = useMemo(() => rangesToCells(value, FROM, TO, STEP), [value])
  const toggle = (i: number) => {
    const next: Cells = { ...cells, [day]: cells[day].map((c, j) => (j === i ? !c : c)) }
    onChange(cellsToRanges(next, FROM, STEP))
  }
  return (
    <div className="avail-phone">
      <div className="day-tabs" role="tablist" aria-label="Day">
        {WEEKDAYS.map((d) => {
          const hours = totalMinutes(rangesOn(value, d)) / 60
          return (
            <button
              key={d}
              type="button"
              role="tab"
              id={`day-tab-${d}`}
              aria-selected={d === day}
              aria-controls="day-panel"
              className="day-tab"
              onClick={() => setDay(d)}
            >
              <span className="day-tab-name">{dayShort(d)}</span>
              <span className="day-tab-hours">{hours ? `${hours} h` : 'None'}</span>
            </button>
          )
        })}
      </div>
      <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${day}`} className="day-slots">
        {Array.from({ length: ROWS }, (_, i) => {
          const start = FROM + i * STEP
          const on = cells[day][i]
          const marker = markerAt(markers, day, i)
          return (
            <button
              key={i}
              type="button"
              className={['day-slot', on ? 'is-free' : '', marker ? 'has-marker' : ''].join(' ').trim()}
              aria-pressed={on}
              onClick={() => toggle(i)}
            >
              <span className="day-slot-time">{formatTime(start)}</span>
              <span className="day-slot-state">
                {marker ? marker.label : on ? 'Free' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Plain text, day by day: "Tuesday: 2:00 to 6:00 PM". */
export function AvailabilitySummary({ value }: { value: readonly TimeRange[] }) {
  const total = totalMinutes(value) / 60
  return (
    <div className="avail-summary">
      <dl className="avail-summary-list">
        {WEEKDAYS.map((d) => {
          const list = rangesOn(value, d)
          return (
            <div key={d} className="avail-summary-row">
              <dt>{dayName(d)}</dt>
              <dd>{list.length ? list.map((r) => formatRange(r.start, r.end)).join(', ') : <span className="muted">Not free</span>}</dd>
            </div>
          )
        })}
      </dl>
      <p className="avail-summary-total">
        {total ? `${total} hours a week` : 'No times given yet'}
      </p>
    </div>
  )
}

/** A small picture of the week for tables: one column per day, filled where the volunteer is free (11 AM to 7 PM). */
export function AvailabilityStrip({ value }: { value: readonly TimeRange[] }) {
  const from = 660
  const to = 1140
  const height = 36
  const scale = height / (to - from)
  const text = WEEKDAYS.map((d) => {
    const list = rangesOn(value, d)
    return list.length ? `${dayShort(d)} ${list.map((r) => formatRange(r.start, r.end)).join(', ')}` : null
  })
    .filter(Boolean)
    .join('; ')
  return (
    <span className="strip" role="img" aria-label={text ? `Free ${text}` : 'No times given'}>
      <svg width="78" height={height + 14} viewBox={`0 0 78 ${height + 14}`} aria-hidden="true" focusable="false">
        {WEEKDAYS.map((d, k) => {
          const x = k * 16
          return (
            <g key={d}>
              <rect x={x} y={0} width={12} height={height} rx={2} className="strip-bg" />
              {rangesOn(value, d).map((r) => {
                const y = Math.max(0, (r.start - from) * scale)
                const y2 = Math.min(height, (r.end - from) * scale)
                return y2 > y ? <rect key={r.start} x={x} y={y} width={12} height={y2 - y} rx={2} className="strip-on" /> : null
              })}
              <text x={x + 6} y={height + 11} textAnchor="middle" className="strip-label">
                {dayShort(d).charAt(0)}
              </text>
            </g>
          )
        })}
      </svg>
    </span>
  )
}

export function useIsPhone() {
  return useMediaQuery(PHONE_QUERY)
}
