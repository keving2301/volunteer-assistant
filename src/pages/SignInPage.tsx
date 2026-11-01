import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { DEMO_ACCOUNTS, type DemoAccount } from '../../shared/demo'
import type { Role } from '../../shared/types'
import { toApiError, type ApiError } from '../api/client'
import { useDemoSignIn, useSession } from '../api/hooks'
import { landingFor, takeSessionLost } from '../app/session'
import { BrandMark } from '../components/AppShell'
import { InlineError, Notice, TextField } from '../components/ui'

const account = (role: Role): DemoAccount => DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[0]

export function SignInPage() {
  const session = useSession()
  const signIn = useDemoSignIn()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [lost] = useState(() => takeSessionLost())
  const [role, setRole] = useState<Role>('coordinator')
  const [email, setEmail] = useState(account('coordinator').email)
  const [password, setPassword] = useState(account('coordinator').password)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    document.title = 'Sign in | Code Outreach'
    // A password manager may fill a saved login as the page loads; the prefilled account wins.
    const id = window.setTimeout(() => {
      setEmail(account('coordinator').email)
      setPassword(account('coordinator').password)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  if (session.data) return <Navigate to={landingFor(session.data.role, from)} replace />

  const choose = (next: Role) => {
    setRole(next)
    setEmail(account(next).email)
    setPassword(account(next).password)
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (signIn.isPending) return
    setError(null)
    signIn.mutate(
      { email, password },
      {
        onSuccess: (info) => navigate(landingFor(info.role, from), { replace: true }),
        onError: (err) => setError(toApiError(err)),
      },
    )
  }

  return (
    <main className="signin">
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
          <Notice>Your workspace was deleted after 24 hours. Sign in to start a new one.</Notice>
        )}
        {lost === 'no_session' && <Notice>Your session ended. Sign in to continue.</Notice>}

        <form className="signin-form" onSubmit={submit} noValidate aria-labelledby="signin-title">
          <h2 id="signin-title" className="signin-form-title">
            Sign in
          </h2>
          <div className="role-switch" role="radiogroup" aria-label="Account type">
            {DEMO_ACCOUNTS.map((a) => (
              <label key={a.role} className="role-option">
                <input
                  type="radio"
                  name="role"
                  value={a.role}
                  checked={role === a.role}
                  onChange={() => choose(a.role)}
                  disabled={signIn.isPending}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
          <TextField
            label="Email"
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error?.fields.email}
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error?.code === 'invalid_credentials' ? error.message : error?.fields.password}
          />
          {error && error.code !== 'invalid_credentials' && <InlineError>{error.message}</InlineError>}
          <button
            type="submit"
            className="button button-primary button-block button-large"
            disabled={signIn.isPending}
            aria-busy={signIn.isPending || undefined}
          >
            {signIn.isPending ? <span className="button-busy">Signing in</span> : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
