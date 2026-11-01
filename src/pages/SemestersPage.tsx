import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatDateRange, localIsoDate, semesterStatus, sortSemesters } from '../../shared/calendar'
import { teamSizeText } from '../../shared/schedule'
import type { Semester, Team } from '../../shared/types'
import { semesterInputSchema } from '../../shared/validation'
import { errorMessage, http, toApiError } from '../api/client'
import { keys, useDeleteSemester, useSaveSemester, useSemesters } from '../api/hooks'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { ConfirmDialog, Dialog, EmptyState, InlineError, LoadError, Loading, PageHeader, TextField } from '../components/ui'
import { useSchemaForm } from '../lib/form'

const STATUS = { current: 'In session', upcoming: 'Upcoming', past: 'Ended' } as const

export function SemestersPage() {
  const semesters = useSemesters()
  const list = sortSemesters(semesters.data ?? [])
  const counts = useQueries({
    queries: list.map((s) => ({
      queryKey: keys.teams(s.id),
      queryFn: async () => (await http.get<Team[]>('/teams', { params: { semesterId: s.id } })).data,
    })),
  })
  const [editing, setEditing] = useState<Semester | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Semester | null>(null)
  const remove = useDeleteSemester()
  const toast = useToast()
  const today = localIsoDate()

  return (
    <div className="page">
      <PageHeader
        title="Semesters"
        meta="Each semester has its own teams, team size and travel time."
        actions={
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            Add semester
          </button>
        }
      />

      {semesters.isError ? (
        <LoadError message={errorMessage(semesters.error)} onRetry={() => semesters.refetch()} />
      ) : semesters.isPending ? (
        <Loading label="Loading semesters" />
      ) : list.length === 0 ? (
        <EmptyState title="No semesters yet">Add the current semester to start building teams.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Semester</th>
                <th scope="col">Dates</th>
                <th scope="col">Team size</th>
                <th scope="col">Travel time</th>
                <th scope="col">Teams</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => {
                const status = semesterStatus(s, today)
                const teams = counts[i]?.data
                return (
                  <tr key={s.id}>
                    <td data-label="Semester">
                      <div className="cell-strong">{s.name}</div>
                      <span className={`status status-${status}`}>{STATUS[status]}</span>
                    </td>
                    <td data-label="Dates">{formatDateRange(s.startDate, s.endDate)}</td>
                    <td data-label="Team size">{teamSizeText(s.minTeamSize, s.maxTeamSize)}</td>
                    <td data-label="Travel time">{s.travelBufferMinutes} min each way</td>
                    <td data-label="Teams">
                      {teams === undefined ? (
                        <span className="muted">...</span>
                      ) : (
                        <Link to={`/teams?semester=${s.id}`}>{teams.length === 1 ? '1 team' : `${teams.length} teams`}</Link>
                      )}
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="button button-small" onClick={() => setEditing(s)}>
                        <Icon name="edit" size={15} />
                        Edit<span className="visually-hidden"> {s.name}</span>
                      </button>
                      <button type="button" className="icon-button" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
                        <Icon name="trash" size={17} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add semester' : 'Edit semester'} size="sm">
        {editing !== null && (
          <SemesterForm
            key={editing === 'new' ? 'new' : editing.id}
            semester={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={(message) => {
              setEditing(null)
              toast(message)
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'semester'}?`}
        confirmLabel="Delete semester"
        busy={remove.isPending}
        error={remove.error ? toApiError(remove.error).message : null}
        onClose={() => {
          setDeleting(null)
          remove.reset()
        }}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast('Semester deleted')
              setDeleting(null)
            },
          })
        }
      >
        All of its teams are deleted too. Schools and volunteers stay.
      </ConfirmDialog>
    </div>
  )
}

interface Draft {
  name: string
  startDate: string
  endDate: string
  minTeamSize: string
  maxTeamSize: string
  travelBufferMinutes: string
}

function SemesterForm({ semester, onDone, onCancel }: { semester: Semester | null; onDone: (message: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: semester?.name ?? '',
    startDate: semester?.startDate ?? '',
    endDate: semester?.endDate ?? '',
    minTeamSize: String(semester?.minTeamSize ?? 2),
    maxTeamSize: String(semester?.maxTeamSize ?? 4),
    travelBufferMinutes: String(semester?.travelBufferMinutes ?? 30),
  }))
  const numeric = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const form = useSchemaForm(semesterInputSchema, {
    ...draft,
    minTeamSize: numeric(draft.minTeamSize),
    maxTeamSize: numeric(draft.maxTeamSize),
    travelBufferMinutes: numeric(draft.travelBufferMinutes),
  })
  const save = useSaveSemester()
  const e = form.errors
  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const input = form.check()
        if (!input) return
        save.mutate({ id: semester?.id, input }, { onSuccess: () => onDone(semester ? 'Semester saved' : 'Semester added'), onError: form.fail })
      }}
    >
      <TextField label="Name" placeholder="Fall 2027" value={draft.name} onChange={(ev) => set('name', ev.target.value)} error={e.name} autoComplete="off" />
      <div className="form-row">
        <TextField label="First day" type="date" value={draft.startDate} onChange={(ev) => set('startDate', ev.target.value)} error={e.startDate} />
        <TextField label="Last day" type="date" value={draft.endDate} onChange={(ev) => set('endDate', ev.target.value)} error={e.endDate} />
      </div>
      <div className="form-row">
        <TextField label="Smallest team" type="number" min={1} max={6} inputMode="numeric" value={draft.minTeamSize} onChange={(ev) => set('minTeamSize', ev.target.value)} error={e.minTeamSize} />
        <TextField label="Largest team" type="number" min={1} max={8} inputMode="numeric" value={draft.maxTeamSize} onChange={(ev) => set('maxTeamSize', ev.target.value)} error={e.maxTeamSize} />
      </div>
      <TextField
        label="Travel time each way (minutes)"
        type="number"
        min={0}
        max={90}
        step={5}
        inputMode="numeric"
        value={draft.travelBufferMinutes}
        onChange={(ev) => set('travelBufferMinutes', ev.target.value)}
        error={e.travelBufferMinutes}
        hint="Volunteers must be free this long before and after a session, and between sessions at different schools."
      />
      {semester && <p className="field-hint">Changing team size or travel time does not change existing teams. The dashboard flags any that no longer fit.</p>}
      {form.serverError && !Object.keys(form.serverError.fields).length && <InlineError>{form.serverError.message}</InlineError>}
      <div className="dialog-actions">
        <div className="dialog-actions-row">
          <span className="spacer" />
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : semester ? 'Save semester' : 'Add semester'}
          </button>
        </div>
      </div>
    </form>
  )
}
