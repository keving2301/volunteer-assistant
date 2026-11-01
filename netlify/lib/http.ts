// Small HTTP helpers shared by the functions: JSON responses, typed errors, body parsing and the same-origin check.

import type { z } from 'zod'
import { fieldErrors } from '../../shared/validation'
import type { ApiErrorBody } from '../../shared/types'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Omit<ApiErrorBody['error'], 'code' | 'message'> = {},
  ) {
    super(message)
  }
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function json(status: number, body: unknown, cookies: string[] = []): Response {
  const headers = new Headers(BASE_HEADERS)
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message, ...error.extra } }
    return json(error.status, body)
  }
  console.error(error)
  const body: ApiErrorBody = {
    error: { code: 'server_error', message: 'Something went wrong on our side. Try again in a moment.' },
  }
  return json(500, body)
}

const MAX_BODY_BYTES = 32 * 1024

/** Reads a JSON body of at most 32 KB. Requiring application/json also means a cross-site form cannot send it. */
export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send the request body as JSON.')
  }
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'body_too_large', 'The request is too large.')
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.')
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(422, 'invalid_input', 'Check the highlighted fields.', { fields: fieldErrors(result.error) })
  }
  return result.data
}

/**
 * Requests that change data must come from this site. Browsers send Origin on every such request and Sec-Fetch-Site
 * on modern ones; together with the SameSite=Lax cookie this stops cross-site request forgery.
 */
export function assertSameOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'cross_site', 'Requests from other sites are not allowed.')
  }
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) {
    throw new HttpError(403, 'cross_site', 'Requests from other sites are not allowed.')
  }
}
