import { appendChat, getJob } from './lib/agent-store'
import { chatWithGeminiAgent } from './lib/gemini'
import { handleOptions, json, type FunctionEvent, type FunctionResponse } from './lib/http'

interface ChatPayload {
  jobId?: string
  message?: string
}

export async function handler(event: FunctionEvent): Promise<FunctionResponse> {
  const optionsResponse = handleOptions(event.httpMethod)
  if (optionsResponse) {
    return optionsResponse
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const payload = event.body ? (JSON.parse(event.body) as ChatPayload) : {}
  const jobId = payload.jobId?.trim()
  const message = payload.message?.trim()

  if (!jobId || !message) {
    return json(400, { error: 'jobId and message are required' })
  }

  const job = getJob(jobId)

  if (!job) {
    return json(404, { error: 'Agent job not found' })
  }

  if (job.status !== 'ready' || !job.instructions || !job.fileUri || !job.abstract) {
    return json(409, { error: 'Agent is not ready yet' })
  }

  appendChat(job.id, { role: 'user', text: message })

  try {
    const answer = await chatWithGeminiAgent({
      instructions: job.instructions,
      abstract: job.abstract,
      fileUri: job.fileUri,
      history: job.history,
      message,
    })

    appendChat(job.id, { role: 'assistant', text: answer })

    return json(200, { reply: answer })
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unable to chat with the agent',
    })
  }
}
