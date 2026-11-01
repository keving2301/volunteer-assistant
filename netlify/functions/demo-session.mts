import type { Config, Context } from '@netlify/functions'
import { handleDemoSignIn } from '../lib/demo-sign-in'

/** Demo sign-in. Each call creates and seeds a workspace, so it is limited per IP. */
export default (req: Request, context: Context) => handleDemoSignIn(req, { ip: context.ip })

export const config: Config = {
  path: '/api/session/demo',
  method: 'POST',
  // At most 6 demo sign-ins a minute from one IP, on top of the daily limit per network kept in Firestore.
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
