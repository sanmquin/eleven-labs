import { useConversation } from '@11labs/react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AgentStatus = 'idle' | 'queued' | 'processing' | 'ready' | 'failed'

type CreateAgentResponse = {
  jobId: string
  status: Exclude<AgentStatus, 'idle'>
}

type AgentStatusResponse = {
  status: Exclude<AgentStatus, 'idle'>
  title?: string
  error?: string
}

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => ({}))) as Record<string, string>

  if (!response.ok) {
    throw new ApiError(response.status, payload.error ?? `Request failed (${response.status})`)
  }

  return payload as T
}

function App() {
  const [arxivId, setArxivId] = useState('')
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [paperTitle, setPaperTitle] = useState('')
  const [isSubmittingPaper, setIsSubmittingPaper] = useState(false)

  // ElevenLabs Conversational AI hook
  const conversation = useConversation({
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(message)
    },
  })

  const isConversationActive = conversation.status === 'connected'

  const statusLabel = useMemo(() => {
    if (status === 'idle') {
      return 'Submit an arXiv id to create your paper agent.'
    }

    if (status === 'failed') {
      return statusMessage || 'Agent creation failed.'
    }

    if (status === 'ready') {
      if (paperTitle) {
        return `Agent ready for: ${paperTitle}`
      }
      return 'Agent is ready. Start a voice conversation to ask about the paper.'
    }

    return 'Agent is being prepared. Polling for completion...'
  }, [paperTitle, status, statusMessage])

  useEffect(() => {
    if (!jobId || status === 'ready' || status === 'failed') {
      return
    }

    const intervalId = window.setInterval(async () => {
      try {
        const next = await requestJson<AgentStatusResponse>(
          `/.netlify/functions/agent-status?jobId=${encodeURIComponent(jobId)}`,
        )

        setStatus(next.status)
        setPaperTitle(next.title ?? '')

        if (next.status === 'failed') {
          setStatusMessage(next.error ?? 'Agent creation failed')
        }
      } catch (error) {
        setStatus('failed')
        setStatusMessage(error instanceof Error ? error.message : 'Unable to poll agent status')
      }
    }, 2500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [jobId, status])

  async function submitArxiv(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const value = arxivId.trim()
    if (!value) {
      setStatus('failed')
      setStatusMessage('Please enter an arXiv id.')
      return
    }

    // End any active conversation before creating a new agent
    if (isConversationActive) {
      await conversation.endSession()
    }

    setIsSubmittingPaper(true)
    setStatus('queued')
    setStatusMessage('')
    setPaperTitle('')

    try {
      const response = await requestJson<CreateAgentResponse>('/.netlify/functions/create-agent-background', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arxivId: value }),
      })

      setJobId(response.jobId)
      setStatus(response.status)
    } catch (error) {
      setStatus('failed')
      setStatusMessage(error instanceof Error ? error.message : 'Could not create agent')
    } finally {
      setIsSubmittingPaper(false)
    }
  }

  async function startConversation(): Promise<void> {
    setStatusMessage('')

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatusMessage('Microphone permission denied. Please allow microphone access and try again.')
      return
    }

    try {
      const { signedUrl } = await requestJson<{ signedUrl: string }>(
        `/.netlify/functions/get-conversation-url?jobId=${encodeURIComponent(jobId)}`,
      )
      await conversation.startSession({ signedUrl })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to start conversation')
    }
  }

  async function stopConversation(): Promise<void> {
    await conversation.endSession()
  }

  return (
    <main className="app">
      <h1>arXiv Paper Agent</h1>
      <p className={`status status-${status}`}>{statusLabel}</p>

      <form className="card" onSubmit={submitArxiv}>
        <label htmlFor="arxiv-id">arXiv ID</label>
        <div className="row">
          <input
            id="arxiv-id"
            name="arxiv-id"
            placeholder="e.g. 1706.03762"
            value={arxivId}
            onChange={(event) => setArxivId(event.target.value)}
            disabled={isSubmittingPaper}
          />
          <button type="submit" disabled={isSubmittingPaper}>
            {isSubmittingPaper ? 'Submitting...' : 'Create agent'}
          </button>
        </div>
      </form>

      <section className="card">
        <div className="row">
          <h2>Voice chat</h2>
          {isConversationActive ? (
            <button type="button" onClick={stopConversation}>
              {conversation.isSpeaking ? 'Agent is speaking…' : 'Stop conversation'}
            </button>
          ) : (
            <button type="button" onClick={startConversation} disabled={status !== 'ready'}>
              Start conversation
            </button>
          )}
        </div>

        {statusMessage && <p className="status status-failed">{statusMessage}</p>}

        <p className="empty">
          {isConversationActive
            ? conversation.isSpeaking
              ? 'The agent is speaking…'
              : 'Listening — speak to ask about the paper.'
            : status === 'ready'
              ? 'Click "Start conversation" and speak to ask about the paper.'
              : 'Wait for the agent to be ready, then start a voice conversation.'}
        </p>
      </section>
    </main>
  )
}

export default App
