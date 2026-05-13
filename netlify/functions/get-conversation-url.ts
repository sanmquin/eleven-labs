/**
 * Netlify function: `get-conversation-url`
 *
 * Returns a short-lived signed WebSocket URL that the browser uses to start a
 * voice conversation with the ElevenLabs Conversational AI agent created for a
 * given paper.
 *
 * The signed URL keeps the ElevenLabs API key server-side and is safe to pass
 * directly to the `@11labs/react` browser SDK.
 *
 * Query parameters:
 * - `jobId` (required) – UUID returned by `create-agent-background`.
 */

import { getJob } from './lib/agent-store'
import { getSignedConversationUrl } from './lib/elevenlabs'
import { handleOptions, json, type FunctionEvent, type FunctionResponse } from './lib/http'

/** Netlify function handler. */
export async function handler(event: FunctionEvent): Promise<FunctionResponse> {
  const optionsResponse = handleOptions(event)
  if (optionsResponse) {
    return optionsResponse
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' }, event.headers?.origin)
  }

  const jobId = event.queryStringParameters?.jobId

  if (!jobId) {
    return json(400, { error: 'Missing jobId query parameter' }, event.headers?.origin)
  }

  const job = getJob(jobId)

  if (!job) {
    return json(404, { error: 'Agent job not found' }, event.headers?.origin)
  }

  if (job.status !== 'ready' || !job.agentId) {
    return json(409, { error: 'Agent is not ready yet' }, event.headers?.origin)
  }

  try {
    const signedUrl = await getSignedConversationUrl(job.agentId)
    return json(200, { signedUrl }, event.headers?.origin)
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unable to get conversation URL',
    }, event.headers?.origin)
  }
}
