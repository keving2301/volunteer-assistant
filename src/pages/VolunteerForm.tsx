import { useState } from 'react'
import type { Volunteer } from '../../shared/types'
import { volunteerInputSchema } from '../../shared/validation'
import { useSaveVolunteer } from '../api/hooks'
import { InlineError, TextField } from '../components/ui'
import { useSchemaForm } from '../lib/form'

interface Draft {
  firstName: string
  lastName: string
  email: string
  phone: string
  major: string
  gradYear: number | ''
}

/** Contact details a coordinator keeps for a volunteer. Availability belongs to the volunteer, who sets it. */
export function VolunteerForm({
  volunteer,
  isDemoAccount = false,
  onDone,
  onCancel,
}: {
  volunteer: Volunteer | null
  isDemoAccount?: boolean
  onDone: (saved: Volunteer) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    volunteer
      ? {
          firstName: volunteer.firstName,
          lastName: volunteer.lastName,
          email: volunteer.email,
          phone: volunteer.phone,
          major: volunteer.major,
          gradYear: volunteer.gradYear,
        }
      : { firstName: '', lastName: '', email: '', phone: '', major: '', gradYear: '' },
  )
  const form = useSchemaForm(volunteerInputSchema, { ...draft, gradYear: draft.gradYear === '' ? undefined : draft.gradYear })
  const save = useSaveVolunteer()
  const e = form.errors
  const set = (key: keyof Draft, value: string | number) => {
    form.clearServerField(key)
    setDraft((d) => ({ ...d, [key]: value }))
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const input = form.check()
        if (!input) return
        save.mutate({ id: volunteer?.id, input }, { onSuccess: onDone, onError: form.fail })
      }}
    >
      <div className="form-row">
        <TextField label="First name" value={draft.firstName} onChange={(ev) => set('firstName', ev.target.value)} error={e.firstName} autoComplete="off" />
        <TextField label="Last name" value={draft.lastName} onChange={(ev) => set('lastName', ev.target.value)} error={e.lastName} autoComplete="off" />
      </div>
      <TextField
        label="Email"
        type="email"
        value={draft.email}
        onChange={(ev) => set('email', ev.target.value)}
        error={e.email}
        readOnly={isDemoAccount}
        hint={isDemoAccount ? 'This is the demo volunteer account sign-in, so the email stays the same in the demo.' : undefined}
        autoComplete="off"
      />
      <TextField label="Phone" type="tel" value={draft.phone} onChange={(ev) => set('phone', ev.target.value)} error={e.phone} autoComplete="off" />
      <div className="form-row">
        <TextField label="Major" value={draft.major} onChange={(ev) => set('major', ev.target.value)} error={e.major} autoComplete="off" />
        <TextField
          label="Graduation year"
          inputMode="numeric"
          value={draft.gradYear}
          onChange={(ev) => set('gradYear', ev.target.value === '' ? '' : Number(ev.target.value.replace(/\D/g, '').slice(0, 4)))}
          error={e.gradYear}
          autoComplete="off"
        />
      </div>
      {form.serverError && !Object.keys(form.serverError.fields).length && <InlineError>{form.serverError.message}</InlineError>}
      <div className="dialog-actions">
        <div className="dialog-actions-row">
          <span className="spacer" />
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : volunteer ? 'Save volunteer' : 'Add volunteer'}
          </button>
        </div>
      </div>
    </form>
  )
}
