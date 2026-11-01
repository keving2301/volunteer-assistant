// Cloud Firestore through the Admin SDK. Only the functions talk to the database: firestore.rules deny every client
// request, and the service account they use has the Cloud Datastore User role and nothing else.

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { env } from './env'

let db: Firestore | null = null

export function firestore(): Firestore {
  if (db) return db
  const projectId = env('FIREBASE_PROJECT_ID')
  const app =
    getApps()[0] ??
    initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail: env('FIREBASE_CLIENT_EMAIL'),
        // Environment variables hold the key on one line with literal \n sequences.
        privateKey: env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    })
  db = getFirestore(app)
  // REST instead of gRPC: a much faster cold start in a short lived function.
  db.settings({ preferRest: true, ignoreUndefinedProperties: true })
  return db
}
