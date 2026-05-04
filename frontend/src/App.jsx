import React, { useState, useEffect } from 'react';
import { BookingProvider, useBooking } from './BookingContext';
import ProgressBar from './components/ProgressBar';
import Sidebar from './components/Sidebar';
import MobileSummary from './components/MobileSummary';
import Step1Details from './steps/Step1Details';
import Step2DateTime from './steps/Step2DateTime';
import Step3Registration from './steps/Step3Registration';
import ConfirmationScreen from './steps/ConfirmationScreen';

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
            Vantage Mental Health
          </a>
          <span className="vbf-header-phone">
            Questions? <a href="tel:6512171480">(651) 217-1480</a>
          </span>
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
                    <span className="vbf-callout-icon">⚠️</span>
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

export default function App() {
  return (
    <BookingProvider>
      <BookingFlow />
    </BookingProvider>
  );
}
