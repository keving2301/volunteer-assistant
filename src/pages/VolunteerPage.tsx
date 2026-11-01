import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { localIsoDate, semesterStatus, sortSemesters } from '../../shared/calendar'
import { availabilityReason, findPlacement } from '../../shared/schedule'
import { dayName, formatRange } from '../../shared/time'
import { fullName, shortSchoolName, type Team } from '../../shared/types'
import { errorMessage, http, toApiError } from '../api/client'
import { keys, useDeleteVolunteer, useSchools, useSemesters, useSession, useVolunteers } from '../api/hooks'
import { AvailabilityGrid, AvailabilitySummary, useIsPhone, type GridMarker } from '../components/Availability'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { ConfirmDialog, Dialog, EmptyState, LoadError, Loading, PageHeader } from '../components/ui'
import { VolunteerForm } from './VolunteerForm'

export function VolunteerPage() {
  const { id } = useParams()
  const session = useSession()
  const volunteers = useVolunteers()
  const schools = useSchools()
  const semesters = useSemesters()
  const list = sortSemesters(semesters.data ?? [])
  const teamQueries = useQueries({
    queries: list.map((s) => ({
      queryKey: keys.teams(s.id),
      queryFn: async () => (await http.get<Team[]>('/teams', { params: { semesterId: s.id } })).data,
    })),
  })
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useDeleteVolunteer()
  const navigate = useNavigate()
  const toast = useToast()
  const isPhone = useIsPhone()
  const today = localIsoDate()

  const back = (
    <Link to="/volunteers" className="back-link">
      <Icon name="arrowLeft" size={16} />
      Volunteers
    </Link>
  )

  if (volunteers.isError) return <LoadError message={errorMessage(volunteers.error)} onRetry={() => volunteers.refetch()} />
  if (volunteers.isPending || schools.isPending || semesters.isPending) return <Loading label="Loading volunteer" />
  const volunteer = volunteers.data.find((v) => v.id === id)
  if (!volunteer) {
    return (
      <div className="page">
        <PageHeader title="Volunteer not found" back={back} />
        <EmptyState title="This volunteer is not in the program">They may have been removed. Go back to the list to find someone else.</EmptyState>
      </div>
    )
  }

  const isDemoAccount = volunteer.id === session.data?.demoVolunteerId
  const placements = list.flatMap((semester, i) => {
    const teams = teamQueries[i]?.data ?? []
    return teams
      .filter((t) => t.memberIds.includes(volunteer.id))
      .map((team) => ({ team, semester, place: findPlacement(schools.data ?? [], team.schoolId, team.sessionId) }))
      .filter((x) => x.place)
  })
  const current = placements.filter((p) => semesterStatus(p.semester, today) !== 'past')
  const markers: GridMarker[] = current
    .filter((p) => semesterStatus(p.semester, today) === 'current')
    .map((p) => ({ day: p.place!.session.day, start: p.place!.session.start, end: p.place!.session.end, label: shortSchoolName(p.place!.school.name) }))

  return (
    <div className="page">
      <PageHeader
        title={fullName(volunteer)}
        back={back}
        meta={`${volunteer.major}, class of ${volunteer.gradYear}`}
        actions={
          <>
            <button type="button" className="button" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} />
              Edit
            </button>
            <button
              type="button"
              className="button button-danger-quiet"
              onClick={() => setDeleting(true)}
              disabled={isDemoAccount}
              aria-describedby={isDemoAccount ? 'demo-delete-note' : undefined}
            >
              <Icon name="trash" size={16} />
              Delete
            </button>
          </>
        }
      />
      {isDemoAccount && (
        <p id="demo-delete-note" className="demo-inline-note">
          <Icon name="lock" size={14} />
          {volunteer.firstName} is the demo volunteer account. Deleting is not available for this account in the demo.
        </p>
      )}

      <div className="detail-grid">
        <section className="panel" aria-labelledby="contact-title">
          <h2 id="contact-title" className="panel-title">
            Contact
          </h2>
          <ul className="contact-list">
            <li>
              <Icon name="mail" size={16} />
              <a href={`mailto:${volunteer.email}`}>{volunteer.email}</a>
            </li>
            <li>
              <Icon name="phone" size={16} />
              <a href={`tel:${volunteer.phone.replace(/\D/g, '')}`}>{volunteer.phone}</a>
            </li>
          </ul>

          <h2 className="panel-title panel-title-spaced">Teams</h2>
          {placements.length === 0 ? (
            <p className="muted">Not on a team in any semester.</p>
          ) : (
            <ul className="placement-list">
              {placements.map(({ team, semester, place }) => {
                const status = semesterStatus(semester, today)
                const reason = status !== 'past' ? availabilityReason(volunteer, place!.session, semester.travelBufferMinutes) : null
                return (
                  <li key={team.id} className="placement">
                    <div className="placement-what">{place!.school.name}</div>
                    <div className="placement-when">
                      {dayName(place!.session.day)} {formatRange(place!.session.start, place!.session.end)}, {semester.name}
                      {status === 'past' ? ' (ended)' : ''}
                    </div>
                    {reason && (
                      <div className="person-reason">
                        <Icon name="alert" size={14} />
                        No longer free. {reason.message}.
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="availability-title">
          <h2 id="availability-title" className="panel-title">
            Weekly availability
          </h2>
          <p className="panel-text">Set by {volunteer.firstName}. Outlined times are their teams this semester.</p>
          {isPhone ? <AvailabilitySummary value={volunteer.availability} /> : <AvailabilityGrid value={volunteer.availability} markers={markers} label={`${fullName(volunteer)}'s weekly availability`} />}
        </section>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit volunteer">
        {editing && (
          <VolunteerForm
            volunteer={volunteer}
            isDemoAccount={isDemoAccount}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false)
              toast('Volunteer saved')
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting}
        title={`Remove ${fullName(volunteer)}?`}
        confirmLabel="Remove volunteer"
        busy={remove.isPending}
        error={remove.error ? toApiError(remove.error).message : null}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(volunteer.id, {
            onSuccess: () => {
              toast(`${fullName(volunteer)} removed`)
              navigate('/volunteers')
            },
          })
        }
      >
        {current.length
          ? `They come off ${current.length === 1 ? 'their team' : `their ${current.length} teams`}, and the dashboard will show any team left short.`
          : 'They are not on any current team.'}
      </ConfirmDialog>
    </div>
  )
}
