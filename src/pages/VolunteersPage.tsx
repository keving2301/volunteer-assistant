import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { localIsoDate, pickSemester } from '../../shared/calendar'
import { findPlacement } from '../../shared/schedule'
import { WEEKDAYS, dayName, dayShort, rangesOn, totalMinutes, type Weekday } from '../../shared/time'
import { fullName, type Volunteer } from '../../shared/types'
import { errorMessage } from '../api/client'
import { useSchools, useSemesters, useTeams, useVolunteers } from '../api/hooks'
import { AvailabilityStrip } from '../components/Availability'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { Dialog, EmptyState, LoadError, Loading, PageHeader, SelectField } from '../components/ui'
import { VolunteerForm } from './VolunteerForm'

type TeamFilter = 'all' | 'on' | 'off'

export function VolunteersPage() {
  const volunteers = useVolunteers()
  const semesters = useSemesters()
  const schools = useSchools()
  const semester = semesters.data ? pickSemester(semesters.data, localIsoDate()) : null
  const teams = useTeams(semester?.id)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')
  const [freeOn, setFreeOn] = useState<'' | Weekday>('')
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const teamsOf = useMemo(() => {
    const map = new Map<string, { name: string; when: string }[]>()
    for (const team of teams.data ?? []) {
      const place = findPlacement(schools.data ?? [], team.schoolId, team.sessionId)
      if (!place) continue
      for (const id of team.memberIds) {
        const list = map.get(id) ?? []
        list.push({ name: place.school.name, when: dayShort(place.session.day) })
        map.set(id, list)
      }
    }
    return map
  }, [teams.data, schools.data])

  const query = search.trim().toLowerCase()
  const visible = (volunteers.data ?? []).filter((v) => {
    if (query && !`${fullName(v)} ${v.email} ${v.major}`.toLowerCase().includes(query)) return false
    const count = teamsOf.get(v.id)?.length ?? 0
    if (teamFilter === 'on' && count === 0) return false
    if (teamFilter === 'off' && count > 0) return false
    if (freeOn && rangesOn(v.availability, freeOn).length === 0) return false
    return true
  })

  const failed = [volunteers, semesters, schools, teams].find((q) => q.isError)

  return (
    <div className="page">
      <PageHeader
        title="Volunteers"
        meta={volunteers.data ? `${volunteers.data.length} volunteers${semester ? `, teams for ${semester.name}` : ''}` : undefined}
        actions={
          <button type="button" className="button button-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} />
            Add volunteer
          </button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            className="input"
            placeholder="Search by name, email or major"
            aria-label="Search volunteers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Teams this semester">
          {(
            [
              ['all', 'All'],
              ['on', 'On a team'],
              ['off', 'Not on a team'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={teamFilter === value} onClick={() => setTeamFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <SelectField
          label="Free on"
          className="field-inline"
          value={freeOn}
          onChange={(e) => setFreeOn(e.target.value ? (Number(e.target.value) as Weekday) : '')}
        >
          <option value="">Any day</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {dayName(d)}
            </option>
          ))}
        </SelectField>
      </div>

      {failed ? (
        <LoadError message={errorMessage(failed.error)} onRetry={() => volunteers.refetch()} />
      ) : !volunteers.data ? (
        <Loading label="Loading volunteers" />
      ) : volunteers.data.length === 0 ? (
        <EmptyState title="No volunteers yet">Add the students who signed up to teach.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="No volunteer matches">Clear the search or the filters to see everyone.</EmptyState>
      ) : (
        <>
          <p className="result-count" aria-live="polite">
            Showing {visible.length} of {volunteers.data.length}
          </p>
          <div className="table-wrap">
            <table className="table table-rows-link">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Major</th>
                  <th scope="col">Free each week</th>
                  <th scope="col">Teams this semester</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => (
                  <VolunteerRow key={v.id} volunteer={v} teams={teamsOf.get(v.id) ?? []} onOpen={() => navigate(`/volunteers/${v.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add volunteer">
        {adding && (
          <VolunteerForm
            volunteer={null}
            onCancel={() => setAdding(false)}
            onDone={(saved) => {
              setAdding(false)
              toast(`${fullName(saved)} added. They can now give their weekly availability.`)
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function VolunteerRow({ volunteer: v, teams, onOpen }: { volunteer: Volunteer; teams: { name: string; when: string }[]; onOpen: () => void }) {
  const hours = totalMinutes(v.availability) / 60
  return (
    <tr onClick={onOpen}>
      <td data-label="Name">
        <Link to={`/volunteers/${v.id}`} className="cell-strong row-link" onClick={(e) => e.stopPropagation()}>
          {fullName(v)}
        </Link>
        <div className="cell-sub">{v.email}</div>
      </td>
      <td data-label="Major">
        <div>{v.major}</div>
        <div className="cell-sub">Class of {v.gradYear}</div>
      </td>
      <td data-label="Free each week">
        <div className="free-cell">
          <AvailabilityStrip value={v.availability} />
          <span className="cell-sub">{hours ? `${hours} h` : 'No times given'}</span>
        </div>
      </td>
      <td data-label="Teams this semester">
        {teams.length ? (
          <ul className="plain-list">
            {teams.map((t) => (
              <li key={t.name + t.when}>
                <span className="cell-sub-strong">{t.when}</span> {t.name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">None</span>
        )}
      </td>
    </tr>
  )
}
