/**
 * ElevenLabs Conversational AI helpers.
 *
 * Responsibilities:
 *  1. Upload a PDF file to the ElevenLabs Knowledge Base.
 *  2. Create a Conversational AI agent that uses that knowledge base document.
 *  3. Generate a short-lived signed URL that the browser SDK uses to open a
 *     WebSocket voice-conversation session with the agent.
 */

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

/** Returns the configured ElevenLabs API key or throws if it is missing. */
function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured')
  }

  return apiKey
}

/**
 * Makes a JSON request to the ElevenLabs REST API.
 * Throws an `Error` if the response status is not 2xx.
 */
async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`ElevenLabs request failed (${response.status}): ${errorBody}`)
  }

  return (await response.json()) as T
}

/**
 * Uploads a PDF buffer to the ElevenLabs Knowledge Base.
 *
 * @param buffer   - Raw PDF file contents.
 * @param filename - Filename to use in the knowledge base (e.g. `2404.01234.pdf`).
 * @returns The knowledge-base document ID assigned by ElevenLabs.
 */
export async function uploadPdfToKnowledgeBase(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = getApiKey()

  const formData = new FormData()
  const blob = new Blob([buffer], { type: 'application/pdf' })
  formData.append('file', blob, filename)

  const response = await requestJson<{ id: string }>(
    `${ELEVENLABS_BASE_URL}/convai/knowledge-base/upload-document`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData,
    },
  )

  if (!response.id) {
    throw new Error('ElevenLabs did not return a knowledge-base document ID')
  }

  return response.id
}

/**
 * Creates an ElevenLabs Conversational AI agent.
 *
 * The agent is configured with:
 * - A system prompt (`instructions`) generated from the paper abstract by Gemini.
 * - A knowledge-base document (the paper PDF) so the agent can answer
 *   questions grounded in the actual paper content.
 *
 * @param instructions     - System-prompt text produced by Gemini.
 * @param knowledgeBaseId  - ID of the knowledge-base document uploaded via
 *                           {@link uploadPdfToKnowledgeBase}.
 * @param paperTitle       - Human-readable agent name (the paper title).
 * @returns The ElevenLabs agent ID.
 */
export async function createElevenLabsAgent(
  instructions: string,
  knowledgeBaseId: string,
  paperTitle: string,
): Promise<string> {
  const apiKey = getApiKey()

  const response = await requestJson<{ agent_id: string }>(
    `${ELEVENLABS_BASE_URL}/convai/agents/create`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: paperTitle || 'arXiv Paper Agent',
        conversation_config: {
          agent: {
            prompt: {
              prompt: instructions,
              knowledge_base: [{ type: 'file', id: knowledgeBaseId }],
            },
          },
        },
      }),
    },
  )

  if (!response.agent_id) {
    throw new Error('ElevenLabs did not return an agent ID')
  }

  return response.agent_id
}

/**
 * Fetches a short-lived signed WebSocket URL for starting a voice conversation
 * with an ElevenLabs Conversational AI agent.
 *
 * The URL is valid for a limited time and is safe to pass to the browser SDK.
 * It does not expose the API key to the client.
 *
 * @param agentId - ElevenLabs Conversational AI agent ID.
 * @returns A signed WebSocket URL that the browser SDK uses to connect.
 */
export async function getSignedConversationUrl(agentId: string): Promise<string> {
  const apiKey = getApiKey()

  const response = await requestJson<{ signed_url: string }>(
    `${ELEVENLABS_BASE_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    },
  )

  if (!response.signed_url) {
    throw new Error('ElevenLabs did not return a signed conversation URL')
  }

  return response.signed_url
}
