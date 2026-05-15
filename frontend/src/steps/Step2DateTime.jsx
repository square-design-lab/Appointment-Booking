import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useBooking, ATHENA_PRACTICE_ID } from '../BookingContext';
import { fetchSlots, fetchBatchAvailability } from '../api/bookingApi';
import providerContacts from '../data/provider-contacts.json';
import TimeSlotGrid from '../components/TimeSlotGrid';

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Athena returns dates as MM/DD/YYYY — convert to YYYY-MM-DD key
function athenaToKey(s) {
  const [m, d, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Date object → YYYY-MM-DD key
function dateToKey(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Date object → MM/DD/YYYY (Athena API param format)
function dateToAthena(d) {
  return [
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

// Last day of a given month (month is 0-based)
function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

// Format a Date for display (e.g. "Monday, May 5")
function formatDateLong(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Step2DateTime() {
  const {
    urlParams,
    serviceLabel,
    setCurrentStep,
    selectedReason,
    selectedDate,    setSelectedDate,
    selectedTime,    setSelectedTime,
    selectedAppointmentId, setSelectedAppointmentId,
  } = useBooking();

  // slotMap: Map<'YYYY-MM-DD', Array<{appointmentId, time, duration}>>
  const [slotMap, setSlotMap]         = useState(new Map());
  const [loading, setLoading]         = useState(false);
  const [slotsError, setSlotsError]   = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Track which YYYY-M keys have been fetched (ref avoids stale-closure loops)
  const fetchedMonthsRef = useRef(new Set());

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Merge a slots-API response into slotMap
  const mergeSlots = useCallback((apiSlots) => {
    setSlotMap((prev) => {
      const next = new Map(prev);
      for (const { date, times } of apiSlots) {
        next.set(athenaToKey(date), times);
      }
      return next;
    });
  }, []);

  // Fetch slots for an explicit date range (or omit both for backend default: today +90d)
  const loadSlots = useCallback(async (startDate, endDate) => {
    setSlotsError(null);
    setLoading(true);
    try {
      const data = await fetchSlots({
        reasonId:     selectedReason?.reasonId,
        providerId:   urlParams.providerId,
        departmentId: urlParams.departmentId,
        startDate,
        endDate,
      });
      mergeSlots(data.slots || []);
    } catch {
      setSlotsError(
        'Unable to load available times. Please try again or call (651) 217-1480.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedReason?.reasonId, urlParams.providerId, urlParams.departmentId, mergeSlots]);

  // On mount: fetch the default window (today → +90 days) and mark first 3 months
  useEffect(() => {
    const d = new Date();
    for (let i = 0; i < 3; i++) {
      const y = d.getFullYear() + Math.floor((d.getMonth() + i) / 12);
      const m = (d.getMonth() + i) % 12;
      fetchedMonthsRef.current.add(`${y}-${m}`);
    }
    loadSlots(undefined, undefined);
  // loadSlots is stable for the lifetime of this step
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user navigates to a month not yet covered, fetch it
  function handleMonthChange(date) {
    setCalendarMonth(date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!fetchedMonthsRef.current.has(key)) {
      fetchedMonthsRef.current.add(key);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end   = lastDayOfMonth(date.getFullYear(), date.getMonth());
      const from  = start < today ? today : start;
      if (from <= end) {
        loadSlots(dateToAthena(from), dateToAthena(end));
      }
    }
  }

  // Set of date keys that have at least one slot
  const availableKeys = useMemo(() => new Set(slotMap.keys()), [slotMap]);

  function isDisabled(day) {
    if (day < today) return true;
    return !availableKeys.has(dateToKey(day));
  }

  // Slots for the currently selected date
  const selectedKey = selectedDate ? dateToKey(selectedDate) : null;
  const timeSlotsForDate = selectedKey ? (slotMap.get(selectedKey) || []) : [];

  function handleDaySelect(day) {
    setSelectedDate(day || null);
    setSelectedTime(null);
    setSelectedAppointmentId(null);
  }

  function handleTimeSelect(slot) {
    setSelectedTime(slot.time);
    setSelectedAppointmentId(slot.appointmentId);
  }

  // Similar providers: same specialty, different provider
  const similarProviders = useMemo(() => {
    if (!urlParams.providerId || !serviceLabel) return [];
    return providerContacts
      .filter((p) => {
        if (String(p.athena_provider_id) === String(urlParams.providerId)) return false;
        return (p.specialties || []).some(s => s.toLowerCase() === serviceLabel.toLowerCase());
      })
      .slice(0, 3);
  }, [urlParams.providerId, serviceLabel]);

  // Availability check for similar providers — filter out those with no slots
  const [similarAvailability, setSimilarAvailability] = useState(null);

  useEffect(() => {
    if (similarProviders.length === 0) {
      setSimilarAvailability(new Map());
      return;
    }
    fetchBatchAvailability(
      similarProviders.map((p) => ({
        providerId:   String(p.athena_provider_id),
        departmentId: String(p.departmentId),
      }))
    )
      .then((data) => {
        const map = new Map();
        for (const { providerId, hasSlots } of data.results || []) {
          map.set(String(providerId), hasSlots);
        }
        setSimilarAvailability(map);
      })
      .catch(() => setSimilarAvailability(new Map())); // fail open — show all
  }, [similarProviders]);

  // Only show similar providers whose availability is confirmed (or still loading)
  const visibleSimilarProviders = useMemo(() => {
    if (!similarAvailability) return similarProviders; // still loading — show all
    return similarProviders.filter(
      (p) => similarAvailability.get(String(p.athena_provider_id)) !== false
    );
  }, [similarProviders, similarAvailability]);

  // Build a redirect URL for a similar provider.
  // Generates the same format WordPress produces:
  //   locationId/practitionerId  → composite (practiceId-athenaId)
  //   departmentId/providerId    → plain Athena IDs
  // Provider-specific params (minAge, maxAge, telehealthLocs) come from the
  // target provider's own data; session params (dob, service, etc.) are kept.
  function similarProviderUrl(provider) {
    const provId = String(provider.athena_provider_id);
    const deptId = String(provider.departmentId);
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({
          locationId:      `${ATHENA_PRACTICE_ID}-${deptId}`,
          practitionerId:  `${ATHENA_PRACTICE_ID}-${provId}`,
          dob:             urlParams.dob             || '',
          patientType:     urlParams.patientType     || '',
          service:         urlParams.service         || '',
          visitType:       urlParams.visitType       || '',
          telehealthState: urlParams.telehealthState || '',
          insurance:       urlParams.insurance       || '',
        }).filter(([, v]) => v !== '')
      )
    );
    return `/book/?${qs.toString()}`;
  }

  const canProceed = !!selectedDate && !!selectedAppointmentId;

  return (
    <div className="vbf-card">
      <h1 className="vbf-step-title">Choose a Date &amp; Time</h1>

      {slotsError && (
        <div className="vbf-callout vbf-callout--error" style={{ marginBottom: 20 }}>
          <span className="vbf-callout-icon" aria-hidden="true" />
          <span>{slotsError}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Calendar ────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 auto' }}>
          <div className="vbf-section-label" style={{ marginBottom: 8 }}>Select a date</div>
          <div className="vbf-calendar-wrap">
            {loading && availableKeys.size === 0 ? (
              <div className="vbf-loading-block">
                <div className="vbf-skeleton" style={{ width: 280, height: 264, borderRadius: 10 }} />
              </div>
            ) : (
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleDaySelect}
                month={calendarMonth}
                onMonthChange={handleMonthChange}
                disabled={isDisabled}
                fromDate={today}
              />
            )}
          </div>
          {loading && availableKeys.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--c-text-muted)' }}>
              <span className="vbf-spinner vbf-spinner--dark" style={{ width: 14, height: 14 }} />
              Loading more dates…
            </div>
          )}
        </div>

        {/* ── Time slots ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {!selectedDate ? (
            <div style={{ color: 'var(--c-text-muted)', fontSize: 14, paddingTop: 4 }}>
              Select a highlighted date to see available times.
            </div>
          ) : (
            <>
              <div className="vbf-section-label" style={{ marginBottom: 8 }}>
                Times on {formatDateLong(selectedDate)}
              </div>
              {timeSlotsForDate.length === 0 ? (
                <div className="vbf-callout vbf-callout--info">
                  <span className="vbf-callout-icon" aria-hidden="true" />
                  <span>No times available for this date. Please select a different day.</span>
                </div>
              ) : (
                <TimeSlotGrid
                  slots={timeSlotsForDate}
                  selectedId={selectedAppointmentId}
                  onSelect={handleTimeSelect}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Similar providers ──────────────────────────────────────── */}
      {visibleSimilarProviders.length > 0 && (
        <div className="vbf-similar">
          <div className="vbf-divider" />
          {serviceLabel && <div className="vbf-similar-title">Other providers also offering {serviceLabel}</div>}
          {visibleSimilarProviders.map((p) => (
            <div key={p.athena_provider_id} className="vbf-similar-card">
              {p.photo ? (
                <img src={p.photo} alt={p.name} className="vbf-similar-photo" />
              ) : (
                <div
                  className="vbf-similar-photo"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--c-text-muted)', background: 'var(--c-disabled-bg)' }}
                >
                  {p.name.charAt(0)}
                </div>
              )}
              <div className="vbf-similar-info">
                <div className="vbf-similar-name">{p.name}</div>
                <div className="vbf-similar-specialty">{p.provider_title}</div>
              </div>
              <a href={similarProviderUrl(p)} className="vbf-btn vbf-btn--ghost vbf-btn--sm">
                View
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <div className="vbf-nav">
        <button
          className="vbf-btn vbf-btn--ghost"
          onClick={() => setCurrentStep(1)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.22,9.28l-4-4A.751.751,0,0,1,.235,4.2L4.22.22A.75.75,0,0,1,5.28,1.281L2.561,4H14.75a.75.75,0,0,1,0,1.5H2.561L5.28,8.22A.75.75,0,1,1,4.22,9.28Z" transform="translate(4.25 7.25)" fill="currentColor"/>
          </svg>
          Back
        </button>
        <button
          className="vbf-btn vbf-btn--primary"
          onClick={() => setCurrentStep(3)}
          disabled={!canProceed}
          aria-disabled={!canProceed}
        >
          Next: Registration
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10.22,9.28a.75.75,0,0,1,0-1.06l2.72-2.72H.75A.75.75,0,0,1,.75,4H12.938L10.22,1.281A.75.75,0,1,1,11.281.22l4,4a.749.749,0,0,1,0,1.06l-4,4a.75.75,0,0,1-1.061,0Z" transform="translate(4.25 7.25)" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
