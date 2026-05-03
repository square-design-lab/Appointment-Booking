import React from 'react';
import { useBooking } from '../BookingContext';

// Phase 3 — placeholder. Full implementation builds the registration form + booking API calls.
export default function Step3Registration() {
  const { setCurrentStep } = useBooking();

  return (
    <div className="vbf-card">
      <h1 className="vbf-step-title">Your Information</h1>
      <div className="vbf-callout vbf-callout--info" style={{ marginBottom: 24 }}>
        <span className="vbf-callout-icon">🚧</span>
        <span>
          <strong>Phase 3 — coming next.</strong> Patient registration form, insurance collection,
          and Athena booking API calls will be built here.
        </span>
      </div>
      <div className="vbf-nav">
        <button className="vbf-btn vbf-btn--ghost" onClick={() => setCurrentStep(2)}>
          ← Back
        </button>
        <button className="vbf-btn vbf-btn--primary" onClick={() => setCurrentStep(4)}>
          Book Appointment →
        </button>
      </div>
    </div>
  );
}
