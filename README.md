# Volunteer Assistant

Scheduling for a university coding outreach program ("Code Outreach" in the app): university students volunteer to
teach coding at local schools. Coordinators keep the schools and the weekly times each one hosts a session, volunteers
give the hours they are free each week, and coordinators build a team for every school session from the volunteers
who can make it there and back.

**Live demo:** https://volunteer-assistant.netlify.app (fictional data; the sign-in page has one-click demo access).

## History

This is a 2026 rebuild of a 2020 student team project of the same name, built at the time with React, Node.js,
MongoDB and Axios. The original code was lost; four screenshots of it survived. This repository is a new
implementation written from those screenshots: the same product (dashboard of the week's teams, schools, volunteers,
teams by semester, team builder), done again with a server that enforces the scheduling rules.

## What it does

Coordinator

- **Dashboard:** this week's sessions, Monday to Friday, with each team, and the sessions that need attention: no team
  yet, a team below the minimum size, or a member who is no longer free (their availability changed).
- **Teams** by semester, as a weekly board. The team builder lists the volunteers who are free for the whole session
  plus travel time each way and are not on a clashing team, fewest teams first; everyone else is listed with the
  reason. Double booking is refused, and teams have a minimum and maximum size.
- **Schools:** name, address, contact, grade levels and weekly session times.
- **Volunteers:** search and filters, each one's weekly availability and teams.
- **Semesters:** dates, team size and travel time.

Volunteer

- **My week:** the volunteer's sessions with the school, address, when to leave campus, teammates and the school
  contact.
- **Availability:** a weekly grid editor (mouse and touch drag, full keyboard support; a day by day list on phones).
- **Profile.**

## Demo access

The sign-in form comes prefilled with the demo coordinator; a Coordinator / Volunteer switch at the top of the form swaps
in the other account. Each sign-in creates a private workspace with a fresh copy of the demo data, so visitors never see
or change each other's data. Workspaces are deleted after 24 hours.

| Role | Email | Password |
|---|---|---|
| Coordinator | demo.coordinator@example.com | Coordinate-2026 |
| Volunteer | demo.volunteer@example.com | Volunteer-2026 |

Both roles share the visitor's workspace: "View as the volunteer" in the menu switches roles, so a coordinator can put
Jordan Ellis on a team and then see it on Jordan's week.

## Stack

- React 18, TypeScript, Vite, React Router, TanStack Query and Axios. Plain CSS with custom properties; IBM Plex Sans
  self-hosted from npm.
- A REST API on Netlify Functions (Node 22, TypeScript): `netlify/functions/api.mts` (all routes under `/api`),
  `demo-session.mts` (demo sign-in, rate limited per IP) and `cleanup-workspaces.mts` (daily, deletes expired
  workspaces). Every request body is validated with Zod; the same schemas drive the forms.
- Cloud Firestore through the Firebase Admin SDK, in the functions only. `firestore.rules` deny all client access.
- Sessions: an HTTP-only, Secure, SameSite=Lax cookie signed with HMAC-SHA256. No Firebase Auth.
- The scheduling rules (`shared/schedule.ts`) run in the browser for instant feedback and again on the server, inside a
  Firestore transaction, before a team is saved.
- Vitest unit tests for the scheduling rules, the calendar, the demo data and the session cookie.

## Run it locally

Node 22.12 or newer.

```bash
npm install
npm test                # unit tests
npm run lint
npm run build           # type checks the app and the functions, then builds dist/
```

`npm run dev` serves the app and the API together on http://localhost:4000 (a Vite plugin runs the functions'
handlers). The API needs a Firebase project and the variables in `.env.example`; keep them in a file outside the
repository and point to it:

```bash
VAS_ENV_FILE=/path/to/volunteer-assistant.env npm run dev
```

## Layout

- `src/`: the React app (pages, components, API hooks, styles).
- `shared/`: code used by both sides: types, time and calendar helpers, the scheduling rules, input schemas, demo
  account constants.
- `netlify/functions/`: the three functions. `netlify/lib/`: the router, sessions, workspaces, demo data, Firestore.
- `tests/unit/`: Vitest.
- `firestore.rules`, `firebase.json`: deployed with `firebase deploy --only firestore --project volunteer-assistant-kg`.
