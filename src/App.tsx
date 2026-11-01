import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { setSessionLostHandler } from './api/client'
import { keys } from './api/hooks'
import { HomeRedirect, RequireRole, RequireSession, rememberSessionLost } from './app/session'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { DashboardPage } from './pages/DashboardPage'
import { MyWeekPage } from './pages/MyWeekPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { SchoolsPage } from './pages/SchoolsPage'
import { SemestersPage } from './pages/SemestersPage'
import { SignInPage } from './pages/SignInPage'
import { TeamsPage } from './pages/TeamsPage'
import { VolunteerPage } from './pages/VolunteerPage'
import { VolunteersPage } from './pages/VolunteersPage'

export function App() {
  const client = useQueryClient()

  // When the server says the session or workspace is gone, drop everything and go back to sign-in.
  useEffect(() => {
    setSessionLostHandler((code) => {
      rememberSessionLost(code)
      client.clear()
      client.setQueryData(keys.session, null)
    })
  }, [client])

  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route element={<RequireSession />}>
        <Route index element={<HomeRedirect />} />
        <Route element={<RequireRole role="coordinator" />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="schools" element={<SchoolsPage />} />
          <Route path="volunteers" element={<VolunteersPage />} />
          <Route path="volunteers/:id" element={<VolunteerPage />} />
          <Route path="semesters" element={<SemestersPage />} />
        </Route>
        <Route element={<RequireRole role="volunteer" />}>
          <Route path="my-week" element={<MyWeekPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
