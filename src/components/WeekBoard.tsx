import type { SessionStatus } from '../../shared/schedule'
import { formatDate } from '../../shared/calendar'
import { dayName, formatTime, WEEKDAYS, type Weekday } from '../../shared/time'
import { shortName } from '../../shared/types'
import { Icon } from './Icon'

export type SlotState = 'ready' | 'attention' | 'empty'

export function slotState(row: SessionStatus): SlotState {
  if (!row.team) return 'empty'
  return row.flags.length ? 'attention' : 'ready'
}

const STATE_LABEL: Record<SlotState, string> = { ready: 'Ready', attention: 'Needs attention', empty: 'No team' }

export function SessionSlotButton({
  row,
  onOpen,
  disabled,
}: {
  row: SessionStatus
  onOpen?: (row: SessionStatus) => void
  disabled?: boolean
}) {
  const state = slotState(row)
  const problems = row.flags.filter((f) => f.kind !== 'no_team')
  const flag = problems[0]
  const content = (
    <>
      <span className="slot-time">
        <span className="slot-start">{formatTime(row.session.start)}</span>
        <span className="slot-end">to {formatTime(row.session.end)}</span>
      </span>
      <span className="slot-body">
        <span className="slot-school">{row.school.name}</span>
        {row.team ? (
          <span className="slot-members">
            {row.members.length ? row.members.map(shortName).join(', ') : 'No members'}
          </span>
        ) : (
          <span className="slot-members slot-missing">No team yet</span>
        )}
        {flag && (
          <span className="slot-flag">
            <Icon name="alert" size={14} />
            {flag.message}
            {problems.length > 1 ? ` (${problems.length - 1} more)` : ''}
          </span>
        )}
        <span className="visually-hidden">, {STATE_LABEL[state]}</span>
      </span>
    </>
  )
  if (!onOpen || disabled) return <div className={`slot slot-${state}`}>{content}</div>
  return (
    <button type="button" className={`slot slot-${state}`} onClick={() => onOpen(row)}>
      {content}
    </button>
  )
}

/**
 * The school week as five columns of sessions in time order; on narrow screens the days stack. Each session shows
 * its team, and sessions with no team or a problem stand out.
 */
export function WeekBoard({
  rows,
  dates,
  today,
  onOpen,
  readOnly,
}: {
  rows: SessionStatus[]
  dates?: Record<Weekday, string>
  today?: string
  onOpen?: (row: SessionStatus) => void
  readOnly?: boolean
}) {
  return (
    <div className="board">
      <div className="board-days">
        {WEEKDAYS.map((day) => {
          const list = rows.filter((r) => r.session.day === day)
          const date = dates?.[day]
          const isToday = Boolean(date && date === today)
          return (
            <section key={day} className={isToday ? 'board-day is-today' : 'board-day'} aria-label={dayName(day)}>
              <h3 className="board-day-head">
                <span className="board-day-name">{dayName(day)}</span>
                {date && <span className="board-day-date">{formatDate(date)}</span>}
                {isToday && <span className="today-pill">Today</span>}
              </h3>
              {list.length ? (
                <div className="board-slots">
                  {list.map((row) => (
                    <SessionSlotButton key={`${row.school.id}:${row.session.id}`} row={row} onOpen={onOpen} disabled={readOnly} />
                  ))}
                </div>
              ) : (
                <p className="board-none">No sessions</p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
