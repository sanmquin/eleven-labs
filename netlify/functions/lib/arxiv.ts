export interface ArxivPaper {
  arxivId: string
  title: string
  abstract: string
  pdfBuffer: Buffer
  pdfFilename: string
}

const ARXIV_XML_ENDPOINT = 'https://export.arxiv.org/api/query?id_list='

export function normalizeArxivId(input: string): string {
  return input.trim().replace(/^arxiv:/i, '')
}

export function isValidArxivId(input: string): boolean {
  const value = normalizeArxivId(input)
  const modernId = /^\d{4}\.\d{4,5}(v\d+)?$/
  const legacyId = /^[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?$/i

  return modernId.test(value) || legacyId.test(value)
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match?.[1]) {
    return ''
  }

  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export async function fetchArxivPaper(arxivId: string): Promise<ArxivPaper> {
  const id = normalizeArxivId(arxivId)
  const xmlResponse = await fetch(`${ARXIV_XML_ENDPOINT}${encodeURIComponent(id)}`)

  if (!xmlResponse.ok) {
    throw new Error(`Unable to read arXiv metadata (${xmlResponse.status})`)
  }

  const xml = await xmlResponse.text()
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i)

  if (!entryMatch) {
    throw new Error('No paper found for the provided arXiv id')
  }

  const entry = entryMatch[1]
  const title = decodeXmlEntities(extractTag(entry, 'title'))
  const abstract = decodeXmlEntities(extractTag(entry, 'summary'))

  if (!abstract) {
    throw new Error('Could not extract paper abstract from arXiv')
  }

  const pdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(id)}.pdf`
  const pdfResponse = await fetch(pdfUrl)

  if (!pdfResponse.ok) {
    throw new Error(`Unable to download PDF (${pdfResponse.status})`)
  }

  const arrayBuffer = await pdfResponse.arrayBuffer()

  return {
    arxivId: id,
    title,
    abstract,
    pdfBuffer: Buffer.from(arrayBuffer),
    pdfFilename: `${id.replace(/\//g, '_')}.pdf`,
  }
}
