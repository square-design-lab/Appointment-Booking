import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './booking.css';

const rootEl = document.getElementById('vantage-booking-root');

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
