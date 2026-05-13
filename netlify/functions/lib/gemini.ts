import type { ChatTurn } from './agent-store'

interface GeminiAgent {
  instructions: string
  fileUri: string
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>
  }
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

interface GeminiFileResponse {
  file?: {
    name?: string
    uri?: string
    state?: string
  }
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE_URL = 'https://generativelanguage.googleapis.com/upload/v1beta'
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  return apiKey
}

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

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`)
  }

  return (await response.json()) as T
}

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

async function uploadPdf(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = getApiKey()
  const startResponse = await fetch(`${GEMINI_UPLOAD_BASE_URL}/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-upload-command': 'start',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-header-content-length': String(buffer.length),
      'x-goog-upload-header-content-type': 'application/pdf',
    },
    body: JSON.stringify({
      file: { display_name: filename },
    }),
  })

  if (!startResponse.ok) {
    const body = await startResponse.text()
    throw new Error(`Gemini upload start failed (${startResponse.status}): ${body}`)
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')

  if (!uploadUrl) {
    throw new Error('Gemini upload URL missing from response')
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'content-length': String(buffer.length),
      'x-goog-upload-command': 'upload, finalize',
      'x-goog-upload-offset': '0',
    },
    body: buffer,
  })

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text()
    throw new Error(`Gemini upload failed (${uploadResponse.status}): ${body}`)
  }

  const uploaded = (await uploadResponse.json()) as GeminiFileResponse
  const fileName = uploaded.file?.name

  if (!fileName) {
    throw new Error('Gemini did not return a file name')
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const fileState = await requestJson<GeminiFileResponse>(
      `${GEMINI_BASE_URL}/${fileName}?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
    )

    if (fileState.file?.state === 'ACTIVE' && fileState.file.uri) {
      return fileState.file.uri
    }

    if (fileState.file?.state === 'FAILED') {
      throw new Error('Gemini file processing failed')
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1500)
    })
  }

  throw new Error('Gemini file processing timed out')
}

function mapHistory(history: ChatTurn[]): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  return history.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }))
}

export async function createGeminiAgent(abstract: string, pdfBuffer: Buffer, filename: string): Promise<GeminiAgent> {
  const instructions = await generateText(
    [
      'You are creating a concise assistant persona for an arXiv paper Q&A agent.',
      'Use the abstract below to produce system instructions that make the agent helpful, technical, and grounded.',
      'Return only the instructions text.',
      '',
      `Abstract: ${abstract}`,
    ].join('\n'),
  )

  const fileUri = await uploadPdf(pdfBuffer, filename)

  return {
    instructions,
    fileUri,
  }
}

export async function chatWithGeminiAgent(params: {
  instructions: string
  abstract: string
  fileUri: string
  history: ChatTurn[]
  message: string
}): Promise<string> {
  const apiKey = getApiKey()
  const { abstract, fileUri, history, instructions, message } = params
  const response = await requestJson<GeminiResponse>(
    `${GEMINI_BASE_URL}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          ...mapHistory(history),
          {
            role: 'user',
            parts: [
              {
                text: [
                  instructions,
                  '',
                  'Always answer using only information from the paper abstract/PDF context.',
                  `Paper abstract: ${abstract}`,
                  '',
                  `Question: ${message}`,
                ].join('\n'),
              },
              {
                file_data: {
                  file_uri: fileUri,
                  mime_type: 'application/pdf',
                },
              },
            ],
          },
        ],
      }),
    },
  )

  return extractText(response)
}
