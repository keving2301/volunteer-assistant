import { useMemo, useState } from 'react'
import { dayName, dayShort, formatRange, formatTime, WEEKDAYS, type Weekday } from '../../shared/time'
import { GRADE_BANDS, GRADE_BAND_LABELS, type GradeBand, type School } from '../../shared/types'
import { schoolInputSchema } from '../../shared/validation'
import { errorMessage, toApiError } from '../api/client'
import { useDeleteSchool, useSaveSchool, useSchools } from '../api/hooks'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { ConfirmDialog, Dialog, EmptyState, InlineError, LoadError, Loading, PageHeader, SelectField, TextField } from '../components/ui'
import { useSchemaForm } from '../lib/form'

const TIME_OPTIONS = Array.from({ length: (1200 - 420) / 15 + 1 }, (_, i) => 420 + i * 15)

interface SessionDraft {
  id?: string
  day: Weekday
  start: number
  end: number
}

interface SchoolDraft {
  name: string
  address: { street: string; city: string; state: string; zip: string }
  contact: { name: string; title: string; email: string; phone: string }
  gradeBands: GradeBand[]
  sessions: SessionDraft[]
}

const EMPTY: SchoolDraft = {
  name: '',
  address: { street: '', city: '', state: 'MD', zip: '' },
  contact: { name: '', title: '', email: '', phone: '' },
  gradeBands: [],
  sessions: [{ day: 2, start: 900, end: 960 }],
}

function draftOf(school: School): SchoolDraft {
  return {
    name: school.name,
    address: { ...school.address },
    contact: { ...school.contact },
    gradeBands: [...school.gradeBands],
    sessions: school.sessions.map((s) => ({ ...s })),
  }
}

export function SchoolsPage() {
  const schools = useSchools()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<School | 'new' | null>(null)
  const [deleting, setDeleting] = useState<School | null>(null)
  const remove = useDeleteSchool()
  const toast = useToast()

  const query = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      (schools.data ?? []).filter(
        (s) =>
          !query ||
          s.name.toLowerCase().includes(query) ||
          s.address.city.toLowerCase().includes(query) ||
          s.contact.name.toLowerCase().includes(query),
      ),
    [schools.data, query],
  )

  return (
    <div className="page">
      <PageHeader
        title="Schools"
        meta={schools.data ? `${schools.data.length} schools, ${schools.data.reduce((n, s) => n + s.sessions.length, 0)} weekly sessions` : undefined}
        actions={
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            Add school
          </button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            className="input"
            placeholder="Search by school, city or contact"
            aria-label="Search schools"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {schools.isError ? (
        <LoadError message={errorMessage(schools.error)} onRetry={() => schools.refetch()} />
      ) : schools.isPending ? (
        <Loading label="Loading schools" />
      ) : schools.data.length === 0 ? (
        <EmptyState
          title="No schools yet"
          action={
            <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
              Add school
            </button>
          }
        >
          Add the schools that host the program and the weekly times they meet.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="No school matches the search">Try a shorter name or a city.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">School</th>
                <th scope="col">Address</th>
                <th scope="col">Weekly sessions</th>
                <th scope="col">Contact</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((school) => (
                <tr key={school.id}>
                  <td data-label="School">
                    <div className="cell-strong">{school.name}</div>
                    <div className="cell-sub">Grades {school.gradeBands.join(', ')}</div>
                  </td>
                  <td data-label="Address">
                    <div>{school.address.street}</div>
                    <div className="cell-sub">
                      {school.address.city}, {school.address.state} {school.address.zip}
                    </div>
                  </td>
                  <td data-label="Weekly sessions">
                    <ul className="chips">
                      {school.sessions
                        .slice()
                        .sort((a, b) => a.day - b.day || a.start - b.start)
                        .map((s) => (
                          <li key={s.id} className="chip">
                            {dayShort(s.day)} {formatRange(s.start, s.end)}
                          </li>
                        ))}
                    </ul>
                  </td>
                  <td data-label="Contact">
                    <div>{school.contact.name}</div>
                    <div className="cell-sub">{school.contact.phone}</div>
                  </td>
                  <td className="cell-actions">
                    <button type="button" className="button button-small" onClick={() => setEditing(school)}>
                      <Icon name="edit" size={15} />
                      Edit<span className="visually-hidden"> {school.name}</span>
                    </button>
                    <button type="button" className="icon-button" onClick={() => setDeleting(school)} aria-label={`Delete ${school.name}`}>
                      <Icon name="trash" size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add school' : 'Edit school'}
        size="md"
      >
        {editing !== null && (
          <SchoolForm
            key={editing === 'new' ? 'new' : editing.id}
            school={editing === 'new' ? null : editing}
            onDone={(message) => {
              setEditing(null)
              toast(message)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'school'}?`}
        confirmLabel="Delete school"
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
              toast('School deleted')
              setDeleting(null)
            },
          })
        }
      >
        Its teams in every semester are deleted too. The volunteers on them stay in the program.
      </ConfirmDialog>
    </div>
  )
}

function SchoolForm({ school, onDone, onCancel }: { school: School | null; onDone: (message: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<SchoolDraft>(() => (school ? draftOf(school) : EMPTY))
  const form = useSchemaForm(schoolInputSchema, draft)
  const save = useSaveSchool()
  const e = form.errors

  const set = <K extends keyof SchoolDraft>(key: K, value: SchoolDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setAddress = (key: keyof SchoolDraft['address'], value: string) =>
    setDraft((d) => ({ ...d, address: { ...d.address, [key]: value } }))
  const setContact = (key: keyof SchoolDraft['contact'], value: string) => {
    form.clearServerField(`contact.${key}`)
    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }))
  }
  const setSession = (index: number, patch: Partial<SessionDraft>) =>
    setDraft((d) => ({ ...d, sessions: d.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s)) }))

  const submit = () => {
    const input = form.check()
    if (!input) return
    save.mutate(
      { id: school?.id, input },
      { onSuccess: () => onDone(school ? 'School saved' : 'School added'), onError: form.fail },
    )
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <TextField label="School name" value={draft.name} onChange={(ev) => set('name', ev.target.value)} error={e.name} autoComplete="off" />

      <fieldset className="fieldset">
        <legend className="field-label">Grade levels</legend>
        <div className="checks">
          {GRADE_BANDS.map((band) => (
            <label key={band} className="check">
              <input
                type="checkbox"
                checked={draft.gradeBands.includes(band)}
                onChange={(ev) =>
                  set('gradeBands', ev.target.checked ? [...draft.gradeBands, band] : draft.gradeBands.filter((b) => b !== band))
                }
              />
              <span>{GRADE_BAND_LABELS[band]}</span>
            </label>
          ))}
        </div>
        {e.gradeBands && <p className="field-error">{e.gradeBands}</p>}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="form-section">Address</legend>
        <TextField label="Street" value={draft.address.street} onChange={(ev) => setAddress('street', ev.target.value)} error={e['address.street']} autoComplete="off" />
        <div className="form-row form-row-address">
          <TextField label="City" value={draft.address.city} onChange={(ev) => setAddress('city', ev.target.value)} error={e['address.city']} autoComplete="off" />
          <TextField label="State" value={draft.address.state} maxLength={2} onChange={(ev) => setAddress('state', ev.target.value.toUpperCase())} error={e['address.state']} autoComplete="off" />
          <TextField label="ZIP code" value={draft.address.zip} inputMode="numeric" maxLength={5} onChange={(ev) => setAddress('zip', ev.target.value)} error={e['address.zip']} autoComplete="off" />
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="form-section">School contact</legend>
        <div className="form-row">
          <TextField label="Name" value={draft.contact.name} onChange={(ev) => setContact('name', ev.target.value)} error={e['contact.name']} autoComplete="off" />
          <TextField label="Title" hint="Optional" value={draft.contact.title} onChange={(ev) => setContact('title', ev.target.value)} error={e['contact.title']} autoComplete="off" />
        </div>
        <div className="form-row">
          <TextField label="Email" type="email" value={draft.contact.email} onChange={(ev) => setContact('email', ev.target.value)} error={e['contact.email']} autoComplete="off" />
          <TextField label="Phone" type="tel" value={draft.contact.phone} onChange={(ev) => setContact('phone', ev.target.value)} error={e['contact.phone']} autoComplete="off" />
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="form-section">Weekly sessions</legend>
        <p className="field-hint">The days and times the school hosts the program. Each one gets its own team every semester.</p>
        <ul className="session-rows">
          {draft.sessions.map((s, index) => (
            <li key={s.id ?? `new-${index}`} className="session-row">
              <SelectField label="Day" value={s.day} onChange={(ev) => setSession(index, { day: Number(ev.target.value) as Weekday })}>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {dayName(d)}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Starts" value={s.start} onChange={(ev) => setSession(index, { start: Number(ev.target.value) })} error={e[`sessions.${index}.start`]}>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {formatTime(t)}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Ends" value={s.end} onChange={(ev) => setSession(index, { end: Number(ev.target.value) })} error={e[`sessions.${index}.end`]}>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {formatTime(t)}
                  </option>
                ))}
              </SelectField>
              <button
                type="button"
                className="icon-button session-remove"
                onClick={() => set('sessions', draft.sessions.filter((_, i) => i !== index))}
                aria-label={`Remove ${dayName(s.day)} session`}
              >
                <Icon name="trash" size={17} />
              </button>
            </li>
          ))}
        </ul>
        {e.sessions && <p className="field-error">{e.sessions}</p>}
        {draft.sessions.length < 6 && (
          <button
            type="button"
            className="button button-small"
            onClick={() => set('sessions', [...draft.sessions, { day: 3, start: 900, end: 960 }])}
          >
            <Icon name="plus" size={15} />
            Add session
          </button>
        )}
      </fieldset>

      {form.serverError && !Object.keys(form.serverError.fields).length && <InlineError>{form.serverError.message}</InlineError>}
      {form.serverError?.code === 'session_in_use' && <InlineError>{form.serverError.message}</InlineError>}

      <div className="dialog-actions">
        <div className="dialog-actions-row">
          <span className="spacer" />
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : school ? 'Save school' : 'Add school'}
          </button>
        </div>
      </div>
    </form>
  )
}
