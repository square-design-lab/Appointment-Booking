import React, { useState, useCallback } from 'react';
import { useBooking } from '../BookingContext';
import {
  findOrCreatePatient,
  bookAppointment,
  writeServiceNote,
  updateInsurance,
  sendAlert,
  createPatientCase,
} from '../api/bookingApi';

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidPhone(v) {
  return /^[\d\s().+-]{10,}$/.test(v) && v.replace(/\D/g, '').length === 10;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidZip(v) {
  return /^\d{5}$/.test(v.trim());
}

function validateDob(value) {
  if (!value) return 'Please enter your date of birth.';
  const parts = value.split('-');
  if (parts.length !== 3 || parts[0].length !== 4) return null;
  const d = new Date(value + 'T12:00:00');
  if (isNaN(d.getTime())) return 'Please enter a valid date of birth.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d > today) return 'Date of birth cannot be in the future.';
  if (d.getFullYear() < 1900) return 'Please enter a valid date of birth.';
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const INSURANCE_OPTIONS = [
  { value: '',                   label: '— Select insurance —' },
  { value: 'self-pay',           label: 'Self-Pay / No Insurance' },
  { value: 'aetna',              label: 'Aetna' },
  { value: 'americas-ppo',       label: "America's PPO" },
  { value: 'bcbs',               label: 'Blue Cross Blue Shield' },
  { value: 'cigna',              label: 'Cigna' },
  { value: 'healthpartners',     label: 'HealthPartners' },
  { value: 'medica',             label: 'Medica' },
  { value: 'medicaid',           label: 'Medicaid' },
  { value: 'medicare',           label: 'Medicare' },
  { value: 'optum',              label: 'Optum' },
  { value: 'ucare',              label: 'UCare' },
  { value: 'united-behavioral',  label: 'United Behavioral Health' },
  { value: 'united-healthcare',  label: 'United Healthcare' },
  { value: 'tricare',            label: 'Tricare' },
  { value: 'other',              label: 'Other / Not Listed' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Step3Registration() {
  const {
    urlParams,
    dob,   setDob,
    setCurrentStep,
    selectedReason,
    selectedDate,
    selectedAppointmentId, setSelectedAppointmentId,
    selectedTime,          setSelectedTime,
    locationInfo,
    patientData,           setPatientData,
    setBookingConfirmation,
    visitType,
  } = useBooking();

  // ── Section A: Patient information ────────────────────────────────────────
  const [firstName,    setFirstName]    = useState(patientData.firstName    || '');
  const [lastName,     setLastName]     = useState(patientData.lastName     || '');
  const [preferredName,setPreferredName]= useState(patientData.preferredName|| '');
  const [legalSex,     setLegalSex]     = useState(patientData.legalSex     || '');
  const [phone,        setPhone]        = useState(patientData.phone        || '');
  const [phoneType,    setPhoneType]    = useState(patientData.phoneType    || '');
  const [smsConsent,   setSmsConsent]   = useState(patientData.smsConsent   || false);
  const [email,        setEmail]        = useState(patientData.email        || '');
  const [confirmEmail, setConfirmEmail] = useState(patientData.confirmEmail || '');
  const [emailConsent, setEmailConsent] = useState(patientData.emailConsent || false);
  const [address1,     setAddress1]     = useState(patientData.address1     || '');
  const [address2,     setAddress2]     = useState(patientData.address2     || '');
  const [city,         setCity]         = useState(patientData.city         || '');
  const [state,        setState]        = useState(patientData.state        || 'MN');
  const [zip,          setZip]          = useState(patientData.zip          || '');

  // ── DOB (editable, syncs back to context) ────────────────────────────────
  const [localDob, setLocalDob] = useState(dob || '');
  const [dobError, setDobError] = useState(null);

  function handleDobChange(e) {
    const val = e.target.value;
    setLocalDob(val);
    const err = validateDob(val);
    setDobError(err);
    if (!err && val) setDob(val);
  }

  // ── Section B: Insurance ──────────────────────────────────────────────────
  const [hasInsurance,   setHasInsurance]   = useState(patientData.hasInsurance   || false);
  const [insuranceName,  setInsuranceName]  = useState(patientData.insuranceName  || '');
  const [groupId,        setGroupId]        = useState(patientData.groupId        || '');
  const [memberId,       setMemberId]       = useState(patientData.memberId       || '');

  // Group/Member fields only shown when insurance is selected AND it isn't self-pay or other
  const showGroupMember = hasInsurance &&
    insuranceName !== '' &&
    insuranceName !== 'self-pay' &&
    insuranceName !== 'other';

  // Human-readable label to send to the API
  const insuranceLabel = INSURANCE_OPTIONS.find((o) => o.value === insuranceName)?.label || insuranceName;

  // ── Section C: Notes ──────────────────────────────────────────────────────
  const [notes, setNotes] = useState(patientData.notes || '');

  // ── Section D: Terms ─────────────────────────────────────────────────────
  const [termsAccepted, setTermsAccepted] = useState(patientData.termsAccepted || false);

  // ── Touched tracking (blur-based validation) ──────────────────────────────
  const [touched, setTouched] = useState({});
  const touch = (name) => setTouched((t) => ({ ...t, [name]: true }));

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const [triedSubmit,  setTriedSubmit]  = useState(false);

  // ── Per-field error computation ───────────────────────────────────────────

  const errors = {
    firstName:    !firstName.trim()                      ? 'First name is required.'           : null,
    lastName:     !lastName.trim()                       ? 'Last name is required.'            : null,
    legalSex:     !legalSex                              ? 'Please select a legal sex.'        : null,
    phone:        !phone.trim()                          ? 'Phone number is required.'
                : !isValidPhone(phone)                   ? 'Please enter a valid 10-digit US phone number.' : null,
    phoneType:    !phoneType                             ? 'Please select a phone type.'       : null,
    smsConsent:   !smsConsent                            ? 'SMS consent is required.'          : null,
    email:        !email.trim()                          ? 'Email address is required.'
                : !isValidEmail(email)                   ? 'Please enter a valid email address.' : null,
    confirmEmail: !confirmEmail.trim()                   ? 'Please confirm your email address.'
                : confirmEmail.toLowerCase() !== email.toLowerCase() ? 'Email addresses do not match.' : null,
    emailConsent: !emailConsent                          ? 'Email consent is required.'        : null,
    address1:     !address1.trim()                       ? 'Address is required.'              : null,
    city:         !city.trim()                           ? 'City is required.'                 : null,
    state:        !state                                 ? 'State is required.'                : null,
    zip:          !zip.trim()                            ? 'Zip code is required.'
                : !isValidZip(zip)                       ? 'Please enter a valid 5-digit zip code.' : null,
    insuranceName: hasInsurance && !insuranceName        ? 'Please select an insurance provider.' : null,
    groupId:      showGroupMember && !groupId.trim()     ? 'Group ID is required.'             : null,
    memberId:     showGroupMember && !memberId.trim()    ? 'Member ID is required.'            : null,
    termsAccepted:!termsAccepted                         ? 'You must accept the terms to continue.' : null,
  };

  function fieldError(name) {
    if (!errors[name]) return null;
    return (touched[name] || triedSubmit) ? errors[name] : null;
  }

  const hasAnyError = Object.values(errors).some(Boolean) || !!dobError || !localDob;

  // ── Booking sequence ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setTriedSubmit(true);
    if (hasAnyError) return;

    setSubmitting(true);
    setSubmitError(null);

    // 1 — Find or create patient
    let patientId;
    try {
      const result = await findOrCreatePatient({
        firstname:    firstName.trim(),
        lastname:     lastName.trim(),
        dob,
        departmentId: urlParams.departmentId,
        phone:        phone.trim(),
        email:        email.trim().toLowerCase(),
        zip:          zip.trim(),
      });

      if (result.errorType === 'duplicate') {
        setSubmitError('duplicate');
        setSubmitting(false);
        return;
      }
      patientId = result.patientId;
    } catch {
      setSubmitError('generic');
      setSubmitting(false);
      return;
    }

    // 2 — Book appointment
    let bookedId;
    try {
      const result = await bookAppointment({
        appointmentId: selectedAppointmentId,
        patientId,
        reasonId:      selectedReason?.reasonId,
        notes:         notes.trim() || undefined,
      });

      if (result.errorType === 'slot_taken') {
        // Signal Step 2 to show the slot-taken banner, then navigate back
        sessionStorage.setItem('vbf_slot_taken', '1');
        setSelectedTime(null);
        setSelectedAppointmentId(null);
        setSubmitting(false);
        setCurrentStep(2);
        return;
      }

      if (result.errorType === 'generic' || !result.success) {
        setSubmitError('generic');
        try {
          await sendAlert({ type: 'booking_error', message: 'Generic booking failure on submit.' });
        } catch { /* ignore alert errors */ }
        setSubmitting(false);
        return;
      }

      bookedId = selectedAppointmentId;
    } catch {
      setSubmitError('generic');
      try {
        await sendAlert({ type: 'booking_error', message: 'Network error during booking submission.' });
      } catch { /* ignore */ }
      setSubmitting(false);
      return;
    }

    // 3 — Write service note (best-effort)
    if (urlParams.service) {
      try {
        await writeServiceNote({ appointmentId: bookedId, serviceSlug: urlParams.service });
      } catch { /* non-fatal */ }
    }

    // 4 — Update insurance (best-effort)
    if (hasInsurance && insuranceName) {
      try {
        await updateInsurance({
          appointmentId: bookedId,
          insuranceName: insuranceLabel,
          groupId:       showGroupMember ? groupId.trim() : '',
          memberId:      showGroupMember ? memberId.trim() : '',
        });
      } catch { /* non-fatal */ }
    }

    // 5 — Create patient case in Athena (best-effort — never blocks confirmation)
    try {
      await createPatientCase({
        patientId,
        departmentId: urlParams.departmentId,
        providerId:   urlParams.providerId,
        patientData: {
          firstname:     firstName.trim(),
          lastname:      lastName.trim(),
          email:         email.trim().toLowerCase(),
          phone:         phone.trim(),
          dob,
          insuranceName: insuranceLabel || 'None',
          groupId:       showGroupMember ? groupId.trim()  : '-',
          memberId:      showGroupMember ? memberId.trim() : '-',
        },
        appointmentData: {
          reasonName:   selectedReason?.reason || '',
          date:         selectedDate
            ? `${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${String(selectedDate.getDate()).padStart(2, '0')}/${selectedDate.getFullYear()}`
            : '',
          time:         selectedTime || '',
          locationName: locationInfo?.name || '',
          visitType:    visitType === 'telehealth' ? 'Telehealth' : 'In Person',
        },
      });
    } catch (e) {
      console.error('Patient case creation failed (non-blocking):', e);
    }

    // 6 — Store confirmation and advance
    const snapshot = {
      firstName: firstName.trim(), lastName: lastName.trim(),
      preferredName: preferredName.trim(), legalSex, phone: phone.trim(),
      phoneType, smsConsent, email: email.trim().toLowerCase(),
      confirmEmail: confirmEmail.trim().toLowerCase(), emailConsent,
      address1: address1.trim(), address2: address2.trim(),
      city: city.trim(), state, zip: zip.trim(),
      hasInsurance, insuranceName: insuranceName.trim(),
      groupId: groupId.trim(), memberId: memberId.trim(),
      notes: notes.trim(), termsAccepted,
      patientId,
    };
    setPatientData(snapshot);
    setBookingConfirmation({ appointmentId: bookedId, bookedAt: new Date().toISOString() });
    setCurrentStep(4);
  }, [
    hasAnyError, firstName, lastName, dob, urlParams, phone, email, zip,
    selectedAppointmentId, selectedReason, selectedDate, selectedTime,
    locationInfo, visitType, notes, hasInsurance, insuranceName,
    insuranceLabel, showGroupMember, groupId, memberId, legalSex, phoneType,
    smsConsent, emailConsent, confirmEmail, preferredName, address1, address2,
    city, state, termsAccepted, setPatientData, setBookingConfirmation,
    setCurrentStep, setSelectedTime, setSelectedAppointmentId,
  ]);

  // ── Input helper ──────────────────────────────────────────────────────────

  function inp(id, value, setter, options = {}) {
    const err = fieldError(id);
    return (
      <div className="vbf-field" style={options.style}>
        <label className="vbf-label" htmlFor={`vbf-${id}`}>
          {options.label}{options.required !== false && <span className="vbf-label-req"> *</span>}
        </label>
        <input
          id={`vbf-${id}`}
          type={options.type || 'text'}
          className={`vbf-input${err ? ' vbf-input--error' : ''}`}
          value={value}
          onChange={(e) => setter(e.target.value)}
          onBlur={() => touch(id)}
          placeholder={options.placeholder || ''}
          autoComplete={options.autoComplete}
          maxLength={options.maxLength}
          aria-describedby={err ? `vbf-${id}-err` : undefined}
        />
        {err && (
          <div id={`vbf-${id}-err`} className="vbf-field-error" role="alert">
            <span>⚠</span> {err}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="vbf-card">
      <h1 className="vbf-step-title">Your Information</h1>

      {/* ── Submit error banners ─────────────────────────────────── */}
      {submitError === 'duplicate' && (
        <div className="vbf-callout vbf-callout--warning" style={{ marginBottom: 20 }} role="alert">
          <span className="vbf-callout-icon" aria-hidden="true" />
          <span>
            <strong>Multiple records found.</strong> We found more than one matching patient record
            for your information. Our staff will reach out to assist you. Please call{' '}
            <a href="tel:6512171480" style={{ fontWeight: 700 }}>
              (651) 217-1480
            </a>{' '}
            if you need immediate assistance.
          </span>
        </div>
      )}

      {submitError === 'generic' && (
        <div className="vbf-callout vbf-callout--error" style={{ marginBottom: 20 }} role="alert">
          <span className="vbf-callout-icon" aria-hidden="true" />
          <span>
            <strong>Something went wrong.</strong> We couldn't complete your booking. Please try
            again or call <a href="tel:6512171480" style={{ fontWeight: 700 }}>(651) 217-1480</a>.
          </span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          SECTION A — Patient information
      ════════════════════════════════════════════════════════════ */}
      <div className="vbf-form-section-title">Patient Information</div>

      <div className="vbf-fields-row">
        {inp('firstName', firstName, setFirstName, { label: 'First Name (Legal)', autoComplete: 'given-name' })}
        {inp('lastName', lastName, setLastName, { label: 'Last Name', autoComplete: 'family-name' })}
      </div>

      {inp('preferredName', preferredName, setPreferredName, {
        label: 'Preferred First Name',
        required: false,
        placeholder: 'If different from legal name',
        autoComplete: 'nickname',
      })}

      {/* DOB — editable, syncs to context */}
      <div className="vbf-field">
        <label className="vbf-label" htmlFor="vbf-dob">
          Date of Birth <span className="vbf-label-req">*</span>
        </label>
        <input
          id="vbf-dob"
          type="date"
          className={`vbf-input${dobError ? ' vbf-input--error' : ''}`}
          value={localDob}
          onChange={handleDobChange}
          max={new Date().toISOString().split('T')[0]}
          aria-describedby={dobError ? 'vbf-dob-err' : undefined}
        />
        {dobError && (
          <div id="vbf-dob-err" className="vbf-field-error" role="alert">
            <span>⚠</span> {dobError}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
          You can update your date of birth here if needed.
        </div>
      </div>

      {/* Legal sex */}
      <div className="vbf-field">
        <label className="vbf-label" htmlFor="vbf-legalSex">
          Legal Sex <span className="vbf-label-req">*</span>
        </label>
        <div className="vbf-select-wrap">
          <select
            id="vbf-legalSex"
            className={`vbf-select${fieldError('legalSex') ? ' vbf-select--error' : ''}`}
            value={legalSex}
            onChange={(e) => setLegalSex(e.target.value)}
            onBlur={() => touch('legalSex')}
          >
            <option value="">Select…</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        {fieldError('legalSex') && (
          <div className="vbf-field-error" role="alert">
            <span>⚠</span> {fieldError('legalSex')}
          </div>
        )}
      </div>

      <div className="vbf-divider" />

      {/* Phone */}
      <div className="vbf-fields-row">
        {inp('phone', phone, setPhone, {
          label: 'Primary Phone',
          type: 'tel',
          placeholder: '(651) 555-0100',
          autoComplete: 'tel',
        })}

        <div className="vbf-field">
          <label className="vbf-label" htmlFor="vbf-phoneType">
            Phone Type <span className="vbf-label-req">*</span>
          </label>
          <div className="vbf-select-wrap">
            <select
              id="vbf-phoneType"
              className={`vbf-select${fieldError('phoneType') ? ' vbf-select--error' : ''}`}
              value={phoneType}
              onChange={(e) => setPhoneType(e.target.value)}
              onBlur={() => touch('phoneType')}
            >
              <option value="">Select…</option>
              <option value="mobile">Mobile</option>
              <option value="home">Home</option>
              <option value="work">Work</option>
            </select>
          </div>
          {fieldError('phoneType') && (
            <div className="vbf-field-error" role="alert">
              <span>⚠</span> {fieldError('phoneType')}
            </div>
          )}
        </div>
      </div>

      {/* SMS consent */}
      <div style={{ marginTop: 12 }}>
        <label className="vbf-checkbox-wrap">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
          />
          <span>
            I consent to receive voice messages and SMS texts. Standard messaging rates may apply.{' '}
            <span className="vbf-label-req">*</span>
          </span>
        </label>
        {fieldError('smsConsent') && (
          <div className="vbf-field-error" style={{ marginTop: 6 }} role="alert">
            <span>⚠</span> {fieldError('smsConsent')}
          </div>
        )}
      </div>

      <div className="vbf-divider" />

      {/* Email */}
      {inp('email', email, setEmail, {
        label: 'Email Address',
        type: 'email',
        placeholder: 'you@example.com',
        autoComplete: 'email',
      })}

      {inp('confirmEmail', confirmEmail, setConfirmEmail, {
        label: 'Confirm Email Address',
        type: 'email',
        placeholder: 'you@example.com',
        autoComplete: 'email',
      })}

      {/* Email consent */}
      <div style={{ marginTop: 12 }}>
        <label className="vbf-checkbox-wrap">
          <input
            type="checkbox"
            checked={emailConsent}
            onChange={(e) => setEmailConsent(e.target.checked)}
          />
          <span>
            Confirmation emails may contain protected health information. I understand there is
            some risk that unencrypted emails may be intercepted.{' '}
            <span className="vbf-label-req">*</span>
          </span>
        </label>
        {fieldError('emailConsent') && (
          <div className="vbf-field-error" style={{ marginTop: 6 }} role="alert">
            <span>⚠</span> {fieldError('emailConsent')}
          </div>
        )}
      </div>

      <div className="vbf-divider" />

      {/* Address */}
      {inp('address1', address1, setAddress1, {
        label: 'Address Line 1',
        placeholder: '123 Main St',
        autoComplete: 'address-line1',
      })}

      {inp('address2', address2, setAddress2, {
        label: 'Address Line 2',
        required: false,
        placeholder: 'Apt, Suite, Unit (optional)',
        autoComplete: 'address-line2',
      })}

      <div className="vbf-fields-row">
        {inp('city', city, setCity, {
          label: 'City',
          autoComplete: 'address-level2',
        })}

        <div className="vbf-field">
          <label className="vbf-label" htmlFor="vbf-state">
            State <span className="vbf-label-req">*</span>
          </label>
          <div className="vbf-select-wrap">
            <select
              id="vbf-state"
              className={`vbf-select${fieldError('state') ? ' vbf-select--error' : ''}`}
              value={state}
              onChange={(e) => setState(e.target.value)}
              onBlur={() => touch('state')}
              autoComplete="address-level1"
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {fieldError('state') && (
            <div className="vbf-field-error" role="alert">
              <span>⚠</span> {fieldError('state')}
            </div>
          )}
        </div>
      </div>

      {inp('zip', zip, setZip, {
        label: 'Zip Code',
        placeholder: '55082',
        autoComplete: 'postal-code',
        maxLength: 5,
      })}

      {/* ════════════════════════════════════════════════════════════
          SECTION B — Insurance
      ════════════════════════════════════════════════════════════ */}
      <div className="vbf-divider" />
      <div className="vbf-form-section-title">Insurance</div>

      <div>
        <div className="vbf-section-label">Do you have insurance?</div>
        <div className="vbf-toggle-group" role="radiogroup" aria-label="Has insurance">
          <input
            type="radio" id="ins-no" name="hasInsurance" value="no"
            checked={!hasInsurance}
            onChange={() => setHasInsurance(false)}
          />
          <label htmlFor="ins-no" className={!hasInsurance ? 'vbf-checked' : ''}>
            No
          </label>

          <input
            type="radio" id="ins-yes" name="hasInsurance" value="yes"
            checked={hasInsurance}
            onChange={() => setHasInsurance(true)}
          />
          <label htmlFor="ins-yes" className={hasInsurance ? 'vbf-checked' : ''}>
            Yes
          </label>
        </div>
      </div>

      {hasInsurance && (
        <div style={{ marginTop: 16 }}>
          {/* Insurance provider dropdown */}
          <div className="vbf-field">
            <label className="vbf-label" htmlFor="vbf-insuranceName">
              Insurance Provider <span className="vbf-label-req">*</span>
            </label>
            <div className="vbf-select-wrap">
              <select
                id="vbf-insuranceName"
                className={`vbf-select${fieldError('insuranceName') ? ' vbf-select--error' : ''}`}
                value={insuranceName}
                onChange={(e) => setInsuranceName(e.target.value)}
                onBlur={() => touch('insuranceName')}
              >
                {INSURANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {fieldError('insuranceName') && (
              <div className="vbf-field-error" role="alert">
                <span>⚠</span> {fieldError('insuranceName')}
              </div>
            )}
          </div>

          {/* Group/Member only shown for plans that use them */}
          {showGroupMember && (
            <div className="vbf-fields-row" style={{ marginTop: 0 }}>
              {inp('groupId', groupId, setGroupId, {
                label: 'Group ID',
                placeholder: 'Group number from card',
              })}
              {inp('memberId', memberId, setMemberId, {
                label: 'Member ID',
                placeholder: 'Member ID from card',
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          SECTION C — Notes
      ════════════════════════════════════════════════════════════ */}
      <div className="vbf-divider" />
      <div className="vbf-form-section-title">Additional Notes</div>

      <div className="vbf-field">
        <label className="vbf-label" htmlFor="vbf-notes">
          Notes for your provider
          <span style={{ fontWeight: 400, color: 'var(--c-text-muted)', marginLeft: 6 }}>
            (optional)
          </span>
        </label>
        <textarea
          id="vbf-notes"
          className="vbf-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          placeholder="Anything that will help your provider prepare for your visit"
          rows={4}
          maxLength={500}
        />
        <div className="vbf-char-count">{notes.length} / 500</div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          SECTION D — Terms
      ════════════════════════════════════════════════════════════ */}
      <div className="vbf-divider" />

      <div>
        <label className="vbf-checkbox-wrap">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
          />
          <span>
            I agree to the{' '}
            <a href="https://vantagementalhealth.org/terms-and-conditions/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-primary)' }}>
              Terms and Conditions
            </a>{' '}
            and{' '}
            <a href="https://vantagementalhealth.org/privacy-policy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-primary)' }}>
              Privacy Policy
            </a>.{' '}
            <span className="vbf-label-req">*</span>
          </span>
        </label>
        {fieldError('termsAccepted') && (
          <div className="vbf-field-error" style={{ marginTop: 6 }} role="alert">
            <span>⚠</span> {fieldError('termsAccepted')}
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <div className="vbf-nav">
        <button
          className="vbf-btn vbf-btn--ghost"
          onClick={() => setCurrentStep(2)}
          disabled={submitting}
        >
          ← Back
        </button>
        <button
          className="vbf-btn vbf-btn--primary"
          onClick={handleSubmit}
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="vbf-spinner" aria-hidden="true" />
              Booking…
            </>
          ) : (
            'Book Appointment'
          )}
        </button>
      </div>
    </div>
  );
}
