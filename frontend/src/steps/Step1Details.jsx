import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBooking } from '../BookingContext';
import { fetchReasons, fetchSlots } from '../api/bookingApi';
import ReasonCard from '../components/ReasonCard';
import ErrorScreen from '../components/ErrorScreen';

// Keyword sets for fuzzy-matching a service slug to an Athena reason name
const SERVICE_KEYWORDS = {
  psychiatry:           ['psychiatr', 'medication management', 'med management'],
  'therapy-individual': ['individual', 'mental health therapy'],
  'therapy-family':     ['family'],
  'therapy-couples':    ['couples', 'couple'],
  'therapy-child':      ['child'],
  'therapy-teen':       ['teen', 'adolescent'],
  'therapy-group':      ['group'],
  tms:                  ['tms', 'transcranial'],
  adhd:                 ['adhd'],
  'psych-testing':      ['psychopharmacolog', 'psych test'],
};

function findBestReasonMatch(serviceSlug, reasons) {
  if (!serviceSlug || !reasons.length) return null;
  const keywords = SERVICE_KEYWORDS[serviceSlug] || [];
  for (const reason of reasons) {
    const name = (reason.reason || '').toLowerCase();
    if (keywords.some((kw) => name.includes(kw))) return reason;
  }
  return null;
}

function parseTelehealthLocs(raw) {
  const locs = (raw || '').toLowerCase().split(',').map((s) => s.trim());
  return {
    hasMN: locs.some((l) => l.includes('telehealth - mn')),
    hasWI: locs.some((l) => l.includes('telehealth - wi')),
  };
}

function calculateAge(dobString) {
  // dobString: YYYY-MM-DD
  const today = new Date();
  const [y, m, d] = dobString.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function validateDob(value) {
  if (!value) return 'Please enter your date of birth.';
  const parts = value.split('-');
  // Wait until year is fully entered
  if (parts.length !== 3 || parts[0].length !== 4) return null;
  const d = new Date(value + 'T12:00:00');
  if (isNaN(d.getTime())) return 'Please enter a valid date of birth.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d > today) return 'Date of birth cannot be in the future.';
  if (d.getFullYear() < 1900) return 'Please enter a valid date of birth.';
  return null;
}

function getTelehealthStateError(patientState, telehealthLocs, providerName) {
  const name = providerName || 'This provider';
  const { hasMN, hasWI } = parseTelehealthLocs(telehealthLocs);

  if (patientState === 'mn') {
    if (!hasMN) return `${name} does not currently offer virtual care in Minnesota. Please call (651) 217-1480 for assistance.`;
    return null; // ok
  }
  if (patientState === 'other') {
    if (hasWI) {
      return `${name} does not offer virtual care for patients outside of Minnesota or Wisconsin. Please call (651) 217-1480 or choose a different provider.`;
    }
    return `${name} does not offer virtual care for patients outside of Minnesota. Please call (651) 217-1480 or choose a different provider.`;
  }
  return null;
}

const IN_PERSON_ONLY = ['tms', 'psych-testing'];

export default function Step1Details() {
  const {
    urlParams,
    providerInfo,
    providerMinAge,
    providerMaxAge,
    providerTelehealthLocs,
    setCurrentStep,
    patientType,    setPatientType,
    visitType,      setVisitType,
    telehealthState, setTelehealthState,
    dob,            setDob,
    selectedReason, setSelectedReason,
  } = useBooking();

  // Reasons state
  const [reasons, setReasons]               = useState([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [reasonsError, setReasonsError]     = useState(null);

  // DOB validation
  const [dobError, setDobError]     = useState(null);
  const [dobTouched, setDobTouched] = useState(false);

  // Telehealth state error
  const [thStateError, setThStateError] = useState(null);

  // Background slot availability check
  // 'idle' | 'loading' | 'ok' | 'none'
  const [slotsCheckStatus, setSlotsCheckStatus] = useState('idle');
  const [nextPending,      setNextPending]      = useState(false);
  const slotsCheckIdRef = useRef(0);

  // Derived telehealth provider state (from provider-contacts.json via context)
  const { hasMN, hasWI } = parseTelehealthLocs(providerTelehealthLocs);

  // If telehealthState is already pre-filled from URL params, silently consume it
  useEffect(() => {
    if (urlParams.telehealthState && !telehealthState) {
      setTelehealthState(urlParams.telehealthState);
    }
  }, [urlParams.telehealthState]);

  // Load reasons when patientType, departmentId, or providerId changes
  const loadReasons = useCallback(() => {
    const { departmentId, providerId } = urlParams;
    if (!departmentId || !providerId) {
      setReasonsError('Provider or department information is missing. Please return to the previous page and try again.');
      return;
    }
    setReasonsLoading(true);
    setReasonsError(null);
    fetchReasons({ departmentId, providerId, patientType })
      .then((data) => {
        const list = data.reasons || [];
        setReasons(list);
        // Auto-select the reason that matches the URL service slug
        if (!selectedReason && urlParams.service) {
          const match = findBestReasonMatch(urlParams.service, list);
          if (match) setSelectedReason(match);
        }
      })
      .catch(() => {
        setReasonsError('Unable to load appointment types. Please try again or call (651) 217-1480.');
      })
      .finally(() => setReasonsLoading(false));
  }, [urlParams.departmentId, urlParams.providerId, patientType]);

  useEffect(() => {
    loadReasons();
  }, [loadReasons]);

  // Re-validate telehealth state when visitType / telehealthState changes
  useEffect(() => {
    if (visitType !== 'telehealth' || !telehealthState) {
      setThStateError(null);
      return;
    }
    const err = getTelehealthStateError(
      telehealthState,
      providerTelehealthLocs,
      providerInfo?.name || ''
    );
    setThStateError(err);
  }, [visitType, telehealthState, providerTelehealthLocs, providerInfo?.name]);

  // Background slot check — fires whenever reason or visitType changes
  useEffect(() => {
    if (!selectedReason || !visitType) {
      setSlotsCheckStatus('idle');
      return;
    }
    setSlotsCheckStatus('loading');
    const checkId = ++slotsCheckIdRef.current;
    fetchSlots({
      reasonId:     selectedReason.reasonId,
      providerId:   urlParams.providerId,
      departmentId: urlParams.departmentId,
    })
      .then((data) => {
        if (slotsCheckIdRef.current !== checkId) return; // stale
        const hasAny = (data.slots || []).some((day) => (day.times || []).length > 0);
        setSlotsCheckStatus(hasAny ? 'ok' : 'none');
      })
      .catch(() => {
        if (slotsCheckIdRef.current !== checkId) return;
        setSlotsCheckStatus('ok'); // fail open — don't block user on API error
      });
  }, [selectedReason?.reasonId, visitType, urlParams.providerId, urlParams.departmentId]);

  // If Next was clicked while check was still loading, proceed once check resolves
  useEffect(() => {
    if (!nextPending) return;
    if (slotsCheckStatus === 'ok') {
      setNextPending(false);
      setCurrentStep(2);
    } else if (slotsCheckStatus === 'none') {
      setNextPending(false); // error message shows via slotsCheckStatus
    }
  }, [slotsCheckStatus, nextPending]);

  // DOB change handler
  function handleDobChange(e) {
    const val = e.target.value;
    setDob(val);
    setDobTouched(true);
    if (val) {
      const err = validateDob(val);
      setDobError(err);
    } else {
      setDobError(null);
    }
  }

  // Age range check
  function getAgeError() {
    if (!dob) return null;
    const parts = dob.split('-');
    if (parts.length !== 3 || parts[0].length !== 4) return null;
    const age = calculateAge(dob);
    const minAge = providerMinAge;
    const maxAge = providerMaxAge;
    if (age < minAge || age > maxAge) {
      const maxDisplay = maxAge >= 100 ? '100+' : String(maxAge);
      return `This provider sees patients aged ${minAge}–${maxDisplay}. Based on your date of birth you are ${age} years old, which is outside this range. Please call (651) 217-1480 for help finding the right provider.`;
    }
    return null;
  }

  // In-person only service check
  function getInPersonOnlyError() {
    if (!urlParams.service || visitType !== 'telehealth') return null;
    if (IN_PERSON_ONLY.includes(urlParams.service)) {
      const labels = { tms: 'TMS', 'psych-testing': 'Psychopharmacologic Testing' };
      return `${labels[urlParams.service] || 'This service'} is only available in-person. Please select In-Person.`;
    }
    return null;
  }

  const ageError      = getAgeError();
  const inPersonError = getInPersonOnlyError();

  // Filter the loaded reasons list by visit type — client-side, no re-fetch
  const TELEHEALTH_KEYWORDS = ['telehealth', 'tele', 'video', 'virtual'];
  const filteredReasons = useMemo(() => {
    if (!visitType) return reasons;
    return reasons.filter((r) => {
      const text = `${r.reason} ${r.description || ''}`.toLowerCase();
      const isTelehealth = TELEHEALTH_KEYWORDS.some((kw) => text.includes(kw));
      if (visitType === 'telehealth') return isTelehealth;
      if (visitType === 'inperson')   return !isTelehealth;
      return true;
    });
  }, [reasons, visitType]);

  // Show telehealth state question only when visitType=telehealth AND state not already set from URL
  const showTelehealthStateQuestion =
    visitType === 'telehealth' &&
    !inPersonError &&
    !urlParams.telehealthState;

  // All conditions except slot availability
  const baseReady =
    !!patientType &&
    !!visitType &&
    (visitType !== 'telehealth' || (!!telehealthState && !thStateError)) &&
    !!selectedReason &&
    !!dob &&
    !dobError &&
    !ageError &&
    !inPersonError;

  // Next button is disabled when base conditions not met OR slots confirmed unavailable
  const canProceed = baseReady && slotsCheckStatus !== 'none';

  function handleNext() {
    if (!baseReady || slotsCheckStatus === 'none') return;
    if (slotsCheckStatus === 'ok') {
      setCurrentStep(2);
    } else if (slotsCheckStatus === 'loading') {
      setNextPending(true); // will advance automatically when check resolves
    }
  }

  const providerDisplayName = providerInfo?.name || 'your provider';

  return (
    <div className="vbf-card">
      <h1 className="vbf-step-title">Tell us about your visit</h1>

      {/* ── 1. Patient history ─────────────────────────────────────── */}
      <div>
        <div className="vbf-section-label">Have you been seen at Vantage Mental Health before?</div>
        <div className="vbf-toggle-group" role="radiogroup" aria-label="Patient type">
          <input
            type="radio" id="pt-returning" name="patientType" value="returning"
            checked={patientType === 'returning'} onChange={() => setPatientType('returning')}
          />
          <label htmlFor="pt-returning" className={patientType === 'returning' ? 'vbf-checked' : ''}>
            Yes — I'm a returning patient
          </label>

          <input
            type="radio" id="pt-new" name="patientType" value="new"
            checked={patientType === 'new'} onChange={() => setPatientType('new')}
          />
          <label htmlFor="pt-new" className={patientType === 'new' ? 'vbf-checked' : ''}>
            No — I'm a new patient
          </label>
        </div>
      </div>

      <div className="vbf-divider" />

      {/* ── 2. Visit method ────────────────────────────────────────── */}
      <div>
        <div className="vbf-section-label">How would you like to meet?</div>
        <div className="vbf-toggle-group" role="radiogroup" aria-label="Visit method">
          <input
            type="radio" id="vt-inperson" name="visitType" value="inperson"
            checked={visitType === 'inperson'} onChange={() => { setVisitType('inperson'); setTelehealthState(''); setSelectedReason(null); }}
          />
          <label htmlFor="vt-inperson" className={visitType === 'inperson' ? 'vbf-checked' : ''}>
            In Person
          </label>

          <input
            type="radio" id="vt-telehealth" name="visitType" value="telehealth"
            checked={visitType === 'telehealth'} onChange={() => { setVisitType('telehealth'); setSelectedReason(null); }}
          />
          <label htmlFor="vt-telehealth" className={visitType === 'telehealth' ? 'vbf-checked' : ''}>
            Telehealth / Virtual
          </label>
        </div>

        {/* In-person only service error */}
        {inPersonError && (
          <div className="vbf-callout vbf-callout--error" style={{ marginTop: 12 }}>
            <span className="vbf-callout-icon" aria-hidden="true" />
            <span>{inPersonError}</span>
          </div>
        )}

        {/* Telehealth state question — only shown when NOT pre-filled from URL */}
        {showTelehealthStateQuestion && (
          <div style={{ marginTop: 16 }}>
            <div className="vbf-section-label">
              {hasWI
                ? 'Will you be in Minnesota or Wisconsin during your appointment?'
                : 'Will you be in Minnesota during your appointment?'}
            </div>
            <div className="vbf-toggle-group" role="radiogroup" aria-label="Telehealth state">
              <input
                type="radio" id="ths-yes" name="telehealthState" value="mn"
                checked={telehealthState === 'mn'} onChange={() => setTelehealthState('mn')}
              />
              <label htmlFor="ths-yes" className={telehealthState === 'mn' ? 'vbf-checked' : ''}>
                    {hasWI ? 'Yes — I\'ll be in MN or WI' : 'Yes — I\'ll be in Minnesota'}
              </label>

              <input
                type="radio" id="ths-no" name="telehealthState" value="other"
                checked={telehealthState === 'other'} onChange={() => setTelehealthState('other')}
              />
              <label htmlFor="ths-no" className={telehealthState === 'other' ? 'vbf-checked' : ''}>
                    {hasWI ? 'No — I\'ll be outside MN & WI' : 'No — I\'ll be outside Minnesota'}
              </label>
            </div>

            {thStateError && (
              <div className="vbf-callout vbf-callout--error" style={{ marginTop: 12 }}>
                <span className="vbf-callout-icon" aria-hidden="true" />
                <span>{thStateError}</span>
              </div>
            )}
          </div>
        )}

        {/* Telehealth state error when state was pre-filled from URL */}
        {!showTelehealthStateQuestion && thStateError && visitType === 'telehealth' && (
          <div className="vbf-callout vbf-callout--error" style={{ marginTop: 12 }}>
            <span className="vbf-callout-icon" aria-hidden="true" />
            <span>{thStateError}</span>
          </div>
        )}
      </div>

      <div className="vbf-divider" />

      {/* ── 3. Appointment reason ──────────────────────────────────── */}
      <div>
        <div className="vbf-section-label">What brings you in?</div>

        {reasonsLoading && (
          <div className="vbf-loading-block">
            {[1,2,3].map((i) => (
              <div key={i} className="vbf-skeleton vbf-loading-row" />
            ))}
          </div>
        )}

        {!reasonsLoading && reasonsError && (
          <ErrorScreen
            title="Unable to load appointment types"
            body={reasonsError}
            onRetry={loadReasons}
          />
        )}

        {!reasonsLoading && !reasonsError && filteredReasons.length === 0 && patientType && (
          <div className="vbf-callout vbf-callout--info">
            <span className="vbf-callout-icon" aria-hidden="true" />
            <span>
              No online appointment types are available for {providerDisplayName} right now.
              Please call <a href="tel:6512171480" style={{ fontWeight: 700 }}>(651) 217-1480</a> to schedule.
            </span>
          </div>
        )}

        {!reasonsLoading && !reasonsError && filteredReasons.length === 0 && !patientType && (
          <div style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>
            Select whether you're a new or returning patient to see available appointment types.
          </div>
        )}

        {!reasonsLoading && !reasonsError && filteredReasons.length > 0 && (
          <div
            className="vbf-reasons-grid"
            role="radiogroup"
            aria-label="Appointment type"
          >
            {filteredReasons.map((r) => (
              <ReasonCard
                key={r.reasonId}
                reason={r}
                selected={selectedReason?.reasonId === r.reasonId}
                onClick={() => setSelectedReason(r)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="vbf-divider" />

      {/* ── 4. Date of birth ───────────────────────────────────────── */}
      <div className="vbf-field">
        <label className="vbf-label" htmlFor="vbf-dob">
          Date of Birth <span className="vbf-label-req">*</span>
        </label>
        <input
          id="vbf-dob"
          type="date"
          className={`vbf-input${dobError || ageError ? ' vbf-input--error' : ''}`}
          value={dob}
          onChange={handleDobChange}
          max={new Date().toISOString().split('T')[0]}
          aria-describedby={dobError || ageError ? 'vbf-dob-error' : undefined}
        />
        {(dobError || ageError) && (
          <div id="vbf-dob-error" className="vbf-field-error" role="alert">
            <span>⚠</span> {dobError || ageError}
          </div>
        )}
      </div>

      {/* ── No-availability message ───────────────────────────────── */}
      {slotsCheckStatus === 'none' && selectedReason && (
        <div className="vbf-callout vbf-callout--error" role="alert" style={{ marginBottom: 8 }}>
          <span className="vbf-callout-icon" aria-hidden="true" />
          <span>
            This provider has no available appointments for the selected visit type. Please call{' '}
            <a href="tel:6512171480" style={{ fontWeight: 700 }}>(651) 217-1480</a> or{' '}
            <a href="https://booking-frontend-717838047212.us-central1.run.app/">choose a different provider</a>.
          </span>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────────── */}
      <div className="vbf-nav">
        <a href="https://booking-frontend-717838047212.us-central1.run.app/" className="vbf-btn vbf-btn--ghost">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.22,9.28l-4-4A.751.751,0,0,1,.235,4.2L4.22.22A.75.75,0,0,1,5.28,1.281L2.561,4H14.75a.75.75,0,0,1,0,1.5H2.561L5.28,8.22A.75.75,0,1,1,4.22,9.28Z" transform="translate(4.25 7.25)" fill="currentColor"/>
          </svg>
          Back
        </a>
        <button
          className="vbf-btn vbf-btn--primary"
          onClick={handleNext}
          disabled={!canProceed || nextPending}
          aria-disabled={!canProceed || nextPending}
        >
          {nextPending ? (
            <>
              <span className="vbf-spinner" style={{ width: 16, height: 16 }} aria-hidden="true" />
              Checking availability…
            </>
          ) : (
            <>
              Next: Date &amp; Time
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10.22,9.28a.75.75,0,0,1,0-1.06l2.72-2.72H.75A.75.75,0,0,1,.75,4H12.938L10.22,1.281A.75.75,0,1,1,11.281.22l4,4a.749.749,0,0,1,0,1.06l-4,4a.75.75,0,0,1-1.061,0Z" transform="translate(4.25 7.25)" fill="currentColor"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
