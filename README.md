# arXiv Paper Agent (React + Netlify Functions)

This project lets a user submit an arXiv paper id and have a real-time **voice conversation** with an AI agent that is knowledgeable about that paper.

## How it works

1. The user enters an arXiv id in the browser and clicks **Create agent**.
2. A Netlify background function (`create-agent-background`) kicks off a pipeline:
   - Fetches the paper title, abstract, and PDF from arXiv.
   - Calls **Gemini** to generate concise system-prompt instructions from the abstract.
   - Uploads the PDF to the **ElevenLabs Knowledge Base** so the agent can answer questions grounded in the paper's content.
   - Creates an **ElevenLabs Conversational AI** agent configured with those instructions and the knowledge-base document.
3. The UI polls `agent-status` until the job is `ready`.
4. The user clicks **Start conversation**, grants microphone access, and speaks directly with the ElevenLabs voice agent via a signed WebSocket URL.

## Architecture

```
Browser (React + @11labs/react)
  │
  ├─ POST /create-agent-background ──► Netlify background function
  │                                       │
  │                                       ├─ arXiv API  (metadata + PDF)
  │                                       ├─ Gemini API (generate system prompt)
  │                                       ├─ ElevenLabs KB API (upload PDF)
  │                                       └─ ElevenLabs Agents API (create agent)
  │
  ├─ GET  /agent-status            ──► Netlify function (poll job status)
  │
  └─ GET  /get-conversation-url    ──► Netlify function
                                         └─ ElevenLabs (signed WebSocket URL)
                                              │
                                              └─ @11labs/react SDK ◄── voice conversation
```

## Netlify functions

| Function | Method | Description |
|---|---|---|
| `create-agent-background` | `POST` | Kicks off the full agent-creation pipeline; returns a job id immediately. |
| `agent-status` | `GET` | Returns the current status (`queued` / `processing` / `ready` / `failed`) of a job. |
| `get-conversation-url` | `GET` | Fetches a short-lived signed WebSocket URL for starting a voice session. |

## Environment variables

Set the following in your Netlify site settings (or a local `.env` file for `netlify dev`):

| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API key used to upload documents, create agents, and sign conversation URLs. |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key used to generate agent instructions from paper abstracts. |
| `GEMINI_MODEL` | ❌ | Gemini model ID (default: `gemini-2.0-flash`). |
| `CORS_ALLOWED_ORIGINS` | ❌ | Comma-separated list of allowed origins (default: local Vite and Netlify dev ports). |

## Local development

```bash
npm install
npm run dev
```

For local function testing, use the Netlify CLI:

```bash
netlify dev
```

