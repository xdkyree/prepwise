export async function callGemini(prompt: string): Promise<string> {
  void prompt
  throw new Error('Direct Gemini calls are disabled in the frontend. Use backend /api endpoints instead.')
}

export function parseJSON<T>(raw: string): T {
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error('No JSON in response')
  return JSON.parse(raw.slice(s, e + 1)) as T
}
