import type { Config } from '@netlify/functions'
import { handleApi } from '../lib/api'

/** The REST API: /api/session, /api/semesters, /api/schools, /api/volunteers, /api/teams and /api/me. */
export default (req: Request) => handleApi(req)

export const config: Config = {
  path: '/api/*',
  excludedPath: '/api/session/demo',
}
