import React from 'react';
import { useBooking } from '../BookingContext';

// Phase 3 — placeholder for the real confirmation screen.
export default function ConfirmationScreen() {
  const { bookingConfirmation, providerInfo, urlParams, locationInfo, selectedReason } = useBooking();

  return (
    <div className="vbf-card">
      <div className="vbf-confirm-hero">
        <div className="vbf-confirm-check" aria-label="Success">✓</div>
        <h1 className="vbf-confirm-title">Your appointment is confirmed!</h1>
        <p className="vbf-confirm-subtitle">
          A confirmation email has been sent to your email address.
        </p>
      </div>

      {selectedReason && (
        <div className="vbf-confirm-summary">
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Appointment type</span>
            <span className="vbf-confirm-summary-value">{selectedReason.reason}</span>
          </div>
        </div>
      )}

      {locationInfo && (
        <div className="vbf-confirm-summary">
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Location</span>
            <span className="vbf-confirm-summary-value">
              {locationInfo.name}<br />
              <span style={{ fontWeight: 400, color: 'var(--c-text-secondary)', fontSize: 13 }}>
                {locationInfo.address}
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="vbf-confirm-next">
        <div className="vbf-confirm-next-title">What to expect next</div>
        <p>
          Your provider will review your information before your visit.
        </p>
        <p>
          If you need to cancel or reschedule, please call{' '}
          <a href="tel:6512171480" style={{ color: 'var(--c-primary)', fontWeight: 600 }}>
            (651) 217-1480
          </a>{' '}
          at least 24 hours before your appointment.
        </p>
      </div>

      <div className="vbf-confirm-actions">
        <a href="https://vantagementalhealth.org" className="vbf-btn vbf-btn--ghost">
          Return to Vantage Mental Health
        </a>
      </div>
    </div>
  );
}
