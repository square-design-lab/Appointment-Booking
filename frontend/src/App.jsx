import React, { useState, useEffect } from 'react';
import { BookingProvider, useBooking } from './BookingContext';
import logoSrc from './assets/logo.png';
import ProgressBar from './components/ProgressBar';
import Sidebar from './components/Sidebar';
import MobileSummary from './components/MobileSummary';
import Step1Details from './steps/Step1Details';
import Step2DateTime from './steps/Step2DateTime';
import Step3Registration from './steps/Step3Registration';
import ConfirmationScreen from './steps/ConfirmationScreen';
import ProviderDirectory from './steps/ProviderDirectory';

function BookingFlow() {
  const { currentStep } = useBooking();
  const isConfirmation = currentStep === 4;

  // Slot-taken banner: set by Step3 via sessionStorage when a race condition
  // causes the chosen slot to be taken before booking completes.
  const [slotTakenMsg, setSlotTakenMsg] = useState(null);

  useEffect(() => {
    if (currentStep === 2) {
      if (sessionStorage.getItem('vbf_slot_taken')) {
        sessionStorage.removeItem('vbf_slot_taken');
        setSlotTakenMsg('That time was just taken by another patient. Please select a different time.');
      }
    } else {
      setSlotTakenMsg(null);
    }
  }, [currentStep]);

  return (
    <div className="vbf-root">
      <header className="vbf-header">
        <div className="vbf-header-inner">
          <a href="https://vantagementalhealth.org" className="vbf-logo-link">
            <img src={logoSrc} alt="Vantage Mental Health" className="vbf-logo-img" />
          </a>
          <span className="vbf-header-phone">
            Questions? <a href="tel:6512171480">(651) 217-1480</a>
          </span>
          <a
            href="tel:6512171480"
            className="vbf-header-phone-btn"
            aria-label="Call us at (651) 217-1480"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 5.5C3 14.0604 9.93959 21 18.5 21C18.8862 21 19.2691 20.9859 19.6483 20.9581C20.0834 20.9262 20.3009 20.9103 20.499 20.7963C20.663 20.7019 20.8185 20.5345 20.9007 20.364C21 20.1582 21 19.9181 21 19.438V16.6207C21 16.2169 21 16.015 20.9335 15.842C20.8749 15.6891 20.7795 15.553 20.6559 15.4456C20.516 15.324 20.3262 15.255 19.9468 15.117L16.74 13.9509C16.2985 13.7904 16.0777 13.7101 15.8683 13.7237C15.6836 13.7357 15.5059 13.7988 15.3549 13.9058C15.1837 14.0271 15.0629 14.2285 14.8212 14.6314L14 16C11.3501 14.7999 9.2019 12.6489 8 10L9.36863 9.17882C9.77145 8.93713 9.97286 8.81628 10.0942 8.64506C10.2012 8.49408 10.2643 8.31637 10.2763 8.1317C10.2899 7.92227 10.2096 7.70153 10.0491 7.26005L8.88299 4.05321C8.745 3.67376 8.67601 3.48403 8.55442 3.3441C8.44701 3.22049 8.31089 3.12515 8.15802 3.06645C7.98496 3 7.78308 3 7.37932 3H4.56201C4.08188 3 3.84181 3 3.63598 3.09925C3.4655 3.18146 3.29814 3.33701 3.2037 3.50103C3.08968 3.69907 3.07375 3.91662 3.04189 4.35173C3.01413 4.73086 3 5.11378 3 5.5Z" stroke="#131313" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </header>

      <div className="vbf-container">
        {!isConfirmation && <ProgressBar currentStep={currentStep} />}

        <div className={`vbf-layout${isConfirmation ? ' vbf-layout--full' : ''}`}>
          <main className="vbf-main">
            {!isConfirmation && <MobileSummary />}
            {currentStep === 1 && <Step1Details />}
            {currentStep === 2 && (
              <>
                {slotTakenMsg && (
                  <div
                    className="vbf-callout vbf-callout--warning"
                    role="alert"
                    style={{ marginBottom: 16 }}
                  >
                    <span className="vbf-callout-icon" aria-hidden="true" />
                    <span>{slotTakenMsg}</span>
                  </div>
                )}
                <Step2DateTime />
              </>
            )}
            {currentStep === 3 && <Step3Registration />}
            {currentStep === 4 && <ConfirmationScreen />}
          </main>

          {!isConfirmation && (
            <aside className="vbf-sidebar-wrap">
              <Sidebar />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function extractAthenaId(compositeId) {
  if (!compositeId) return '';
  const dash = compositeId.indexOf('-');
  return dash !== -1 ? compositeId.slice(dash + 1) : compositeId;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);

  // Prefer explicit providerId/departmentId; fall back to extracting from
  // the composite practitionerId/locationId that WordPress JetEngine sends
  // (e.g. practitionerId=31533-1 → providerId=1).
  const providerId   = params.get('providerId')   || extractAthenaId(params.get('practitionerId') || '');
  const departmentId = params.get('departmentId') || extractAthenaId(params.get('locationId')     || '');

  // No providerId → show the directory
  if (!providerId) {
    return <ProviderDirectory />;
  }

  // Has providerId but no departmentId → broken/incomplete URL; redirect cleanly
  if (!departmentId) {
    window.location.replace('/');
    return null;
  }

  return (
    <BookingProvider>
      <BookingFlow />
    </BookingProvider>
  );
}
