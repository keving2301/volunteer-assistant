import { useMemo, useState } from 'react'
import type { z } from 'zod'
import { fieldErrors } from '../../shared/validation'
import { toApiError, type ApiError } from '../api/client'

/**
 * Form errors from the same schema the API uses. Errors show after the first submit and then update as the person
 * types; errors the server returns for a field (an email already in use) show until that field changes.
 */
export function useSchemaForm<S extends z.ZodType>(schema: S, value: unknown) {
  const [tried, setTried] = useState(false)
  const [server, setServer] = useState<ApiError | null>(null)
  const result = useMemo(() => schema.safeParse(value), [schema, value])
  const local = result.success ? {} : fieldErrors(result.error)
  const errors: Record<string, string> = tried ? { ...(server?.fields ?? {}), ...local } : { ...(server?.fields ?? {}) }

  return {
    errors,
    serverError: server,
    /** Marks the form as submitted; returns the parsed value when it is valid. */
    check(): z.output<S> | null {
      setTried(true)
      setServer(null)
      return result.success ? (result.data as z.output<S>) : null
    },
    fail(error: unknown) {
      setServer(toApiError(error))
    },
    clearServerField(key: string) {
      if (server?.fields[key]) setServer({ ...server, fields: Object.fromEntries(Object.entries(server.fields).filter(([k]) => k !== key)) })
    },
  }
}
