import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchProviders } from './api/bookingApi';

const BookingContext = createContext(null);

// Athena practice ID — used by both URL parsing and URL generation
export const ATHENA_PRACTICE_ID = '31533';

export const SERVICE_LABELS = {
  psychiatry:           'Psychiatric Medication Management',
  'therapy-individual': 'Mental Health Therapy',
  'therapy-family':     'Family Therapy',
  'therapy-couples':    'Couples Therapy',
  'therapy-child':      'Child Therapy',
  'therapy-teen':       'Teen Therapy',
  'therapy-group':      'Group Therapy',
  tms:                  'Transcranial Magnetic Stimulation',
  adhd:                 'ADHD Evaluation',
  'psych-testing':      'Psychopharmacologic Testing',
};

export const LOCATION_INFO = {
  '1': {
    name:    'Vantage Mental Health — Stillwater',
    address: '5995 Oren Avenue North, Suite 203, Stillwater, MN 55082',
  },
  '5': {
    name:    'Vantage Mental Health — St. Anthony',
    address: '2855 Anthony Ln S, Suite 201, Saint Anthony, MN 55418',
  },
  '8': {
    name:    'Vantage Mental Health — Edina',
    address: '7401 Metro Blvd, Suite 425, Edina, MN 55439',
  },
};

// Athena portal uses composite IDs like "31533-1" ({practiceId}-{athenaId}).
// Strip the practice-ID prefix so we get just the plain Athena ID.
function extractAthenaId(compositeId) {
  if (!compositeId) return '';
  const dash = compositeId.indexOf('-');
  return dash !== -1 ? compositeId.slice(dash + 1) : compositeId;
}

function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);

  const locationId     = p.get('locationId')     || '';
  const practitionerId = p.get('practitionerId') || '';

  // Prefer explicit departmentId/providerId; fall back to extracting from
  // locationId/practitionerId (WordPress JetEngine sends the composite form).
  const departmentId = p.get('departmentId') || extractAthenaId(locationId);
  const providerId   = p.get('providerId')   || extractAthenaId(practitionerId);

  return {
    locationId,
    practitionerId,
    departmentId,
    providerId,
    dob:             p.get('dob')             || '',
    patientType:     p.get('patientType')     || '',
    service:         p.get('service')         || '',
    visitType:       p.get('visitType')       || '',
    telehealthState: p.get('telehealthState') || '',
    insurance:       p.get('insurance')       || '',
    providerName:    p.get('providerName')    || '',
    minAge:          p.get('minAge')          || '0',
    maxAge:          p.get('maxAge')          || '100',
    telehealthLocs:  p.get('telehealthLocs')  || '',
  };
}

export function BookingProvider({ children }) {
  const [urlParams] = useState(parseUrlParams);
  const [currentStep, setCurrentStep] = useState(1);

  const [providerInfo, setProviderInfo] = useState(null);
  const [providerContacts, setProviderContacts] = useState([]);
  const providerLoading = false;

  useEffect(() => {
    fetchProviders().then(setProviderContacts).catch(() => {});
  }, []);

  // Provider-specific params derived from provider-contacts.json
  // (not from URL — minAge/maxAge/telehealthLocs are no longer in the URL)
  const [providerMinAge,        setProviderMinAge]        = useState(0);
  const [providerMaxAge,        setProviderMaxAge]        = useState(100);
  const [providerTelehealthLocs,setProviderTelehealthLocs]= useState('');

  // Step 1
  const [patientType, setPatientType]         = useState(urlParams.patientType || '');
  const [visitType, setVisitType]             = useState(urlParams.visitType || '');
  const [telehealthState, setTelehealthState] = useState(urlParams.telehealthState || '');
  const [dob, setDob]                         = useState(urlParams.dob || '');
  const [selectedReason, setSelectedReason]   = useState(null);

  // Service selection (used when service slug is not in URL)
  const [selectedService, setSelectedService] = useState('');

  // Step 2
  const [selectedDate, setSelectedDate]               = useState(null);
  const [selectedTime, setSelectedTime]               = useState(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);

  // Step 3
  const [patientData, setPatientData] = useState({});

  // Confirmation
  const [bookingConfirmation, setBookingConfirmation] = useState(null);

  useEffect(() => {
    if (!urlParams.providerId || providerContacts.length === 0) return;
    const found = providerContacts.find(
      (p) => String(p.athena_provider_id) === String(urlParams.providerId)
    );
    if (found) {
      setProviderInfo({
        name:        found.name,
        credentials: found.provider_title,
        photo:       found.photo || null,
        specialties: found.specialties || [],
        specialty:   found.specialty || '',
        services:    found.services || [],
      });
      setProviderMinAge(found.minAge ?? 0);
      setProviderMaxAge(found.maxAge ?? 100);
      setProviderTelehealthLocs(found.telehealthLocs || '');
    }
  }, [urlParams.providerId, providerContacts]);

  const locationInfo   = LOCATION_INFO[urlParams.departmentId] || null;
  const serviceLabel   = SERVICE_LABELS[urlParams.service] || '';

  const value = {
    urlParams,
    currentStep,
    setCurrentStep,
    providerInfo,
    providerContacts,
    providerLoading,
    providerMinAge,
    providerMaxAge,
    providerTelehealthLocs,
    locationInfo,
    serviceLabel,
    selectedService, setSelectedService,
    patientType,  setPatientType,
    visitType,    setVisitType,
    telehealthState, setTelehealthState,
    dob,          setDob,
    selectedReason,  setSelectedReason,
    selectedDate,    setSelectedDate,
    selectedTime,    setSelectedTime,
    selectedAppointmentId, setSelectedAppointmentId,
    patientData,     setPatientData,
    bookingConfirmation, setBookingConfirmation,
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
}
