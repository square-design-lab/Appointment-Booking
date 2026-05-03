import React from 'react';

export default function ReasonCard({ reason, selected, onClick }) {
  return (
    <div
      className={`vbf-reason-card${selected ? ' vbf-reason-card--selected' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
    >
      <div>
        <div className="vbf-reason-card__name">{reason.reason}</div>
        {reason.description && (
          <div className="vbf-reason-card__desc">{reason.description}</div>
        )}
      </div>
      <div className="vbf-reason-card__check" aria-hidden="true">
        <div className="vbf-reason-card__check-dot" />
      </div>
    </div>
  );
}
