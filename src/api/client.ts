import axios, { AxiosError } from 'axios'
import type { ApiErrorBody } from '../../shared/types'

/** Every API call goes through this instance: same origin, JSON, and the session cookie sent automatically. */
export const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20_000,
})

export interface ApiError {
  status: number
  code: string
  message: string
  fields: Record<string, string>
  issues: { code: string; message: string; memberId?: string }[]
}

/** Turns any failed request into one shape the UI can show. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) {
      return {
        status: error.response?.status ?? 0,
        code: body.error.code,
        message: body.error.message,
        fields: body.error.fields ?? {},
        issues: body.error.issues ?? [],
      }
    }
    if (error.response?.status === 429) {
      return { status: 429, code: 'rate_limited', message: 'Too many requests from this network. Wait a minute and try again.', fields: {}, issues: [] }
    }
    if (!error.response) {
      return { status: 0, code: 'network', message: 'Could not reach the server. Check your connection and try again.', fields: {}, issues: [] }
    }
    return { status: error.response.status, code: 'http_error', message: `The server answered ${error.response.status}. Try again in a moment.`, fields: {}, issues: [] }
  }
  return { status: 0, code: 'unknown', message: 'Something went wrong. Try again.', fields: {}, issues: [] }
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message
}

let onSessionLost: ((code: string) => void) | null = null

/** Lets the app react when the server says the session or workspace is gone. */
export function setSessionLostHandler(handler: (code: string) => void) {
  onSessionLost = handler
}

http.interceptors.response.use(undefined, (error: unknown) => {
  if (error instanceof AxiosError && error.response?.status === 401 && !error.config?.url?.startsWith('/session/demo')) {
    const code = (error.response.data as ApiErrorBody | undefined)?.error?.code ?? 'no_session'
    onSessionLost?.(code)
  }
  return Promise.reject(error)
})
