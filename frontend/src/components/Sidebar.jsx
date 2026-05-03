import React from 'react';
import { useBooking } from '../BookingContext';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  // timeStr may be "HH:MM" (24h) or already formatted
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export default function Sidebar() {
  const {
    providerInfo,
    providerLoading,
    urlParams,
    locationInfo,
    currentStep,
    selectedReason,
    selectedDate,
    selectedTime,
    visitType,
  } = useBooking();

  const providerName = providerInfo?.name || urlParams.providerName || '';
  const credentials  = providerInfo?.credentials || '';
  const photo        = providerInfo?.photo || null;

  return (
    <div className="vbf-sidebar">
      {/* Provider header */}
      <div className="vbf-sidebar-header">
        {photo ? (
          <img
            src={photo}
            alt={providerName}
            className="vbf-sidebar-photo"
          />
        ) : (
          <div className="vbf-sidebar-photo-placeholder" aria-hidden="true">
            {providerLoading ? '…' : (providerName ? providerName[0] : '?')}
          </div>
        )}
        <div>
          {providerLoading ? (
            <>
              <div className="vbf-skeleton" style={{ width: 140, height: 16, marginBottom: 6 }} />
              <div className="vbf-skeleton" style={{ width: 80, height: 12 }} />
            </>
          ) : (
            <>
              <div className="vbf-sidebar-provider-name">{providerName || 'Your Provider'}</div>
              {credentials && (
                <div className="vbf-sidebar-provider-creds">{credentials}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Summary rows — build up as patient makes selections */}
      <div className="vbf-sidebar-body">
        {/* Location — always show if known */}
        {locationInfo && (
          <div className="vbf-summary-row">
            <span className="vbf-summary-icon">📍</span>
            <div className="vbf-summary-content">
              <div className="vbf-summary-label">Location</div>
              <div className="vbf-summary-value">{locationInfo.name}</div>
              <div className="vbf-summary-value" style={{ fontWeight: 400, color: 'var(--c-text-secondary)', fontSize: 12, marginTop: 2 }}>
                {locationInfo.address}
              </div>
            </div>
          </div>
        )}

        {/* Visit method — show once chosen */}
        {visitType && (
          <div className="vbf-summary-row">
            <span className="vbf-summary-icon">{visitType === 'telehealth' ? '💻' : '🏥'}</span>
            <div className="vbf-summary-content">
              <div className="vbf-summary-label">Visit Type</div>
              <div className="vbf-summary-value">
                {visitType === 'telehealth' ? 'Video Visit (Telehealth)' : 'In Person'}
              </div>
            </div>
          </div>
        )}

        {/* Appointment reason — show once selected in Step 1 */}
        {selectedReason && (
          <div className="vbf-summary-row">
            <span className="vbf-summary-icon">📋</span>
            <div className="vbf-summary-content">
              <div className="vbf-summary-label">Appointment Type</div>
              <div className="vbf-summary-value">{selectedReason.reason}</div>
            </div>
          </div>
        )}

        {/* Date & time — show once selected in Step 2 */}
        {selectedDate && (
          <div className="vbf-summary-row">
            <span className="vbf-summary-icon">📅</span>
            <div className="vbf-summary-content">
              <div className="vbf-summary-label">Date & Time</div>
              <div className="vbf-summary-value">
                {formatDate(selectedDate)}
                {selectedTime && <>, {formatTime(selectedTime)}</>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help callout */}
      <div className="vbf-sidebar-help">
        Need help?{' '}
        <a href="tel:6512171480">Call (651) 217-1480</a>
      </div>
    </div>
  );
}
