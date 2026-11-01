import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { addDays, formatDate, formatDateRange, localIsoDate, pickSemester, schoolWeek, semesterStatus } from '../../shared/calendar'
import { availabilityReason } from '../../shared/schedule'
import { dayName, durationLabel, formatRange, formatTime } from '../../shared/time'
import { errorMessage } from '../api/client'
import { useMe, useMyTeams, useSemesters } from '../api/hooks'
import { Icon } from '../components/Icon'
import { EmptyState, LoadError, Loading, PageHeader } from '../components/ui'

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function MyWeekPage() {
  const myTeams = useMyTeams()
  const semesters = useSemesters()
  const me = useMe()
  const today = localIsoDate()
  const [weekOffset, setWeekOffset] = useState(0)
  const week = useMemo(() => schoolWeek(addDays(today, weekOffset * 7)), [today, weekOffset])
  const semester = semesters.data ? pickSemester(semesters.data, today) : null
  const isWeekend = [0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay())

  const mine = (myTeams.data ?? []).filter((t) => t.semester.id === semester?.id)
  const weekly = mine.reduce((n, t) => n + (t.session.end - t.session.start), 0)

  const failed = [myTeams, semesters, me].find((q) => q.isError)
  const loading = [myTeams, semesters, me].some((q) => q.isPending)
  const title = weekOffset === 0 ? (isWeekend ? 'Next week' : 'This week') : `Week of ${formatDate(week.monday)}`

  return (
    <div className="page">
      <PageHeader
        title={title}
        meta={semester ? `${semester.name}, ${formatDateRange(week.monday, week.days[4].date)}` : undefined}
        actions={
          <div className="week-nav" role="group" aria-label="Week">
            <button type="button" className="icon-button bordered" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="button" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              Today
            </button>
            <button type="button" className="icon-button bordered" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
              <Icon name="chevronRight" />
            </button>
          </div>
        }
      />

      {failed ? (
        <LoadError message={errorMessage(failed.error)} onRetry={() => [myTeams, semesters, me].forEach((q) => q.refetch())} />
      ) : loading ? (
        <Loading label="Loading your week" />
      ) : !semester ? (
        <EmptyState title="No semester scheduled">Your coordinator has not set up a semester yet.</EmptyState>
      ) : (
        <div className="my-week">
          <div className="my-days">
            {mine.length === 0 && (
              <EmptyState
                title="You are not on a team yet"
                action={
                  <Link to="/availability" className="button button-primary">
                    Update availability
                  </Link>
                }
              >
                Coordinators build {semester.name} teams from the times volunteers are free. Keep your availability up to
                date to be placed.
              </EmptyState>
            )}
            {mine.length > 0 &&
              week.days.map(({ day, date }) => {
                const sessions = mine.filter((t) => t.session.day === day)
                const inTerm = semesterStatus(semester, date) === 'current'
                const isToday = date === today
                return (
                  <section key={day} className={isToday ? 'my-day is-today' : 'my-day'} aria-label={`${dayName(day)} ${formatDate(date)}`}>
                    <div className="my-day-label">
                      <span className="my-day-name">{dayName(day)}</span>
                      <span className="my-day-date">{formatDate(date)}</span>
                      {isToday && <span className="today-pill">Today</span>}
                    </div>
                    <div className="my-day-body">
                      {!inTerm ? (
                        <p className="muted">No program this day</p>
                      ) : sessions.length === 0 ? (
                        <p className="muted">No session</p>
                      ) : (
                        sessions.map((t) => {
                          const buffer = t.semester.travelBufferMinutes
                          const uncovered = me.data ? availabilityReason(me.data, t.session, buffer) : null
                          return (
                            <article key={t.team.id} className="visit">
                              <div className="visit-time">{formatRange(t.session.start, t.session.end)}</div>
                              <h3 className="visit-school">{t.school.name}</h3>
                              <p className="visit-line">
                                <Icon name="mapPin" size={15} />
                                {t.school.address.street}, {t.school.address.city}, {t.school.address.state} {t.school.address.zip}
                              </p>
                              {buffer > 0 && (
                                <p className="visit-line">
                                  <Icon name="route" size={15} />
                                  Leave campus by {formatTime(t.session.start - buffer)}, back about {formatTime(t.session.end + buffer)}
                                </p>
                              )}
                              <p className="visit-line">
                                <Icon name="teams" size={15} />
                                {t.teammates.length ? `With ${listNames(t.teammates.map((m) => m.name))}` : 'No teammates yet'}
                              </p>
                              <p className="visit-line">
                                <Icon name="phone" size={15} />
                                {t.school.contact.name}
                                {t.school.contact.title ? ` (${t.school.contact.title})` : ''}, {t.school.contact.phone}
                              </p>
                              {t.team.notes && <p className="visit-notes">{t.team.notes}</p>}
                              {uncovered && (
                                <p className="visit-warning">
                                  <Icon name="alert" size={15} />
                                  Your availability no longer covers this session. It shows on your coordinator's dashboard.
                                </p>
                              )}
                            </article>
                          )
                        })
                      )}
                    </div>
                  </section>
                )
              })}
          </div>

          <aside className="panel my-side" aria-labelledby="semester-title">
            <h2 id="semester-title" className="panel-title">
              {semester.name}
            </h2>
            <p className="panel-text">{formatDateRange(semester.startDate, semester.endDate)}</p>
            <dl className="facts">
              <div>
                <dt>Teams</dt>
                <dd>{mine.length}</dd>
              </div>
              <div>
                <dt>Teaching each week</dt>
                <dd>{weekly ? durationLabel(weekly) : 'None'}</dd>
              </div>
              <div>
                <dt>Travel each way</dt>
                <dd>{semester.travelBufferMinutes} min</dd>
              </div>
            </dl>
            <Link to="/availability" className="button button-block">
              <Icon name="clock" size={16} />
              Update availability
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
