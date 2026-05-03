import React from 'react';

const STEPS = [
  { n: 1, label: 'Details' },
  { n: 2, label: 'Date & Time' },
  { n: 3, label: 'Registration' },
];

export default function ProgressBar({ currentStep }) {
  return (
    <nav className="vbf-progress" aria-label="Booking steps">
      {STEPS.map((step, i) => {
        const done   = currentStep > step.n;
        const active = currentStep === step.n;
        const cls    = done ? 'vbf-progress-step--done' : active ? 'vbf-progress-step--active' : '';

        return (
          <React.Fragment key={step.n}>
            {i > 0 && (
              <div
                className={`vbf-progress-connector${done ? ' vbf-progress-connector--done' : ''}`}
                aria-hidden="true"
              />
            )}
            <div className={`vbf-progress-step ${cls}`} aria-current={active ? 'step' : undefined}>
              <div className="vbf-progress-num">
                {done ? '✓' : step.n}
              </div>
              <span className="vbf-progress-label">{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
