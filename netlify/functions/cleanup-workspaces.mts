import type { Config } from '@netlify/functions'
import { firestore } from '../lib/firestore'
import { deleteExpiredWorkspaces } from '../lib/workspace'

/** Once a day: deletes every demo workspace older than 24 hours, with all its documents. */
export default async () => {
  const deleted = await deleteExpiredWorkspaces(firestore(), new Date())
  console.log(`Deleted ${deleted} expired workspace${deleted === 1 ? '' : 's'}`)
}

export const config: Config = {
  schedule: '@daily',
}
