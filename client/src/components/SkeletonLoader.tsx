import React from 'react';

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table-wrap" aria-busy="true" aria-label="Loading table...">
      <div className="skeleton-table-head">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="skeleton-box skeleton-th" style={{ width: `${Math.max(60, 100 - c * 10)}px` }} />
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="skeleton-table-row">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="skeleton-box skeleton-td"
                style={{
                  width: c === 0 ? '140px' : c === 1 ? '110px' : '85px',
                  opacity: 1 - r * 0.08
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-metrics-grid" aria-busy="true" aria-label="Loading metrics...">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-metric-card">
          <div className="skeleton-box skeleton-circle" style={{ width: 32, height: 32 }} />
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>
            <div className="skeleton-box skeleton-text" style={{ width: '45%', height: 22 }} />
            <div className="skeleton-box skeleton-text" style={{ width: '75%', height: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="skeleton-kanban-board" aria-busy="true" aria-label="Loading board...">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="skeleton-kanban-col">
          <div className="skeleton-kanban-col-head">
            <div className="skeleton-box skeleton-text" style={{ width: '60%', height: 16 }} />
            <div className="skeleton-box skeleton-circle" style={{ width: 20, height: 20 }} />
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <div className="skeleton-kanban-card" />
            <div className="skeleton-kanban-card" style={{ height: 90 }} />
            <div className="skeleton-kanban-card" style={{ height: 70 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="skeleton-detail-wrap" aria-busy="true" aria-label="Loading details...">
      <div className="skeleton-detail-head">
        <div className="skeleton-box skeleton-text" style={{ width: '35%', height: 28 }} />
        <div className="skeleton-box skeleton-text" style={{ width: '20%', height: 16 }} />
      </div>
      <div className="skeleton-detail-grid">
        <div className="skeleton-box skeleton-card" style={{ height: 220 }} />
        <div className="skeleton-box skeleton-card" style={{ height: 220 }} />
      </div>
    </div>
  );
}
