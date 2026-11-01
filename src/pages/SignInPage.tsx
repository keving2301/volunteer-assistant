import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { DEMO_ACCOUNTS } from '../../shared/demo'
import type { Role } from '../../shared/types'
import { toApiError, type ApiError } from '../api/client'
import { useDemoSignIn, useSession } from '../api/hooks'
import { landingFor, takeSessionLost } from '../app/session'
import { BrandMark } from '../components/AppShell'
import { InlineError, Notice, TextField } from '../components/ui'

const ROLE_BUTTON: Record<Role, string> = {
  coordinator: 'Sign in as the coordinator',
  volunteer: 'Sign in as the volunteer',
}

const ROLE_SUMMARY: Record<Role, string> = {
  coordinator: 'Schools, volunteers, semesters, and the weekly teams.',
  volunteer: "Jordan Ellis's week, availability and profile.",
}

export function SignInPage() {
  const session = useSession()
  const signIn = useDemoSignIn()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [lost] = useState(() => takeSessionLost())
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email)
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password)
  const [pending, setPending] = useState<'form' | Role | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    document.title = 'Sign in | Code Outreach'
  }, [])

  if (session.data) return <Navigate to={landingFor(session.data.role, from)} replace />

  const go = (input: { role: Role } | { email: string; password: string }, which: 'form' | Role) => {
    setPending(which)
    setError(null)
    signIn.mutate(input, {
      onSuccess: (info) => navigate(landingFor(info.role, from), { replace: true }),
      onError: (err) => {
        setError(toApiError(err))
        setPending(null)
      },
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    go({ email, password }, 'form')
  }

  const busy = pending !== null

  return (
    <div className="signin">
      <div className="signin-intro">
        <div className="brand brand-large">
          <BrandMark size={40} />
          <div>
            <div className="brand-name">Code Outreach</div>
            <div className="brand-sub">Volunteer scheduling</div>
          </div>
        </div>
        <h1 className="signin-title">Build each school's volunteer team from who is free that afternoon.</h1>
        <p className="signin-lead">
          University students teach coding at local schools. Coordinators keep the schools and their weekly sessions,
          volunteers give the hours they are free, and each session gets a team that can make it there and back.
        </p>
      </div>

      <div className="signin-panel">
        {lost === 'workspace_expired' && (
          <Notice>Your demo workspace was deleted after 24 hours. Sign in to start a new one.</Notice>
        )}
        {lost === 'no_session' && <Notice>Your session ended. Sign in to continue.</Notice>}

        <section className="demo-access" aria-labelledby="demo-access-title">
          <h2 id="demo-access-title" className="demo-access-title">
            Demo access
          </h2>
          <p className="demo-access-text">
            The schools, volunteers and teams are fictional. Each sign-in gets its own copy of the demo data, deleted
            after 24 hours, so change anything you like.
          </p>
          <ul className="demo-accounts">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.role} className="demo-account">
                <div className="demo-account-text">
                  <div className="demo-account-role">{account.label}</div>
                  <div className="demo-account-summary">{ROLE_SUMMARY[account.role]}</div>
                  <dl className="demo-credentials">
                    <div>
                      <dt>Email</dt>
                      <dd>{account.email}</dd>
                    </div>
                    <div>
                      <dt>Password</dt>
                      <dd>{account.password}</dd>
                    </div>
                  </dl>
                </div>
                <button
                  type="button"
                  className="button button-primary demo-account-button"
                  onClick={() => go({ role: account.role }, account.role)}
                  disabled={busy}
                >
                  {pending === account.role ? 'Preparing your workspace...' : ROLE_BUTTON[account.role]}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <form className="signin-form" onSubmit={submit} noValidate>
          <h2 className="signin-form-title">Sign in with email</h2>
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error?.fields.email}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error?.code === 'invalid_credentials' ? error.message : error?.fields.password}
          />
          {error && error.code !== 'invalid_credentials' && <InlineError>{error.message}</InlineError>}
          <button type="submit" className="button button-block" disabled={busy}>
            {pending === 'form' ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
