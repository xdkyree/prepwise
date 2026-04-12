import { useStore } from '../store'

const CATEGORY_ORDER = ['Proteins', 'Produce', 'Grains', 'Dairy', 'Pantry', 'Other'] as const

export default function Groceries() {
  const {
    groceryList, bulkItems, bulkAllocations,
    toggleGroceryItem, updateGroceryQty, resetGroceries, allocateBulk,
    isGenerating, checkoutGroceries, weekPlan, setActiveTab,
    checkoutProvider, checkoutIntegrationMode,
  } = useStore()

  const checkedCount = groceryList.filter((i) => i.checked).length
  const totalCount = groceryList.length
  const providerLabel = checkoutProvider === 'picnic' ? 'Picnic' : 'Store'
  const modeLabel =
    checkoutIntegrationMode === 'live'
      ? 'Last checkout used live cart integration.'
      : 'Checkout runs in live mode when valid Picnic credentials are provided.'

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: groceryList
      .map((item, idx) => ({ ...item, idx }))
      .filter((item) => item.cat === cat),
  })).filter((g) => g.items.length > 0)

  if (groceryList.length === 0) {
    return (
      <div>
        <div className="section-header">
          <span className="section-num">01</span>
          <span className="section-title">Grocery List</span>
        </div>
        <div className="empty-state">
          No grocery list yet.<br />
          Generate a plan first.
          <div style={{ marginTop: '12px' }}>
            <button
              className="btn-mid"
              onClick={() => setActiveTab(Object.keys(weekPlan).length > 0 ? 'plan' : 'setup')}
            >
              {Object.keys(weekPlan).length > 0 ? 'Open Plan' : 'Open Setup'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header row */}
      <div className="grocery-header-row">
        <span className="grocery-counter">
          {checkedCount} / {totalCount} selected for checkout
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-mid" onClick={checkoutGroceries} disabled={isGenerating}>
            {isGenerating ? 'Syncing...' : `Checkout ${providerLabel}`}
          </button>
          <button className="btn-reset" onClick={resetGroceries}>
            Clear selections
          </button>
        </div>
      </div>

      <div className="grocery-counter" style={{ marginBottom: '10px' }}>
        Active provider: {providerLabel}. More store providers will be available soon. {modeLabel}
      </div>

      {/* Category groups */}
      {grouped.map(({ cat, items }) => (
        <div key={cat} className="grocery-category">
          <div className="cat-label">{cat}</div>
          {items.map(({ idx, item, qty, checked }) => (
            <div
              key={idx}
              className={`grocery-item${checked ? ' checked' : ''}`}
              onClick={() => toggleGroceryItem(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleGroceryItem(idx)
                }
              }}
              aria-pressed={Boolean(checked)}
            >
              <div className="grocery-checkbox">
                {checked && <span className="grocery-checkbox-tick">✓</span>}
              </div>
              <div className="grocery-item-info">
                <div className="grocery-item-name">
                  {item}
                </div>
              </div>
              <input
                className="grocery-qty-input"
                value={qty}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateGroceryQty(idx, e.target.value)}
                aria-label={`Quantity for ${item}`}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Bulk Allocator */}
      {bulkItems.trim() && (
        <div className="bulk-section">
          <div className="section-header" style={{ marginBottom: '12px' }}>
            <span className="section-num">B</span>
            <span className="section-title">Bulk Allocator</span>
          </div>

          {bulkAllocations.length === 0 ? (
            <button
              className="btn-mid"
              onClick={allocateBulk}
              disabled={isGenerating}
            >
              {isGenerating
                ? <><span className="spinner spinner--light" /> Allocating…</>
                : 'Allocate Bulk Items'}
            </button>
          ) : (
            <div className="bulk-alloca-list">
              {bulkAllocations.map((alloc, i) => (
                <div key={i} className="bulk-alloc-item">
                  <div>
                    <span className="bulk-alloc-meal">{alloc.meal}</span>
                    {' — '}
                    <span className="bulk-alloc-detail">{alloc.item}</span>
                    {': '}
                    <span className="bulk-alloc-amt">{alloc.amount}</span>
                  </div>
                  {alloc.tip && (
                    <div className="bulk-alloc-tip">{alloc.tip}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
