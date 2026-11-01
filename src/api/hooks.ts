import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import type { TimeRange } from '../../shared/time'
import type { MyTeam, Role, School, Semester, SessionInfo, Team, Volunteer } from '../../shared/types'
import type { ProfileInput, SchoolInput, SemesterInput, VolunteerInput } from '../../shared/validation'
import { http } from './client'

export const keys = {
  session: ['session'] as const,
  semesters: ['semesters'] as const,
  schools: ['schools'] as const,
  volunteers: ['volunteers'] as const,
  teams: (semesterId: string) => ['teams', semesterId] as const,
  allTeams: ['teams'] as const,
  me: ['me'] as const,
  myTeams: ['me', 'teams'] as const,
}

const get = async <T>(url: string, params?: Record<string, string>) => (await http.get<T>(url, { params })).data

/** The server sets a readable `vas_signed_in` cookie next to the HTTP-only session. Without it there is no session to
 * ask about, so a signed-out visitor gets the sign-in page without waiting for the API. */
function mayHaveSession(): boolean {
  return document.cookie.split(';').some((c) => c.trim() === 'vas_signed_in=1')
}

/** Puts a saved record into a cached list (replacing the old copy) so the page updates the moment the save returns. */
function upsert<T extends { id: string }>(list: T[] | undefined, item: T, order: (a: T, b: T) => number): T[] | undefined {
  if (!list) return list
  return [...list.filter((x) => x.id !== item.id), item].sort(order)
}

function without<T extends { id: string }>(list: T[] | undefined, id: string): T[] | undefined {
  return list?.filter((x) => x.id !== id)
}

const bySchoolName = (a: School, b: School) => a.name.localeCompare(b.name)
const byVolunteerName = (a: Volunteer, b: Volunteer) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
const bySemesterStart = (a: Semester, b: Semester) => b.startDate.localeCompare(a.startDate)
const byCreated = (a: Team, b: Team) => a.createdAt.localeCompare(b.createdAt)

// Session

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async (): Promise<SessionInfo | null> => {
      if (!mayHaveSession()) return null
      try {
        return await get<SessionInfo>('/session')
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
    retry: 1,
  })
}

/** A new session means a new workspace or role: nothing cached from before applies. */
function startSession(client: QueryClient, info: SessionInfo) {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
  client.setQueryData(keys.session, info)
}

export function useDemoSignIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { role: Role } | { email: string; password: string }) =>
      (await http.post<SessionInfo>('/session/demo', input)).data,
    onSuccess: (info) => startSession(client, info),
  })
}

export function useSwitchRole() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (role: Role) => (await http.post<SessionInfo>('/session/role', { role })).data,
    onSuccess: (info) => startSession(client, info),
  })
}

export function useSignOut() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await http.delete('/session')
    },
    onSettled: () => {
      client.clear()
      client.setQueryData(keys.session, null)
    },
  })
}

// Reads

export const useSemesters = () => useQuery({ queryKey: keys.semesters, queryFn: () => get<Semester[]>('/semesters') })
export const useSchools = () => useQuery({ queryKey: keys.schools, queryFn: () => get<School[]>('/schools') })
export const useVolunteers = () => useQuery({ queryKey: keys.volunteers, queryFn: () => get<Volunteer[]>('/volunteers') })

export function useTeams(semesterId: string | undefined) {
  return useQuery({
    queryKey: keys.teams(semesterId ?? ''),
    queryFn: () => get<Team[]>('/teams', { semesterId: semesterId! }),
    enabled: Boolean(semesterId),
  })
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => get<Volunteer>('/me') })
export const useMyTeams = () => useQuery({ queryKey: keys.myTeams, queryFn: () => get<MyTeam[]>('/me/teams') })

// Writes. Each one refreshes exactly the lists it can change.

export function useSaveSchool() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SchoolInput }) =>
      id ? (await http.patch<School>(`/schools/${id}`, input)).data : (await http.post<School>('/schools', input)).data,
    onSuccess: (school) => client.setQueryData<School[]>(keys.schools, (list) => upsert(list, school, bySchoolName)),
  })
}

export function useDeleteSchool() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/schools/${id}`)
    },
    onSuccess: (_, id) => {
      client.setQueryData<School[]>(keys.schools, (list) => without(list, id))
      client.invalidateQueries({ queryKey: keys.allTeams })
    },
  })
}

export function useSaveVolunteer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: VolunteerInput }) =>
      id
        ? (await http.patch<Volunteer>(`/volunteers/${id}`, input)).data
        : (await http.post<Volunteer>('/volunteers', input)).data,
    onSuccess: (volunteer) =>
      client.setQueryData<Volunteer[]>(keys.volunteers, (list) => upsert(list, volunteer, byVolunteerName)),
  })
}

export function useDeleteVolunteer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/volunteers/${id}`)
    },
    onSuccess: (_, id) => {
      client.setQueryData<Volunteer[]>(keys.volunteers, (list) => without(list, id))
      client.invalidateQueries({ queryKey: keys.allTeams })
    },
  })
}

export interface TeamPayload {
  schoolId: string
  sessionId: string
  memberIds: string[]
  notes: string
}

export function useSaveTeam() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, semesterId, input }: { id?: string; semesterId: string; input: TeamPayload }) =>
      id
        ? (await http.patch<Team>(`/teams/${id}`, input)).data
        : (await http.post<Team>('/teams', { ...input, semesterId })).data,
    onSuccess: (team) => client.setQueryData<Team[]>(keys.teams(team.semesterId), (list) => upsert(list, team, byCreated)),
  })
}

export function useDeleteTeam() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (team: Team) => {
      await http.delete(`/teams/${team.id}`)
      return team
    },
    onSuccess: (team) => client.setQueryData<Team[]>(keys.teams(team.semesterId), (list) => without(list, team.id)),
  })
}

export function useSaveSemester() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SemesterInput }) =>
      id
        ? (await http.patch<Semester>(`/semesters/${id}`, input)).data
        : (await http.post<Semester>('/semesters', input)).data,
    onSuccess: (semester) =>
      client.setQueryData<Semester[]>(keys.semesters, (list) => upsert(list, semester, bySemesterStart)),
  })
}

export function useDeleteSemester() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/semesters/${id}`)
    },
    onSuccess: (_, id) => {
      client.setQueryData<Semester[]>(keys.semesters, (list) => without(list, id))
      client.removeQueries({ queryKey: keys.teams(id) })
    },
  })
}

export function useSaveProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProfileInput) => (await http.patch<Volunteer>('/me', input)).data,
    onSuccess: (me) => {
      client.setQueryData(keys.me, me)
      client.invalidateQueries({ queryKey: keys.session })
    },
  })
}

export interface AvailabilityResult {
  volunteer: Volunteer
  warnings: { teamId: string; message: string }[]
}

export function useSaveAvailability() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (availability: TimeRange[]) =>
      (await http.put<AvailabilityResult>('/me/availability', { availability })).data,
    onSuccess: (result) => client.setQueryData(keys.me, result.volunteer),
  })
}
