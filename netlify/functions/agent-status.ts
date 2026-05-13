import { getJob } from './lib/agent-store'
import { handleOptions, json, type FunctionEvent, type FunctionResponse } from './lib/http'

export async function handler(event: FunctionEvent): Promise<FunctionResponse> {
  const optionsResponse = handleOptions(event.httpMethod)
  if (optionsResponse) {
    return optionsResponse
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' })
  }

  const jobId = event.queryStringParameters?.jobId

  if (!jobId) {
    return json(400, { error: 'Missing jobId query parameter' })
  }

  const job = getJob(jobId)

  if (!job) {
    return json(404, { error: 'Agent job not found' })
  }

  return json(200, {
    jobId: job.id,
    arxivId: job.arxivId,
    status: job.status,
    title: job.title,
    error: job.error,
  })
}
