import { useStore } from '../store'

export default function StatusBanner() {
  const isGenerating = useStore((s) => s.isGenerating)
  const generationStatus = useStore((s) => s.generationStatus)
  const generationError = useStore((s) => s.generationError)
  const generationNotice = useStore((s) => s.generationNotice)
  const lastFailedAction = useStore((s) => s.lastFailedAction)
  const setError = useStore((s) => s.setError)
  const setNotice = useStore((s) => s.setNotice)
  const retryLastAction = useStore((s) => s.retryLastAction)

  const retryLabel =
    lastFailedAction === 'generate'
      ? 'Retry plan generation'
      : lastFailedAction === 'swap'
        ? 'Retry meal swap'
        : lastFailedAction === 'checkout'
          ? 'Retry checkout sync'
          : 'Retry'

  if (isGenerating) {
    return (
      <div className="loading-banner">
        <span className="spinner" />
        <span>{generationStatus || 'Generating...'}</span>
      </div>
    )
  }

  if (generationError) {
    return (
      <div className="error-banner">
        <div className="banner-copy">
          <span>Error: {generationError}</span>
          <span className="banner-guidance">Next step: review this message, update inputs if needed, then retry.</span>
        </div>
        <div className="banner-actions">
          {lastFailedAction && (
            <button className="banner-retry" onClick={() => void retryLastAction()}>
              {retryLabel}
            </button>
          )}
          <button className="error-banner-close" onClick={() => setError(null)} aria-label="Dismiss error message">
            ✕
          </button>
        </div>
      </div>
    )
  }

  if (generationNotice) {
    return (
      <div className="success-banner">
        <span>{generationNotice}</span>
        <button className="error-banner-close" onClick={() => setNotice(null)} aria-label="Dismiss success message">
          ✕
        </button>
      </div>
    )
  }

  return null
}
