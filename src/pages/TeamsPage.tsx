import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatDateRange, localIsoDate, pickSemester, semesterStatus, sortSemesters } from '../../shared/calendar'
import { semesterBoard, type SessionStatus } from '../../shared/schedule'
import { errorMessage } from '../api/client'
import { useSchools, useSemesters, useTeams, useVolunteers } from '../api/hooks'
import { Icon } from '../components/Icon'
import { TeamEditor, type TeamEditorTarget } from '../components/TeamEditor'
import { WeekBoard } from '../components/WeekBoard'
import { EmptyState, LoadError, Loading, Notice, PageHeader, SelectField } from '../components/ui'

const STATUS_LABEL = { current: 'current', upcoming: 'upcoming', past: 'ended' } as const

export function TeamsPage() {
  const semesters = useSemesters()
  const schools = useSchools()
  const volunteers = useVolunteers()
  const [params, setParams] = useSearchParams()
  const today = localIsoDate()
  const list = useMemo(() => sortSemesters(semesters.data ?? []), [semesters.data])
  const chosen = list.find((s) => s.id === params.get('semester')) ?? pickSemester(list, today)
  const teams = useTeams(chosen?.id)
  const [editing, setEditing] = useState<TeamEditorTarget | null>(null)

  const status = chosen ? semesterStatus(chosen, today) : null
  const isPast = status === 'past'
  const rows = useMemo(() => {
    if (!chosen || !schools.data || !volunteers.data || !teams.data) return []
    return semesterBoard({
      semester: chosen,
      schools: schools.data,
      volunteers: volunteers.data,
      teams: teams.data,
      checkFlags: !isPast,
    })
  }, [chosen, schools.data, volunteers.data, teams.data, isPast])

  const queries = [semesters, schools, volunteers, teams]
  const failed = queries.find((q) => q.isError)
  const loading = queries.some((q) => q.isPending && q.fetchStatus !== 'idle')
  const teamCount = teams.data?.length ?? 0
  const filled = (teams.data ?? []).reduce((n, t) => n + t.memberIds.length, 0)
  const withoutTeam = rows.filter((r) => !r.team).length
  const freeSessions = rows.filter((r) => !r.team)

  const open = (row: SessionStatus) =>
    setEditing(row.team ? { team: row.team } : { schoolId: row.school.id, sessionId: row.session.id })

  return (
    <div className="page">
      <PageHeader
        title="Teams"
        meta={chosen ? `${formatDateRange(chosen.startDate, chosen.endDate)}` : undefined}
        actions={
          <>
            {list.length > 0 && chosen && (
              <SelectField
                label="Semester"
                className="field-inline"
                value={chosen.id}
                onChange={(e) => setParams({ semester: e.target.value }, { replace: true })}
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({STATUS_LABEL[semesterStatus(s, today)]})
                  </option>
                ))}
              </SelectField>
            )}
            {!isPast && chosen && (
              <button
                type="button"
                className="button button-primary"
                onClick={() =>
                  setEditing(
                    freeSessions[0]
                      ? { schoolId: freeSessions[0].school.id, sessionId: freeSessions[0].session.id }
                      : { schoolId: schools.data?.[0]?.id },
                  )
                }
                disabled={!schools.data?.length}
              >
                <Icon name="plus" size={16} />
                New team
              </button>
            )}
          </>
        }
      />

      {failed ? (
        <LoadError message={errorMessage(failed.error)} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : loading ? (
        <Loading label="Loading teams" />
      ) : !chosen ? (
        <EmptyState title="No semesters yet">Add a semester first, then build its teams here.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No school sessions">Add schools and their weekly session times to build teams.</EmptyState>
      ) : (
        <>
          {isPast ? (
            <Notice>{chosen.name} has ended. Its teams are kept as a record and cannot be changed.</Notice>
          ) : teamCount === 0 ? (
            <Notice>
              No teams yet for {chosen.name}. Choose a session below to build its team from the volunteers who are free then.
            </Notice>
          ) : (
            <p className="summary-line">
              <strong>{teamCount} teams</strong> with {filled} volunteer places filled
              {withoutTeam > 0 ? `, ${withoutTeam} ${withoutTeam === 1 ? 'session' : 'sessions'} without a team` : ''}.
            </p>
          )}
          <WeekBoard rows={rows} onOpen={open} readOnly={isPast} />
        </>
      )}

      {chosen && schools.data && volunteers.data && teams.data && (
        <TeamEditor
          target={editing}
          onClose={() => setEditing(null)}
          semester={chosen}
          schools={schools.data}
          volunteers={volunteers.data}
          teams={teams.data}
        />
      )}
    </div>
  )
}
