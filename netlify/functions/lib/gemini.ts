/**
 * Gemini API helpers.
 *
 * Gemini is used **only** to generate the initial system-prompt instructions
 * for the ElevenLabs Conversational AI agent.  All actual conversation and
 * document storage is handled by ElevenLabs (see `elevenlabs.ts`).
 */

/** Shape of a Gemini `generateContent` response candidate. */
interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>
  }
}

/** Top-level shape of a Gemini `generateContent` response. */
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

/** Returns the configured Gemini API key or throws if it is missing. */
function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  return apiKey
}

/**
 * Extracts the concatenated text from a Gemini response.
 * Throws if no text parts are present.
 */
function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts
  if (!parts?.length) {
    throw new Error('Gemini response did not include any text')
  }

  return parts
    .map((part) => part.text ?? '')
    .join('')
    .trim()
}

/**
 * Makes a JSON request to the Gemini REST API.
 * Throws an `Error` if the response status is not 2xx.
 */
async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`)
  }

  return (await response.json()) as T
}

/**
 * Sends a single prompt to Gemini and returns the generated text.
 *
 * @param prompt - The user-turn prompt to send.
 * @returns The model's text response.
 */
async function generateText(prompt: string): Promise<string> {
  const apiKey = getApiKey()
  const response = await requestJson<GeminiResponse>(
    `${GEMINI_BASE_URL}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    },
  )

  return extractText(response)
}

/**
 * Generates concise system-prompt instructions for an arXiv paper Q&A agent.
 *
 * The instructions are later used as the ElevenLabs agent's system prompt so
 * that the voice agent stays grounded in the specific paper's content.
 *
 * @param abstract - The paper abstract from the arXiv metadata feed.
 * @returns A short system-prompt string suitable for the ElevenLabs agent.
 */
export async function generateAgentInstructions(abstract: string): Promise<string> {
  return generateText(
    [
      'You are creating a concise assistant persona for an arXiv paper Q&A agent.',
      'Use the abstract below to produce system instructions that make the agent helpful, technical, and grounded.',
      'Return only the instructions text.',
      '',
      `Abstract: ${abstract}`,
    ].join('\n'),
  )
}
