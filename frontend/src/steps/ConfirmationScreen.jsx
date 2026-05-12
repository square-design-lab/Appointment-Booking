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

// ─── Google Calendar URL builder ─────────────────────────────────────────────

function buildGoogleCalendarUrl({ date, time, reasonName, providerName, visitType, locationAddress }) {
  const [hStr, mStr = '00'] = time.split(':');
  const h  = parseInt(hStr, 10);
  const m  = parseInt(mStr, 10);
  const y  = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d  = date.getDate();

  // Local datetime strings — no Z suffix so Google Calendar uses the user's local timezone
  const startDt = formatIcsDt(y, mo, d, h, m);
  const endDate = new Date(y, date.getMonth(), d, h + 1, m, 0);
  const endDt   = formatIcsDt(
    endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(),
    endDate.getHours(), endDate.getMinutes()
  );

  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     `Vantage Mental Health — ${reasonName} with ${providerName}`,
    dates:    `${startDt}/${endDt}`,
    details:  `Provider: ${providerName}\nVisit type: ${visitType}\nVantage Mental Health — (651) 217-1480`,
    location: locationAddress || '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

// ─── Reason-specific "What to Expect" links ──────────────────────────────────
// Empty until Justin provides per-appointment-type URLs.
// Populate as: { 'new patient psychiatry': 'https://vantagementalhealth.org/...' }
const REASON_LINKS = {};

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

  const whatToExpectKey = Object.keys(REASON_LINKS).find(
    (key) => selectedReason?.reason?.toLowerCase().includes(key)
  );

  const calendarArgs = selectedDate && selectedTime ? {
    date:            selectedDate,
    time:            selectedTime,
    locationAddress: locationInfo?.address || locationInfo?.name || '',
    reasonName:      selectedReason?.reason || 'Appointment',
    providerName,
    visitType:       visitLabel,
  } : null;

  function handleAddToGoogleCalendar() {
    if (!calendarArgs) return;
    const url = buildGoogleCalendarUrl(calendarArgs);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleAddToCalendar() {
    if (!calendarArgs) return;
    const ics = generateIcs(calendarArgs);
    const dateSlug = selectedDate.toISOString().split('T')[0];
    downloadIcs(ics, `vantage-appointment-${dateSlug}.ics`);
  }

  return (
    <div className="vbf-card" style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="vbf-confirm-hero">
        <div className="vbf-confirm-check" aria-label="Appointment confirmed">✓</div>
        <h1 className="vbf-confirm-title">Your Appointment is Scheduled</h1>
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

      {/* ── Calendar buttons ────────────────────────────────────── */}
      {calendarArgs && (
        <div className="vbf-confirm-actions">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="vbf-btn vbf-btn--primary"
              onClick={handleAddToGoogleCalendar}
            >
              Add to Google Calendar
            </button>
            <button
              type="button"
              className="vbf-btn vbf-btn--ghost"
              onClick={handleAddToCalendar}
            >
              Add to Other Calendar
            </button>
          </div>
        </div>
      )}

      {/* ── Reschedule / cancel ──────────────────────────────────── */}
      <div className="vbf-confirm-next">
        <div className="vbf-confirm-next-title">Need to reschedule or cancel?</div>
        <p>
          You can do so directly through the reminders you'll receive via email or text,
          or call us at{' '}
          <a href="tel:6512171480" style={{ color: 'var(--c-primary)', fontWeight: 600 }}>
            (651) 217-1480
          </a>{' '}
          and we'll help.
        </p>
      </div>

      {/* ── Next steps ──────────────────────────────────────────── */}
      <div className="vbf-confirm-next">
        <div className="vbf-confirm-next-title">What to Expect Next</div>
        <p>
          <strong>1.</strong>{' '}
          Check your email over the next few days for a welcome message and patient portal
          registration link (if this is your first visit with Vantage Mental Health).
        </p>
        <p>
          <strong>2.</strong>{' '}
          You'll receive check-in instructions via text and email. Please complete this as
          soon as possible so we have accurate, up-to-date information before your visit.
        </p>
        {visitType !== 'telehealth' && (
          <p>
            <strong>3.</strong>{' '}
            Please arrive 5–10 minutes early to your appointment.
          </p>
        )}
        {visitType === 'telehealth' && (
          <p>
            <strong>3.</strong>{' '}
            You'll receive a secure video link via email and text before your appointment.
            We recommend logging in 5 minutes early to test your connection.
          </p>
        )}
      </div>

      {/* ── Dynamic "What to Expect" link (empty until Justin provides URLs) ── */}
      {whatToExpectKey && (
        <div className="vbf-confirm-actions" style={{ paddingTop: 0 }}>
          <a
            href={REASON_LINKS[whatToExpectKey]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--c-primary)', fontWeight: 600 }}
          >
            What to Expect at Your Appointment →
          </a>
        </div>
      )}

      {/* ── Return button ────────────────────────────────────────── */}
      <div className="vbf-confirm-actions">
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
