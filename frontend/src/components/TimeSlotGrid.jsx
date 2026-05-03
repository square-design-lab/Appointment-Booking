import React from 'react';

function formatTime(t) {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.padStart(2, '0')} ${period}`;
}

export default function TimeSlotGrid({ slots, selectedId, onSelect }) {
  if (!slots || slots.length === 0) return null;
  return (
    <div className="vbf-time-grid" role="group" aria-label="Available appointment times">
      {slots.map((slot) => (
        <button
          key={slot.appointmentId}
          type="button"
          className={`vbf-time-btn${selectedId === slot.appointmentId ? ' vbf-time-btn--selected' : ''}`}
          onClick={() => onSelect(slot)}
          aria-pressed={selectedId === slot.appointmentId}
        >
          {formatTime(slot.time)}
        </button>
      ))}
    </div>
  );
}
