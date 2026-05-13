import { createJob, updateJob } from './lib/agent-store'
import { fetchArxivPaper, isValidArxivId, normalizeArxivId } from './lib/arxiv'
import { createGeminiAgent } from './lib/gemini'
import { handleOptions, json, type FunctionEvent, type FunctionResponse } from './lib/http'

async function processJob(jobId: string, arxivId: string): Promise<void> {
  updateJob(jobId, { status: 'processing' })

  try {
    const paper = await fetchArxivPaper(arxivId)
    const geminiAgent = await createGeminiAgent(paper.abstract, paper.pdfBuffer, paper.pdfFilename)

    updateJob(jobId, {
      status: 'ready',
      title: paper.title,
      abstract: paper.abstract,
      instructions: geminiAgent.instructions,
      fileUri: geminiAgent.fileUri,
      error: undefined,
    })
  } catch (error) {
    updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unexpected processing error',
    })
  }
}

export async function handler(event: FunctionEvent): Promise<FunctionResponse> {
  const optionsResponse = handleOptions(event)
  if (optionsResponse) {
    return optionsResponse
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' }, event.headers?.origin)
  }

  const payload = event.body ? (JSON.parse(event.body) as { arxivId?: string }) : {}
  const arxivId = normalizeArxivId(payload.arxivId ?? '')

  if (!isValidArxivId(arxivId)) {
    return json(400, { error: 'Please provide a valid arXiv id' }, event.headers?.origin)
  }

  const job = createJob(arxivId)

  void processJob(job.id, arxivId)

  return json(202, {
    jobId: job.id,
    status: job.status,
  }, event.headers?.origin)
}
