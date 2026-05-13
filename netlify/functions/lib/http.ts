export interface FunctionEvent {
  body: string | null
  headers?: Record<string, string | undefined>
  httpMethod: string
  queryStringParameters?: Record<string, string | undefined> | null
}

export interface FunctionResponse {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

const defaultAllowedOrigins = ['http://localhost:5173', 'http://localhost:8888']

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

function resolveOrigin(originHeader: string | undefined): string {
  const allowedOrigins = getAllowedOrigins()

  if (originHeader && allowedOrigins.includes(originHeader)) {
    return originHeader
  }

  return allowedOrigins[0]
}

function createHeaders(originHeader: string | undefined): Record<string, string> {
  return {
    'access-control-allow-origin': resolveOrigin(originHeader),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  }
}

export function json(statusCode: number, body: unknown, originHeader?: string): FunctionResponse {
  return {
    statusCode,
    headers: createHeaders(originHeader),
    body: JSON.stringify(body),
  }
}

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
