import { useMemo, useState } from 'react'
import { rankCandidates, teamSizeText, validateTeam, type Candidate } from '../../shared/schedule'
import { dayName, dayShort, formatRange, rangesOn } from '../../shared/time'
import { fullName, type School, type Semester, type Team, type Volunteer } from '../../shared/types'
import { toApiError, type ApiError } from '../api/client'
import { useDeleteTeam, useSaveTeam } from '../api/hooks'
import { Icon } from './Icon'
import { ConfirmDialog, Dialog, InlineError, SelectField } from './ui'
import { useToast } from './Toast'

export interface TeamEditorTarget {
  team?: Team
  schoolId?: string
  sessionId?: string
}

function freeText(c: Candidate, day: 1 | 2 | 3 | 4 | 5): string {
  const list = rangesOn(c.volunteer.availability, day)
  return list.length ? `Free ${list.map((r) => formatRange(r.start, r.end)).join(', ')}` : 'Not free this day'
}

function teamsText(n: number): string {
  return n === 0 ? 'No other teams' : n === 1 ? 'On 1 other team' : `On ${n} other teams`
}

/**
 * Builds or edits the team for one school session. The volunteers free for the whole session plus travel time, and
 * not on a clashing team, are listed first (fewest teams first); everyone else is listed with the reason. The same
 * rules run on the server when the team is saved.
 */
export function TeamEditor({
  target,
  onClose,
  semester,
  schools,
  volunteers,
  teams,
}: {
  target: TeamEditorTarget | null
  onClose: () => void
  semester: Semester
  schools: School[]
  volunteers: Volunteer[]
  teams: Team[]
}) {
  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title={target?.team ? 'Edit team' : 'New team'}
      description={`${semester.name}. Teams need ${teamSizeText(semester.minTeamSize, semester.maxTeamSize)}, free for the session plus ${semester.travelBufferMinutes} minutes of travel each way.`}
      size="lg"
    >
      {target && (
        <TeamForm
          key={target.team?.id ?? `${target.schoolId}:${target.sessionId}`}
          target={target}
          onClose={onClose}
          semester={semester}
          schools={schools}
          volunteers={volunteers}
          teams={teams}
        />
      )}
    </Dialog>
  )
}

function TeamForm({
  target,
  onClose,
  semester,
  schools,
  volunteers,
  teams,
}: {
  target: TeamEditorTarget
  onClose: () => void
  semester: Semester
  schools: School[]
  volunteers: Volunteer[]
  teams: Team[]
}) {
  const existing = target.team
  const firstSchool = existing?.schoolId ?? target.schoolId ?? schools[0]?.id ?? ''
  const [schoolId, setSchoolId] = useState(firstSchool)
  const [sessionId, setSessionId] = useState(existing?.sessionId ?? target.sessionId ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(existing?.memberIds ?? [])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [search, setSearch] = useState('')
  const [tried, setTried] = useState(false)
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = useSaveTeam()
  const remove = useDeleteTeam()
  const toast = useToast()

  const school = schools.find((s) => s.id === schoolId)
  const session = school?.sessions.find((s) => s.id === sessionId)
  const takenBy = (sid: string) => teams.find((t) => t.schoolId === schoolId && t.sessionId === sid && t.id !== existing?.id)

  const ranked = useMemo(() => {
    if (!school || !session) return null
    return rankCandidates(volunteers, { school, session }, {
      schools,
      teams,
      bufferMinutes: semester.travelBufferMinutes,
      excludeTeamId: existing?.id,
    })
  }, [school, session, volunteers, schools, teams, semester.travelBufferMinutes, existing?.id])

  const issues = useMemo(
    () =>
      validateTeam({ schoolId, sessionId, memberIds }, { semester, schools, volunteers, teams, teamId: existing?.id }),
    [schoolId, sessionId, memberIds, semester, schools, volunteers, teams, existing?.id],
  )

  const byId = (id: string) => ranked && [...ranked.available, ...ranked.unavailable].find((c) => c.volunteer.id === id)
  const query = search.trim().toLowerCase()
  const matches = (c: Candidate) =>
    !query || fullName(c.volunteer).toLowerCase().includes(query) || c.volunteer.major.toLowerCase().includes(query)
  const available = ranked?.available.filter((c) => !memberIds.includes(c.volunteer.id) && matches(c)) ?? []
  const unavailable = ranked?.unavailable.filter((c) => !memberIds.includes(c.volunteer.id) && matches(c)) ?? []
  const full = memberIds.length >= semester.maxTeamSize

  const add = (id: string) => setMemberIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
  const drop = (id: string) => setMemberIds((ids) => ids.filter((x) => x !== id))

  const submit = () => {
    setTried(true)
    setServerError(null)
    if (issues.length) return
    save.mutate(
      { id: existing?.id, semesterId: semester.id, input: { schoolId, sessionId, memberIds, notes } },
      {
        onSuccess: () => {
          toast(existing ? 'Team saved' : 'Team created')
          onClose()
        },
        onError: (error) => setServerError(toApiError(error)),
      },
    )
  }

  const changeSchool = (id: string) => {
    setSchoolId(id)
    const next = schools.find((s) => s.id === id)
    const free = next?.sessions.find((s) => !teams.some((t) => t.schoolId === id && t.sessionId === s.id && t.id !== existing?.id))
    setSessionId(free?.id ?? next?.sessions[0]?.id ?? '')
  }

  const sizeIssue = issues.find((i) => i.code === 'too_few' || i.code === 'too_many')
  const blocking = issues.filter((i) => i.code !== 'too_few' && i.code !== 'too_many')

  return (
    <>
      <div className="team-form">
        <div className="team-place">
          <SelectField label="School" value={schoolId} onChange={(e) => changeSchool(e.target.value)}>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Weekly session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            error={tried ? issues.find((i) => i.code === 'session_taken' || i.code === 'session_not_found')?.message : undefined}
          >
            {!session && <option value="">Choose a session</option>}
            {school?.sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={Boolean(takenBy(s.id))}>
                {dayName(s.day)} {formatRange(s.start, s.end)}
                {takenBy(s.id) ? ' (has a team)' : ''}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="team-columns">
          <section className="team-members" aria-labelledby="team-members-title">
            <div className="team-col-head">
              <h3 id="team-members-title" className="team-col-title">
                Team
              </h3>
              <span className={sizeIssue ? 'size-meter is-off' : 'size-meter'}>
                {memberIds.length} of {teamSizeText(semester.minTeamSize, semester.maxTeamSize).replace(' volunteers', '')}
              </span>
            </div>
            {memberIds.length === 0 ? (
              <p className="team-empty">Add volunteers from the list of who is free.</p>
            ) : (
              <ul className="person-list">
                {memberIds.map((id) => {
                  const candidate = byId(id)
                  const volunteer = candidate?.volunteer ?? volunteers.find((v) => v.id === id)
                  if (!volunteer) return null
                  const problems = candidate?.reasons ?? []
                  return (
                    <li key={id} className={problems.length ? 'person is-problem' : 'person'}>
                      <div className="person-text">
                        <div className="person-name">{fullName(volunteer)}</div>
                        <div className="person-meta">
                          {volunteer.major}, class of {volunteer.gradYear}
                        </div>
                        {problems.map((p) => (
                          <div key={p.message} className="person-reason">
                            <Icon name="alert" size={14} />
                            {p.message}
                          </div>
                        ))}
                      </div>
                      <button type="button" className="button button-small" onClick={() => drop(id)}>
                        Remove<span className="visually-hidden"> {fullName(volunteer)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <label className="field team-notes">
              <span className="field-label">Notes for the team</span>
              <textarea
                className="input textarea"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Room, parking, what to bring"
              />
            </label>
          </section>

          <section className="team-pool" aria-labelledby="team-pool-title">
            <div className="team-col-head">
              <h3 id="team-pool-title" className="team-col-title">
                Free for this session
              </h3>
              <span className="muted">{ranked ? ranked.available.length : 0} volunteers</span>
            </div>
            <div className="search search-small">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="input"
                placeholder="Search by name or major"
                aria-label="Search volunteers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!session ? (
              <p className="team-empty">Choose a weekly session to see who is free.</p>
            ) : (
              <div className="pool-scroll">
                {available.length === 0 && (
                  <p className="team-empty">{query ? 'No free volunteer matches the search.' : 'Everyone free is already on the team.'}</p>
                )}
                <ul className="person-list">
                  {available.map((c) => (
                    <li key={c.volunteer.id} className="person">
                      <div className="person-text">
                        <div className="person-name">{fullName(c.volunteer)}</div>
                        <div className="person-meta">
                          {dayShort(session.day)}: {freeText(c, session.day).replace('Free ', '')}. {teamsText(c.teamCount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => add(c.volunteer.id)}
                        disabled={full}
                        title={full ? 'The team is full' : undefined}
                      >
                        Add<span className="visually-hidden"> {fullName(c.volunteer)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {unavailable.length > 0 && (
                  <details className="unavailable">
                    <summary>
                      Not available ({unavailable.length})
                      <Icon name="chevronDown" size={16} />
                    </summary>
                    <ul className="person-list">
                      {unavailable.map((c) => (
                        <li key={c.volunteer.id} className="person is-muted">
                          <div className="person-text">
                            <div className="person-name">{fullName(c.volunteer)}</div>
                            {c.reasons.map((r) => (
                              <div key={r.message} className="person-meta">
                                {r.message}
                              </div>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="dialog-actions">
        {(tried && issues.length > 0) || serverError ? (
          <div className="dialog-actions-error">
            <InlineError>
              {serverError ? serverError.message : (blocking[0] ?? sizeIssue ?? issues[0]).message}
              {!serverError && issues.length > 1 && ` (${issues.length - 1} more to fix)`}
            </InlineError>
          </div>
        ) : null}
        <div className="dialog-actions-row">
          {existing && (
            <button type="button" className="button button-danger-quiet" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
              Delete team
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving...' : existing ? 'Save team' : 'Create team'}
          </button>
        </div>
      </div>

      {existing && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this team?"
          confirmLabel="Delete team"
          busy={remove.isPending}
          error={remove.error ? toApiError(remove.error).message : null}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.mutate(existing, {
              onSuccess: () => {
                toast('Team deleted')
                setConfirmDelete(false)
                onClose()
              },
            })
          }
        >
          {school?.name}, {session ? `${dayName(session.day)} ${formatRange(session.start, session.end)}` : ''} will have no
          team in {semester.name}. The volunteers stay in the program.
        </ConfirmDialog>
      )}
    </>
  )
}
