import React from 'react';
import { BookingProvider, useBooking } from './BookingContext';
import ProgressBar from './components/ProgressBar';
import Sidebar from './components/Sidebar';
import Step1Details from './steps/Step1Details';
import Step2DateTime from './steps/Step2DateTime';
import Step3Registration from './steps/Step3Registration';
import ConfirmationScreen from './steps/ConfirmationScreen';

function BookingFlow() {
  const { currentStep } = useBooking();
  const isConfirmation = currentStep === 4;

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
            {currentStep === 1 && <Step1Details />}
            {currentStep === 2 && <Step2DateTime />}
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
