export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      {/* Day header skeleton */}
      <div className="skel-line" style={{ width: '40%', height: '10px', marginBottom: '14px' }} />

      {/* Meal type tag */}
      <div className="skel-line" style={{ width: '25%', height: '9px', marginBottom: '6px' }} />
      {/* Meal name */}
      <div className="skel-line" style={{ width: '70%', height: '14px', marginBottom: '12px' }} />
      {/* Pan line */}
      <div className="skel-line" style={{ width: '90%', height: '11px', marginBottom: '14px' }} />

      {/* Two macro boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: 'var(--surface2)', padding: '10px 12px' }}>
          <div className="skel-line" style={{ width: '50%', height: '9px', marginBottom: '6px' }} />
          <div className="skel-line" style={{ width: '60%', height: '22px', marginBottom: '4px' }} />
          <div className="skel-line" style={{ width: '40%', height: '11px', marginBottom: '0' }} />
        </div>
        <div style={{ background: 'var(--surface2)', padding: '10px 12px' }}>
          <div className="skel-line" style={{ width: '50%', height: '9px', marginBottom: '6px' }} />
          <div className="skel-line" style={{ width: '60%', height: '22px', marginBottom: '4px' }} />
          <div className="skel-line" style={{ width: '40%', height: '11px', marginBottom: '0' }} />
        </div>
      </div>
    </div>
  )
}
