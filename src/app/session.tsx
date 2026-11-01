import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '../../shared/types'
import { useSession } from '../api/hooks'
import { AppShell } from '../components/AppShell'
import { LoadError, Loading } from '../components/ui'

const PAGES: Record<Role, string[]> = {
  coordinator: ['/dashboard', '/teams', '/schools', '/volunteers', '/semesters'],
  volunteer: ['/my-week', '/availability', '/profile'],
}

export function homeFor(role: Role): string {
  return role === 'coordinator' ? '/dashboard' : '/my-week'
}

/** Where to go after signing in: the page the visitor asked for, when their role can open it. */
export function landingFor(role: Role, from: string | undefined): string {
  if (from && PAGES[role].some((p) => from === p || from.startsWith(`${p}/`) || from.startsWith(`${p}?`))) return from
  return homeFor(role)
}

const LOST_KEY = 'vas:session-lost'

export function rememberSessionLost(code: string) {
  try {
    sessionStorage.setItem(LOST_KEY, code)
  } catch {
    // Storage can be blocked; the sign-in page then shows no reason, which is fine.
  }
}

export function takeSessionLost(): string | null {
  try {
    const code = sessionStorage.getItem(LOST_KEY)
    sessionStorage.removeItem(LOST_KEY)
    return code
  } catch {
    return null
  }
}

export function RequireSession() {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) {
    return (
      <div className="boot">
        <Loading label="Opening your workspace" />
      </div>
    )
  }
  if (session.isError) {
    return (
      <div className="boot">
        <LoadError message="Could not reach the server." onRetry={() => session.refetch()} />
      </div>
    )
  }
  if (!session.data) {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  }
  return (
    <AppShell session={session.data}>
      <Outlet />
    </AppShell>
  )
}

export function RequireRole({ role }: { role: Role }) {
  const { data } = useSession()
  if (data && data.role !== role) return <Navigate to={homeFor(data.role)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { data } = useSession()
  return <Navigate to={homeFor(data?.role ?? 'coordinator')} replace />
}
