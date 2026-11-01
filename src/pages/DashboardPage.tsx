import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { addDays, formatDate, formatDateRange, localIsoDate, pickSemester, schoolWeek, semesterStatus } from '../../shared/calendar'
import { semesterBoard, type SessionStatus } from '../../shared/schedule'
import { dayName, formatRange, type Weekday } from '../../shared/time'
import { errorMessage } from '../api/client'
import { useSchools, useSemesters, useTeams, useVolunteers } from '../api/hooks'
import { Icon } from '../components/Icon'
import { TeamEditor, type TeamEditorTarget } from '../components/TeamEditor'
import { WeekBoard } from '../components/WeekBoard'
import { EmptyState, LoadError, Loading, PageHeader } from '../components/ui'

export function DashboardPage() {
  const semesters = useSemesters()
  const schools = useSchools()
  const volunteers = useVolunteers()
  const today = localIsoDate()
  const semester = semesters.data ? pickSemester(semesters.data, today) : null
  const teams = useTeams(semester?.id)
  const [weekOffset, setWeekOffset] = useState(0)
  const [editing, setEditing] = useState<TeamEditorTarget | null>(null)

  const week = useMemo(() => schoolWeek(addDays(today, weekOffset * 7)), [today, weekOffset])
  const dates = Object.fromEntries(week.days.map((d) => [d.day, d.date])) as Record<Weekday, string>
  const friday = week.days[4].date
  const inSession = semester ? week.days.some((d) => semesterStatus(semester, d.date) === 'current') : false

  const rows = useMemo(() => {
    if (!semester || !schools.data || !volunteers.data || !teams.data) return []
    return semesterBoard({ semester, schools: schools.data, volunteers: volunteers.data, teams: teams.data })
  }, [semester, schools.data, volunteers.data, teams.data])

  const queries = [semesters, schools, volunteers, teams]
  const failed = queries.find((q) => q.isError)
  const loading = queries.some((q) => q.isPending && q.fetchStatus !== 'idle')

  const isWeekend = [0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay())
  const title = weekOffset === 0 ? (isWeekend ? 'Next week' : 'This week') : `Week of ${formatDate(week.monday)}`

  const attention = rows.filter((r) => r.flags.length)
  const ready = rows.length - attention.length
  const assigned = new Set((teams.data ?? []).flatMap((t) => t.memberIds)).size
  const open = (row: SessionStatus) =>
    setEditing(row.team ? { team: row.team } : { schoolId: row.school.id, sessionId: row.session.id })

  return (
    <div className="page">
      <PageHeader
        title={title}
        meta={semester ? `${semester.name}, ${formatDateRange(week.monday, friday)}` : undefined}
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
        <LoadError message={errorMessage(failed.error)} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : loading ? (
        <Loading label="Loading the week" />
      ) : !semester ? (
        <EmptyState title="No semesters yet" action={<Link className="button button-primary" to="/semesters">Add a semester</Link>}>
          Add a semester with its dates and team sizes, then build its teams.
        </EmptyState>
      ) : !inSession ? (
        <EmptyState title="No sessions this week">
          {semester.name} runs {formatDateRange(semester.startDate, semester.endDate)}. Pick a week inside it to see its
          sessions.
        </EmptyState>
      ) : (
        <>
          <p className="summary-line">
            <strong>{rows.length} sessions</strong> this week: {ready} ready
            {attention.length > 0 && (
              <>
                , <a href="#attention">{attention.length} need attention</a>
              </>
            )}
            . {assigned} of {volunteers.data?.length ?? 0} volunteers are on a team this semester.
          </p>

          {attention.length > 0 && (
            <section id="attention" className="panel attention" aria-labelledby="attention-title">
              <h2 id="attention-title" className="panel-title">
                Needs attention
              </h2>
              <ul className="attention-list">
                {attention.map((row) => (
                  <li key={`${row.school.id}:${row.session.id}`} className="attention-item">
                    <span className={row.team ? 'attention-mark is-warn' : 'attention-mark is-empty'} aria-hidden="true">
                      <Icon name={row.team ? 'alert' : 'plus'} size={16} />
                    </span>
                    <div className="attention-text">
                      <div className="attention-what">
                        {row.school.name}, {dayName(row.session.day)} {formatRange(row.session.start, row.session.end)}
                      </div>
                      <ul className="attention-why">
                        {row.flags.map((f) => (
                          <li key={f.message}>{f.message}</li>
                        ))}
                      </ul>
                    </div>
                    <button type="button" className="button button-small" onClick={() => open(row)}>
                      {row.team ? 'Edit team' : 'Build team'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WeekBoard rows={rows} dates={dates} today={today} onOpen={open} />
        </>
      )}

      {semester && schools.data && volunteers.data && teams.data && (
        <TeamEditor
          target={editing}
          onClose={() => setEditing(null)}
          semester={semester}
          schools={schools.data}
          volunteers={volunteers.data}
          teams={teams.data}
        />
      )}
    </div>
  )
}
