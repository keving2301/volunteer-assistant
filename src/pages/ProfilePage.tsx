import { useState } from 'react'
import { fullName, type Volunteer } from '../../shared/types'
import { profileInputSchema } from '../../shared/validation'
import { errorMessage } from '../api/client'
import { useMe, useSaveProfile } from '../api/hooks'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { InlineError, LoadError, Loading, PageHeader, TextField } from '../components/ui'
import { useSchemaForm } from '../lib/form'

export function ProfilePage() {
  const me = useMe()
  if (me.isError) return <LoadError message={errorMessage(me.error)} onRetry={() => me.refetch()} />
  if (me.isPending) return <Loading label="Loading your profile" />
  return <ProfileForm key={me.data.updatedAt} me={me.data} />
}

function ProfileForm({ me }: { me: Volunteer }) {
  const [draft, setDraft] = useState({
    firstName: me.firstName,
    lastName: me.lastName,
    phone: me.phone,
    major: me.major,
    gradYear: String(me.gradYear),
  })
  const form = useSchemaForm(profileInputSchema, { ...draft, gradYear: draft.gradYear ? Number(draft.gradYear) : undefined })
  const save = useSaveProfile()
  const toast = useToast()
  const e = form.errors
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div className="page page-narrow">
      <PageHeader title="Profile" meta="Coordinators and your teammates see your name. Coordinators also see your phone." />
      <form
        className="panel form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const input = form.check()
          if (!input) return
          save.mutate(input, { onSuccess: (saved) => toast(`Saved, ${fullName(saved).split(' ')[0]}`), onError: form.fail })
        }}
      >
        <div className="form-row">
          <TextField label="First name" value={draft.firstName} onChange={(ev) => set('firstName', ev.target.value)} error={e.firstName} autoComplete="given-name" />
          <TextField label="Last name" value={draft.lastName} onChange={(ev) => set('lastName', ev.target.value)} error={e.lastName} autoComplete="family-name" />
        </div>
        <TextField
          label="Email"
          type="email"
          value={me.email}
          readOnly
          hint={
            <span className="hint-with-icon">
              <Icon name="lock" size={13} />
              Your email is the demo account sign-in. Changing it is not available in the demo.
            </span>
          }
        />
        <TextField label="Phone" type="tel" value={draft.phone} onChange={(ev) => set('phone', ev.target.value)} error={e.phone} autoComplete="tel" />
        <div className="form-row">
          <TextField label="Major" value={draft.major} onChange={(ev) => set('major', ev.target.value)} error={e.major} />
          <TextField label="Graduation year" inputMode="numeric" maxLength={4} value={draft.gradYear} onChange={(ev) => set('gradYear', ev.target.value.replace(/\D/g, ''))} error={e.gradYear} />
        </div>
        {form.serverError && !Object.keys(form.serverError.fields).length && <InlineError>{form.serverError.message}</InlineError>}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
