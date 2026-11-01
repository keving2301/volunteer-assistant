import { HttpError } from './http'

/** Reads a server variable (set in Netlify as a secret scoped to functions, or from a local env file in development). */
export function env(name: 'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY' | 'SESSION_SECRET'): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing environment variable ${name}`)
    throw new HttpError(500, 'server_config', 'The demo is not configured on this server.')
  }
  return value
}
