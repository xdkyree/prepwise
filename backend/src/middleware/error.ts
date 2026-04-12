import type { ErrorResponse } from '../types/contracts.js'

export function buildError(
  error: string,
  message: string,
  details?: Record<string, string>
): ErrorResponse {
  return {
    error,
    message,
    details,
    timestamp: new Date().toISOString(),
  }
}
