import React from 'react';
import { useBooking } from '../BookingContext';

// Phase 2 — placeholder. Full implementation builds CalendarPicker + TimeSlotGrid.
export default function Step2DateTime() {
  const { setCurrentStep, selectedReason } = useBooking();

  return (
    <div className="vbf-card">
      <h1 className="vbf-step-title">Choose a Date &amp; Time</h1>
      <div className="vbf-callout vbf-callout--info" style={{ marginBottom: 24 }}>
        <span className="vbf-callout-icon">🚧</span>
        <span>
          <strong>Phase 2 — coming next.</strong> Calendar and time slot selection will be built here.
          {selectedReason && (
            <> Booking for: <strong>{selectedReason.reason}</strong></>
          )}
        </span>
      </div>
      <div className="vbf-nav">
        <button className="vbf-btn vbf-btn--ghost" onClick={() => setCurrentStep(1)}>
          ← Back
        </button>
        <button className="vbf-btn vbf-btn--primary" onClick={() => setCurrentStep(3)}>
          Next: Registration →
        </button>
      </div>
    </div>
  );
}
