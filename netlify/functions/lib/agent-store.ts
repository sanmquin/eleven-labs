import { randomUUID } from 'node:crypto'

export type AgentStatus = 'queued' | 'processing' | 'ready' | 'failed'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AgentJob {
  id: string
  arxivId: string
  status: AgentStatus
  title?: string
  abstract?: string
  instructions?: string
  fileUri?: string
  error?: string
  history: ChatTurn[]
}

const jobs = new Map<string, AgentJob>()

export function createJob(arxivId: string): AgentJob {
  const job: AgentJob = {
    id: randomUUID(),
    arxivId,
    status: 'queued',
    history: [],
  }

  jobs.set(job.id, job)

  return job
}

export function getJob(jobId: string): AgentJob | undefined {
  return jobs.get(jobId)
}

export function updateJob(jobId: string, updates: Partial<AgentJob>): AgentJob | undefined {
  const job = jobs.get(jobId)

  if (!job) {
    return undefined
  }

  const next = {
    ...job,
    ...updates,
    history: updates.history ?? job.history,
  }

  jobs.set(jobId, next)

  return next
}

export function appendChat(jobId: string, turn: ChatTurn): AgentJob | undefined {
  const job = jobs.get(jobId)

  if (!job) {
    return undefined
  }

  const next = {
    ...job,
    history: [...job.history, turn],
  }

  jobs.set(jobId, next)

  return next
}
