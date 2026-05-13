import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AgentStatus = 'idle' | 'queued' | 'processing' | 'ready' | 'failed'

type Message = {
  role: 'user' | 'assistant'
  text: string
}

type CreateAgentResponse = {
  jobId: string
  status: Exclude<AgentStatus, 'idle'>
}

type AgentStatusResponse = {
  status: Exclude<AgentStatus, 'idle'>
  title?: string
  error?: string
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => ({}))) as Record<string, string>

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status})`)
  }

  return payload as T
}

function App() {
  const [arxivId, setArxivId] = useState('')
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [paperTitle, setPaperTitle] = useState('')
  const [micEnabled, setMicEnabled] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isSubmittingPaper, setIsSubmittingPaper] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)

  const canChat = status === 'ready' && micEnabled && Boolean(jobId)

  const statusLabel = useMemo(() => {
    if (status === 'idle') {
      return 'Submit an arXiv id to create your paper agent.'
    }

    if (status === 'failed') {
      return statusMessage || 'Agent creation failed.'
    }

    if (status === 'ready') {
      return paperTitle ? `Agent ready for: ${paperTitle}` : 'Agent is ready. Enable microphone to chat.'
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

    setIsSubmittingPaper(true)
    setStatus('queued')
    setStatusMessage('')
    setMicEnabled(false)
    setMessages([])

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

  async function enableMicrophone(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setMicEnabled(true)
      setStatusMessage('')
    } catch (error) {
      setMicEnabled(false)
      setStatusMessage(error instanceof Error ? error.message : 'Microphone permission denied')
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!canChat || !chatInput.trim()) {
      return
    }

    const outgoing = chatInput.trim()
    setChatInput('')
    setIsSendingMessage(true)
    setMessages((current) => [...current, { role: 'user', text: outgoing }])

    try {
      const response = await requestJson<{ reply: string }>('/.netlify/functions/agent-chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          message: outgoing,
        }),
      })

      setMessages((current) => [...current, { role: 'assistant', text: response.reply }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: error instanceof Error ? error.message : 'Failed to fetch response from agent',
        },
      ])
    } finally {
      setIsSendingMessage(false)
    }
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
          <button type="button" onClick={enableMicrophone} disabled={status !== 'ready' || micEnabled}>
            {micEnabled ? 'Microphone enabled' : 'Enable microphone'}
          </button>
        </div>

        <div className="chat-log" aria-live="polite">
          {messages.length === 0 ? (
            <p className="empty">No messages yet.</p>
          ) : (
            messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
                <strong>{message.role === 'user' ? 'You' : 'Agent'}</strong>
                <span>{message.text}</span>
              </article>
            ))
          )}
        </div>

        <form className="row" onSubmit={sendMessage}>
          <input
            placeholder={canChat ? 'Ask about the paper...' : 'Wait for agent and microphone'}
            value={chatInput}
            disabled={!canChat || isSendingMessage}
            onChange={(event) => setChatInput(event.target.value)}
          />
          <button type="submit" disabled={!canChat || isSendingMessage || !chatInput.trim()}>
            {isSendingMessage ? 'Sending...' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
