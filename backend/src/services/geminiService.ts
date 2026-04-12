const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 120000)
const GEMINI_URL = GEMINI_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`
  : ''

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

export function parseJsonText<T>(raw: string): T {
  const firstObject = raw.indexOf('{')
  const firstArray = raw.indexOf('[')
  const startCandidates = [firstObject, firstArray].filter((value) => value >= 0)
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1

  const lastObject = raw.lastIndexOf('}')
  const lastArray = raw.lastIndexOf(']')
  const end = Math.max(lastObject, lastArray)

  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON payload found in Gemini response')
  }

  const slice = raw.slice(start, end + 1)
  try {
    return JSON.parse(slice) as T
  } catch {
    throw new Error('Gemini returned invalid JSON')
  }
}

export function tryParseJsonText<T>(raw: string): T | undefined {
  try {
    return parseJsonText<T>(raw)
  } catch {
    return undefined
  }
}

export async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY')
  }

  const timeoutSignal = AbortSignal.timeout(
    Number.isFinite(GEMINI_TIMEOUT_MS) && GEMINI_TIMEOUT_MS > 0 ? GEMINI_TIMEOUT_MS : 120000
  )

  let res: Response
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutSignal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms`)
    }
    throw error
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = (await res.json()) as GeminiResponse
  const candidates = Array.isArray(data.candidates) ? data.candidates : []
  const firstCandidate = candidates[0]
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate?.content?.parts : []
  const textPart = parts.find((part) => typeof part?.text === 'string' && part.text.trim().length > 0)

  if (!textPart?.text) {
    throw new Error('Gemini returned no text candidate')
  }

  return textPart.text
}
