import React, { createContext, useContext, useState, useEffect } from 'react';
import providerContacts from './data/provider-contacts.json';

const BookingContext = createContext(null);

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
    address: '3401 Silver Lake Road NE, Suite 400, St. Anthony, MN 55418',
  },
  '8': {
    name:    'Vantage Mental Health — Edina',
    address: '4010 W 65th Street, Suite 200, Edina, MN 55435',
  },
};

function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    locationId:      p.get('locationId')      || '',
    practitionerId:  p.get('practitionerId')  || '',
    departmentId:    p.get('departmentId')    || '',
    providerId:      p.get('providerId')      || '',
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
  const providerLoading = false;

  // Step 1
  const [patientType, setPatientType]         = useState(urlParams.patientType || '');
  const [visitType, setVisitType]             = useState(urlParams.visitType || '');
  const [telehealthState, setTelehealthState] = useState(urlParams.telehealthState || '');
  const [dob, setDob]                         = useState(urlParams.dob || '');
  const [selectedReason, setSelectedReason]   = useState(null);

  // Step 2
  const [selectedDate, setSelectedDate]               = useState(null);
  const [selectedTime, setSelectedTime]               = useState(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);

  // Step 3
  const [patientData, setPatientData] = useState({});

  // Confirmation
  const [bookingConfirmation, setBookingConfirmation] = useState(null);

  useEffect(() => {
    if (!urlParams.providerId) return;
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
      });
    }
  }, [urlParams.providerId]);

  const locationInfo   = LOCATION_INFO[urlParams.departmentId] || null;
  const serviceLabel   = SERVICE_LABELS[urlParams.service] || '';

  const value = {
    urlParams,
    currentStep,
    setCurrentStep,
    providerInfo,
    providerLoading,
    locationInfo,
    serviceLabel,
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
