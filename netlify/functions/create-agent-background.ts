/**
 * Netlify background function: `create-agent-background`
 *
 * Accepts a POST request with `{ arxivId }` and immediately returns a job ID
 * while kicking off the agent-creation pipeline asynchronously:
 *
 * 1. Fetch paper metadata (title, abstract) and download the PDF from arXiv.
 * 2. Use Gemini to generate concise system-prompt instructions from the abstract.
 * 3. Upload the PDF to the ElevenLabs Knowledge Base.
 * 4. Create an ElevenLabs Conversational AI agent with those instructions and
 *    the knowledge-base document attached.
 *
 * The UI polls `agent-status` until the job reaches `ready` or `failed`.
 */

import { createJob, updateJob } from './lib/agent-store'
import { fetchArxivPaper, isValidArxivId, normalizeArxivId } from './lib/arxiv'
import { createElevenLabsAgent, uploadPdfToKnowledgeBase } from './lib/elevenlabs'
import { generateAgentInstructions } from './lib/gemini'
import { handleOptions, json, type FunctionEvent, type FunctionResponse } from './lib/http'

/**
 * Runs the full agent-creation pipeline for a single job.
 * Updates the job status in the store as it progresses.
 *
 * @param jobId   - UUID of the job to process.
 * @param arxivId - Normalised arXiv paper identifier.
 */
async function processJob(jobId: string, arxivId: string): Promise<void> {
  updateJob(jobId, { status: 'processing' })

  try {
    const paper = await fetchArxivPaper(arxivId)

    const instructions = await generateAgentInstructions(paper.abstract)

    const knowledgeBaseId = await uploadPdfToKnowledgeBase(paper.pdfBuffer, paper.pdfFilename)

    const agentId = await createElevenLabsAgent(instructions, knowledgeBaseId, paper.title)

    updateJob(jobId, {
      status: 'ready',
      title: paper.title,
      instructions,
      agentId,
      error: undefined,
    })
  } catch (error) {
    updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unexpected processing error',
    })
  }
}

/**
 * Netlify function handler.
 *
 * Validates the request, creates a job, fires the pipeline without awaiting,
 * and immediately returns `202 Accepted` with the job ID.
 */
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
