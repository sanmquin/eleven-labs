# arXiv Paper Agent (React + Netlify Functions)

This project provides a TypeScript React app where a user submits an arXiv id, then:

1. A Netlify background function fetches the arXiv abstract and downloads the PDF.
2. Gemini generates paper-agent instructions from the abstract and uploads the PDF into Gemini Files.
3. The UI polls for agent completion and enables chat after microphone access is granted.

## Environment variables

Set the following variables for Netlify Functions:

- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (optional, defaults to `gemini-2.0-flash`)

## Local development

```bash
npm install
npm run dev
```

For local function testing, run through Netlify CLI (if available):

```bash
netlify dev
```
