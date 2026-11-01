import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import type { Role, SessionInfo } from '../../shared/types'
import { errorMessage } from '../api/client'
import { useSignOut, useSwitchRole } from '../api/hooks'
import { homeFor } from '../app/session'
import { Icon, type IconName } from './Icon'
import { useToast } from './Toast'

const NAV: Record<Role, { to: string; label: string; icon: IconName }[]> = {
  coordinator: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/teams', label: 'Teams', icon: 'teams' },
    { to: '/schools', label: 'Schools', icon: 'school' },
    { to: '/volunteers', label: 'Volunteers', icon: 'volunteers' },
    { to: '/semesters', label: 'Semesters', icon: 'calendar' },
  ],
  volunteer: [
    { to: '/my-week', label: 'My week', icon: 'calendar' },
    { to: '/availability', label: 'Availability', icon: 'clock' },
    { to: '/profile', label: 'Profile', icon: 'user' },
  ],
}

const ROLE_LABEL: Record<Role, string> = { coordinator: 'Coordinator', volunteer: 'Volunteer' }

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--mark-bg)" />
      <path
        d="M12.5 10.5 7 16l5.5 5.5M19.5 10.5 25 16l-5.5 5.5"
        fill="none"
        stroke="var(--mark-fg)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function expiryText(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = date.toLocaleDateString('en-US', { weekday: 'long' })
  return `${day} at ${time}`
}

function SidebarContent({ session, onNavigate }: { session: SessionInfo; onNavigate?: () => void }) {
  const switchRole = useSwitchRole()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const toast = useToast()
  const other: Role = session.role === 'coordinator' ? 'volunteer' : 'coordinator'

  return (
    <div className="sidebar-inner">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">Code Outreach</div>
          <div className="brand-sub">Volunteer scheduling</div>
        </div>
      </div>

      <nav className="nav" aria-label="Main">
        {NAV[session.role].map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-link" onClick={onNavigate}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="account">
        <div className="account-who">
          <div className="account-name">{session.name}</div>
          <div className="account-role">{ROLE_LABEL[session.role]}</div>
        </div>
        <button
          type="button"
          className="side-button"
          disabled={switchRole.isPending}
          onClick={() =>
            switchRole.mutate(other, {
              onSuccess: (info) => {
                onNavigate?.()
                navigate(homeFor(info.role))
              },
              onError: (error) => toast(errorMessage(error), 'error'),
            })
          }
        >
          <Icon name="swap" />
          <span>{switchRole.isPending ? 'Switching...' : `View as ${other === 'volunteer' ? 'the volunteer' : 'the coordinator'}`}</span>
        </button>
        <button
          type="button"
          className="side-button"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate(undefined, { onSettled: () => navigate('/signin', { replace: true }) })}
        >
          <Icon name="signOut" />
          <span>Sign out</span>
        </button>
        <p className="demo-note">
          Demo workspace. Your changes are private to you and deleted {expiryText(session.workspace.expiresAt)}.
        </p>
      </div>
    </div>
  )
}

export function AppShell({ session, children }: { session: SessionInfo; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    const d = drawer.current
    if (!d) return
    if (menuOpen && !d.open) d.showModal()
    if (!menuOpen && d.open) d.close()
  }, [menuOpen])

  // A new page starts at the top, with focus on the main region for keyboard and screen reader users.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <SidebarContent session={session} />
      </aside>

      <header className="topbar">
        <div className="brand">
          <BrandMark size={28} />
          <div className="brand-name">Code Outreach</div>
        </div>
        <button type="button" className="topbar-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icon name="menu" size={22} />
        </button>
      </header>

      <dialog
        ref={drawer}
        className="drawer"
        aria-label="Menu"
        onCancel={(event) => {
          event.preventDefault()
          setMenuOpen(false)
        }}
        onClick={(event) => {
          if (event.target === drawer.current) setMenuOpen(false)
        }}
      >
        {menuOpen && (
          <div className="drawer-panel">
            <button type="button" className="drawer-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <Icon name="close" size={22} />
            </button>
            <SidebarContent session={session} onNavigate={() => setMenuOpen(false)} />
          </div>
        )}
      </dialog>

      <main id="main" ref={main} className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
