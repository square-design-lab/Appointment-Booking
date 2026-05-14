// API base URL: supports WordPress window.VANTAGE_BOOKING injection or Vite env var
function getBase() {
  if (typeof window !== 'undefined' && window.VANTAGE_BOOKING?.apiUrl) {
    return window.VANTAGE_BOOKING.apiUrl;
  }
  return import.meta.env.VITE_API_URL || '';
}

async function apiFetch(path, options = {}) {
  const url = `${getBase()}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

export function fetchReasons({ departmentId, providerId, patientType }) {
  return apiFetch('/api/booking/reasons', {
    method: 'POST',
    body: JSON.stringify({ departmentId, providerId, patientType }),
  });
}

export function fetchSlots({ reasonId, providerId, departmentId, startDate, endDate }) {
  return apiFetch('/api/booking/slots', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ reasonId, providerId, departmentId, startDate, endDate }),
  });
}

export function findOrCreatePatient(data) {
  return apiFetch('/api/booking/find-or-create-patient', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function bookAppointment(data) {
  return apiFetch('/api/booking/book', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function writeServiceNote(data) {
  return apiFetch('/api/booking/write-service-note', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateInsurance(data) {
  return apiFetch('/api/booking/update-insurance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function sendAlert(data) {
  return apiFetch('/api/booking/alert', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createPatientCase(data) {
  return apiFetch('/api/booking/create-patient-case', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
