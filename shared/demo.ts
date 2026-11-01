// The two demo accounts. Their passwords are shown on the sign-in page on purpose: anyone may try the demo, and each
// sign-in gets a private copy of the demo data, so nothing a visitor does reaches anyone else.

import type { Role } from './types'

export interface DemoAccount {
  role: Role
  label: string
  email: string
  password: string
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: 'coordinator', label: 'Coordinator', email: 'demo.coordinator@example.com', password: 'Coordinate-2026' },
  { role: 'volunteer', label: 'Volunteer', email: 'demo.volunteer@example.com', password: 'Volunteer-2026' },
]

export function demoAccountFor(email: string, password: string): DemoAccount | null {
  const normalized = email.trim().toLowerCase()
  return DEMO_ACCOUNTS.find((a) => a.email === normalized && a.password === password) ?? null
}

/** A workspace lives for 24 hours from the sign-in that created it. */
export const WORKSPACE_TTL_HOURS = 24

/** Upper bounds per workspace, so one visitor cannot grow the database without limit. */
export const WORKSPACE_LIMITS = {
  schools: 30,
  volunteers: 120,
  teams: 200,
  semesters: 12,
} as const

export type LimitedCollection = keyof typeof WORKSPACE_LIMITS

export const PROGRAM_NAME = 'Code Outreach'
