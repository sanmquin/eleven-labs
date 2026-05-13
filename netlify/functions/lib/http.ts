export interface FunctionEvent {
  body: string | null
  httpMethod: string
  queryStringParameters?: Record<string, string | undefined> | null
}

export interface FunctionResponse {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export const jsonHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json',
}

export function json(statusCode: number, body: unknown): FunctionResponse {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }
}

export function handleOptions(method: string): FunctionResponse | null {
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: jsonHeaders,
      body: '',
    }
  }

  return null
}
