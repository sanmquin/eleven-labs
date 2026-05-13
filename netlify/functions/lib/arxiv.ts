/**
 * arXiv metadata and PDF fetching helpers.
 *
 * Uses the public arXiv Atom/XML feed to retrieve paper metadata and then
 * downloads the PDF directly from `arxiv.org`.
 */

/** Metadata and raw PDF content for a single arXiv paper. */
export interface ArxivPaper {
  /** Normalised arXiv paper identifier (e.g. `2404.01234`). */
  arxivId: string
  /** Full paper title. */
  title: string
  /** Paper abstract text. */
  abstract: string
  /** Raw PDF file contents. */
  pdfBuffer: Buffer
  /** Suggested filename for the PDF (e.g. `2404.01234.pdf`). */
  pdfFilename: string
}

const ARXIV_XML_ENDPOINT = 'https://export.arxiv.org/api/query?id_list='

/**
 * Strips an optional `arxiv:` prefix and surrounding whitespace from a user-
 * supplied arXiv identifier.
 *
 * @param input - Raw string entered by the user.
 * @returns Normalised identifier.
 */
export function normalizeArxivId(input: string): string {
  return input.trim().replace(/^arxiv:/i, '')
}

/**
 * Returns `true` when `input` matches either the modern (`YYMM.NNNNN`) or
 * legacy (`category/NNNNNNN`) arXiv identifier format.
 *
 * @param input - Identifier to validate (does not need to be normalised first).
 */
export function isValidArxivId(input: string): boolean {
  const value = normalizeArxivId(input)
  const modernId = /^\d{4}\.\d{4,5}(v\d+)?$/
  const legacyId = /^[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?$/i

  return modernId.test(value) || legacyId.test(value)
}

/** Extracts the text content of the first XML element matching `tag`. */
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

/** Replaces common XML entities with their character equivalents. */
function decodeXmlEntities(value: string): string {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
  }

  return value.replace(/&(lt|gt|amp|quot|#39);/g, (entity) => entities[entity] ?? entity)
}

/**
 * Fetches metadata and the PDF for an arXiv paper.
 *
 * Steps:
 * 1. Queries the arXiv Atom feed to retrieve title and abstract.
 * 2. Downloads the PDF from `arxiv.org/pdf/<id>.pdf`.
 *
 * @param arxivId - Normalised arXiv paper identifier.
 * @returns Metadata and raw PDF buffer for the paper.
 * @throws When the paper cannot be found or the PDF cannot be downloaded.
 */
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
