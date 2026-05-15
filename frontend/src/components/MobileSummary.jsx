import React from 'react';
import { useBooking } from '../BookingContext';

function fmt12h(t) {
  if (!t) return '';
  const [h, m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m.padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function MobileSummary() {
  const { providerInfo, urlParams, selectedDate, selectedTime } = useBooking();
  const name = providerInfo?.name || urlParams.providerName || '';
  if (!name) return null;

  const datePart = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  const timePart = selectedTime ? fmt12h(selectedTime) : null;

  return (
    <div className="vbf-mobile-summary" aria-hidden="true">
      <div className="vbf-mobile-summary-left">
        {providerInfo?.photo && (
          <img
            src={providerInfo.photo}
            alt=""
            className="vbf-mobile-summary-photo"
          />
        )}
        <div className="vbf-mobile-summary-provider">{name}</div>
      </div>
      {(datePart || timePart) && (
        <div className="vbf-mobile-summary-dt">
          {[datePart, timePart].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
