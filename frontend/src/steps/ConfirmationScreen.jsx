import React from 'react';
import { useBooking } from '../BookingContext';

// ─── .ics generation ──────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatIcsDt(year, month, day, hour, minute) {
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

function generateIcs({ date, time, locationAddress, reasonName, providerName, visitType }) {
  // Parse time as local America/Chicago — use TZID so calendar apps render it correctly
  const [hStr, mStr = '00'] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d  = date.getDate();

  const startDt = formatIcsDt(y, mo, d, h, m);
  // 60-minute block
  const endDate = new Date(y, date.getMonth(), d, h + 1, m, 0);
  const endDt = formatIcsDt(
    endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(),
    endDate.getHours(), endDate.getMinutes()
  );

  const uid = `vantage-${Date.now()}-${Math.random().toString(36).slice(2)}@vantagementalhealth.org`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const descLines = `Provider: ${providerName}\\nVisit type: ${visitType}\\nVantage Mental Health — (651) 217-1480`;
  const safeLocation = (locationAddress || '').replace(/,/g, '\\,');
  const safeSummary  = `Vantage Mental Health — ${reasonName}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vantage Mental Health//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Chicago:${startDt}`,
    `DTEND;TZID=America/Chicago:${endDt}`,
    `SUMMARY:${safeSummary}`,
    `LOCATION:${safeLocation}`,
    `DESCRIPTION:${descLines}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function formatDateLong(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime12h(t) {
  if (!t) return '';
  const [h, m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m.padStart(2, '0')} ${period}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfirmationScreen() {
  const {
    bookingConfirmation,
    providerInfo,
    urlParams,
    locationInfo,
    selectedReason,
    selectedDate,
    selectedTime,
    visitType,
    patientData,
  } = useBooking();

  const providerName  = providerInfo?.name        || urlParams.providerName || 'Your Provider';
  const providerCreds = providerInfo?.credentials || '';
  const providerPhoto = providerInfo?.photo        || null;

  const patientName   = patientData.firstName && patientData.lastName
    ? `${patientData.firstName} ${patientData.lastName}`
    : '';

  const visitLabel = visitType === 'telehealth' ? 'Video Visit (Telehealth)' : 'In Person';

  function handleAddToCalendar() {
    if (!selectedDate || !selectedTime) return;
    const ics = generateIcs({
      date:            selectedDate,
      time:            selectedTime,
      locationAddress: locationInfo?.address || locationInfo?.name || '',
      reasonName:      selectedReason?.reason || 'Appointment',
      providerName,
      visitType:       visitLabel,
    });
    const dateSlug = selectedDate.toISOString().split('T')[0];
    downloadIcs(ics, `vantage-appointment-${dateSlug}.ics`);
  }

  return (
    <div className="vbf-card" style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="vbf-confirm-hero">
        <div className="vbf-confirm-check" aria-label="Appointment confirmed">✓</div>
        <h1 className="vbf-confirm-title">Your appointment is confirmed!</h1>
        {patientData.email && (
          <p className="vbf-confirm-subtitle">
            A confirmation email has been sent to <strong>{patientData.email}</strong>.
          </p>
        )}
      </div>

      {/* ── Provider strip ──────────────────────────────────────── */}
      <div className="vbf-confirm-provider">
        {providerPhoto ? (
          <img
            src={providerPhoto}
            alt={providerName}
            className="vbf-confirm-provider-photo"
          />
        ) : (
          <div
            className="vbf-confirm-provider-photo"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--c-primary-light)', color: 'var(--c-primary)',
              fontSize: 22, fontWeight: 700,
            }}
            aria-hidden="true"
          >
            {providerName.charAt(0)}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{providerName}</div>
          {providerCreds && (
            <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginTop: 2 }}>
              {providerCreds}
            </div>
          )}
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div className="vbf-confirm-summary">

        {selectedDate && (
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Date &amp; Time</span>
            <span className="vbf-confirm-summary-value">
              {formatDateLong(selectedDate)}
              {selectedTime && <> at {formatTime12h(selectedTime)}</>}
            </span>
          </div>
        )}

        {locationInfo && (
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Location</span>
            <span className="vbf-confirm-summary-value">
              {locationInfo.name}
              <br />
              <span style={{ fontWeight: 400, color: 'var(--c-text-secondary)', fontSize: 13 }}>
                {locationInfo.address}
              </span>
            </span>
          </div>
        )}

        <div className="vbf-confirm-summary-row">
          <span className="vbf-confirm-summary-label">Visit Type</span>
          <span className="vbf-confirm-summary-value">{visitLabel}</span>
        </div>

        {selectedReason && (
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Appointment Type</span>
            <span className="vbf-confirm-summary-value">{selectedReason.reason}</span>
          </div>
        )}

        {patientName && (
          <div className="vbf-confirm-summary-row">
            <span className="vbf-confirm-summary-label">Patient</span>
            <span className="vbf-confirm-summary-value">{patientName}</span>
          </div>
        )}

      </div>

      {/* ── What to expect ──────────────────────────────────────── */}
      <div className="vbf-confirm-next">
        <div className="vbf-confirm-next-title">What to expect</div>
        <p>
          Your provider will review your information before your visit.
        </p>
        <p>
          To cancel or reschedule, please call{' '}
          <a href="tel:6512171480" style={{ color: 'var(--c-primary)', fontWeight: 600 }}>
            (651) 217-1480
          </a>{' '}
          at least 24 hours in advance.
        </p>
      </div>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="vbf-confirm-actions">
        {selectedDate && selectedTime && (
          <button
            type="button"
            className="vbf-btn vbf-btn--primary"
            onClick={handleAddToCalendar}
          >
            Add to Calendar
          </button>
        )}
        <a
          href="https://vantagementalhealth.org"
          className="vbf-btn vbf-btn--ghost"
        >
          Return to Vantage Mental Health
        </a>
      </div>

    </div>
  );
}
