/**
 * Shared HTTP utilities for Netlify function handlers.
 *
 * Provides lightweight wrappers for building JSON responses and handling CORS
 * pre-flight requests.  All handlers import from this module instead of
 * building headers manually.
 */

/** Minimal shape of the event object passed by the Netlify Functions runtime. */
export interface FunctionEvent {
  body: string | null
  headers?: Record<string, string | undefined>
  httpMethod: string
  queryStringParameters?: Record<string, string | undefined> | null
}

/** Shape of the response object expected by the Netlify Functions runtime. */
export interface FunctionResponse {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

const defaultAllowedOrigins = ['http://localhost:5173', 'http://localhost:8888']

/**
 * Returns the list of origins that are permitted to call the functions.
 * Reads from the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated)
 * and falls back to the default local development origins.
 */
function getAllowedOrigins(): string[] {
  const env = process.env.CORS_ALLOWED_ORIGINS

  if (!env) {
    return defaultAllowedOrigins
  }

  return env
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

/**
 * Returns the origin header value to echo back in CORS response headers.
 * Falls back to the first allowed origin when the request origin is not in the
 * allow-list.
 */
function resolveOrigin(originHeader: string | undefined): string {
  const allowedOrigins = getAllowedOrigins()

  if (originHeader && allowedOrigins.includes(originHeader)) {
    return originHeader
  }

  return allowedOrigins[0]
}

/** Builds a standard set of CORS + JSON response headers. */
function createHeaders(originHeader: string | undefined): Record<string, string> {
  return {
    'access-control-allow-origin': resolveOrigin(originHeader),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  }
}

/**
 * Creates a Netlify function response with a JSON body.
 *
 * @param statusCode  - HTTP status code.
 * @param body        - Value to serialize as JSON.
 * @param originHeader - `Origin` header value from the incoming request (used
 *                       for CORS).
 */
export function json(statusCode: number, body: unknown, originHeader?: string): FunctionResponse {
  return {
    statusCode,
    headers: createHeaders(originHeader),
    body: JSON.stringify(body),
  }
}

/**
 * Handles CORS pre-flight `OPTIONS` requests.
 *
 * @returns A 204 response if the request is an OPTIONS pre-flight, or `null`
 *          if the handler should continue processing the request.
 */
export function handleOptions(event: FunctionEvent): FunctionResponse | null {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: createHeaders(event.headers?.origin),
      body: '',
    }
  }

  return null
}
