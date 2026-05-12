require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
app.use(express.json());

const ALLOWED_ORIGINS = [
  'https://checkin.vantagementalhealth.org',
  'https://vantagementalhealth.org',
  'https://www.vantagementalhealth.org',
  // Cloud Run — booking frontend service
  'https://booking-frontend-717838047212.us-central1.run.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / server-to-server (no Origin header)
    if (!origin) return callback(null, true);
    // Exact match against allowlist OR any *.run.app subdomain (Cloud Run preview URLs)
    if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+-[a-z0-9]+\.run\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
}));

const providerContacts = require('./provider-contacts.json');

const twilioClient =
  process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET
    ? twilio(
        process.env.TWILIO_API_KEY_SID,
        process.env.TWILIO_API_KEY_SECRET,
        { accountSid: process.env.TWILIO_ACCOUNT_SID }
      )
    : null;

// ─── Athena OAuth ─────────────────────────────────────────────────────────────

let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const response = await axios.post(
    `${process.env.ATHENA_BASE_URL}/oauth2/v1/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'athena/service/Athenanet.MDP.*',
    }),
    {
      auth: {
        username: process.env.ATHENA_CLIENT_ID,
        password: process.env.ATHENA_CLIENT_SECRET,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const { access_token, expires_in } = response.data;
  tokenCache = {
    accessToken: access_token,
    expiresAt: Date.now() + (expires_in - 120) * 1000,
  };

  return access_token;
}

async function athenaGet(path, params = {}) {
  const token = await getAccessToken();
  const response = await axios.get(`${process.env.ATHENA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return response.data;
}

async function athenaPost(path, data = {}) {
  const token = await getAccessToken();
  const response = await axios.post(
    `${process.env.ATHENA_BASE_URL}${path}`,
    new URLSearchParams(data),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return response.data;
}

async function athenaPut(path, data = {}) {
  const token = await getAccessToken();
  const response = await axios.put(
    `${process.env.ATHENA_BASE_URL}${path}`,
    new URLSearchParams(data),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return response.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCATION_NAMES = { '1': 'Stillwater', '5': 'St. Anthony', '8': 'Edina' };

function locationName(departmentId) {
  return LOCATION_NAMES[String(departmentId)] || 'clinic';
}

// Normalize DOB to MM/DD/YYYY regardless of what arrives.
// HTML date inputs send YYYY-MM-DD; this converts it defensively on the server
// so the call never breaks even if the frontend format changes.
function normalizeDob(dob) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return `${dob.slice(5, 7)}/${dob.slice(8, 10)}/${dob.slice(0, 4)}`;
  }
  return dob; // already MM/DD/YYYY or some other format — pass through
}

function todayMMDDYYYY() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

function nowCentralTime12h() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());
}

// Athena signaturedatetime format: MM/DD/YYYY HH24:MI:SS  (America/Chicago, 24-hour)
function nowSignatureDateTime() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  // Normalize "24" → "00" for midnight edge case in some V8 versions
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('month')}/${get('day')}/${get('year')} ${hour}:${get('minute')}:${get('second')}`;
}

async function sendSms(to, body) {
  if (!twilioClient) {
    console.log('[SMS skipped — Twilio not configured]');
    return;
  }
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to,
      body,
    });
  } catch (err) {
    console.error('[SMS error]', err.message);
  }
}

async function alertSupport(message) {
  if (process.env.SUPPORT_PHONE) {
    await sendSms(process.env.SUPPORT_PHONE, message);
  } else {
    console.warn('[SUPPORT_PHONE not set] Would have sent:', message);
  }
}

// ─── GET /api/checkin/health ──────────────────────────────────────────────────

app.get('/api/checkin/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── GET /api/checkin/test-athena ─────────────────────────────────────────────
// Non-PHI endpoint to verify OAuth + Athena connection in dev/sandbox.
// Hit this first when troubleshooting: curl http://localhost:3001/api/checkin/test-athena

app.get('/api/checkin/test-athena', async (_req, res) => {
  const practiceId = process.env.ATHENA_PRACTICE_ID;
  const baseUrl    = process.env.ATHENA_BASE_URL;

  try {
    const token = await getAccessToken();

    // departments call has no PHI and confirms practice ID is valid
    const depts = await athenaGet(`/v1/${practiceId}/departments`, { limit: 5 });

    return res.json({
      status: 'ok',
      practiceId,
      baseUrl,
      tokenAcquired: !!token,
      departmentsResponse: depts,
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      practiceId,
      baseUrl,
      httpStatus: err.response?.status,
      message: err.message,
      athenaError: err.response?.data,
    });
  }
});

// ─── POST /api/checkin/find-patient ───────────────────────────────────────────
// HIPAA: never log req.body — contains patient name, DOB, zip.
//
// Athena endpoint: GET /v1/{practiceId}/patients/bestmatch
//   Required: firstname, lastname, dob (MM/DD/YYYY), + one of zip/phone/email/ssn
//   Response: direct array  →  [{ "patientid": "...", ... }]

app.post('/api/checkin/find-patient', async (req, res) => {
  const { firstname, lastname, dob, zip, departmentid } = req.body;

  if (!firstname || !lastname || !dob || !zip) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Server-side DOB normalization — safety net for any format the frontend sends
  const athenaDob = normalizeDob(dob);
  const dobIsValid = /^\d{2}\/\d{2}\/\d{4}$/.test(athenaDob);
  if (!dobIsValid) {
    console.error('[find-patient] DOB could not be normalized:', dob, '→', athenaDob);
    return res.status(400).json({ error: 'Invalid date format' });
  }

  console.log('[find-patient] Calling bestmatch, dobFormat=MM/DD/YYYY ✓, zipLength=' + String(zip).length);

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/bestmatch`,
      { firstname, lastname, dob: athenaDob, zip }
    );

    console.log('[find-patient] Athena 200, responseType=' + (Array.isArray(data) ? `array[${data.length}]` : typeof data));

    const patients = Array.isArray(data) ? data : (data.patients || []);

    if (patients.length === 0) {
      console.log('[find-patient] Result: no_match (empty array)');
      return res.json({ status: 'no_match' });
    }

    if (patients.length > 1) {
      console.log('[find-patient] Result: ambiguous (' + patients.length + ' records)');
      await alertSupport(
        `Check-in alert: Patient ${firstname} ${lastname} needs assistance at ${locationName(departmentid)} — possible duplicate chart.`
      );
      return res.json({ status: 'ambiguous' });
    }

    const patient = patients[0];
    const patientId = patient.patientid || patient.enterprisepatientid || patient.localpatientid;

    console.log('[find-patient] Result: found');
    return res.json({ status: 'found', patientId: String(patientId) });

  } catch (err) {
    const httpStatus = err.response?.status;
    const errBody    = err.response?.data;

    if (httpStatus === 404) {
      // Some Athena endpoints return 404 for "no results"
      console.log('[find-patient] 404 from Athena — treating as no_match');
      return res.json({ status: 'no_match' });
    }

    if (httpStatus === 400) {
      // 400 = bad request parameters — log the full Athena error so we can debug
      // param name wrong? dob format issue? This will tell us.
      console.error('[find-patient] 400 from Athena. Full error:', JSON.stringify(errBody));
      console.error('[find-patient] Params sent — dob:', athenaDob, '| zipLength:', String(zip).length);
      return res.json({ status: 'no_match' });
    }

    console.error('[find-patient] Athena error:', httpStatus, err.message);
    return res.status(503).json({ error: 'service_unavailable' });
  }
});

// ─── POST /api/checkin/appointments ───────────────────────────────────────────

// DATE_OFFSET_DAYS shifts the appointment lookup date forward by N days.
// Set to 1 in .env (sandbox) because Athena's minimum scheduling lead time
// is 24 hours — appointments can't be booked for today in the sandbox.
// Leave unset (defaults to 0) in production where real same-day appointments exist.
function appointmentDate() {
  const offset = parseInt(process.env.DATE_OFFSET_DAYS || '0', 10);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

app.post('/api/checkin/appointments', async (req, res) => {
  const { patientId, departmentid } = req.body;

  if (!patientId || !departmentid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // _testDate in the request body still overrides everything (manual curl testing)
  const dateParam = req.body._testDate || appointmentDate();

  console.log('[appointments] Looking up appointments for date:', dateParam, process.env.DATE_OFFSET_DAYS ? `(offset +${process.env.DATE_OFFSET_DAYS}d)` : '(today)');

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}/appointments`,
      {
        startdate: dateParam,
        enddate: dateParam,
        departmentid,
      }
    );

    console.log('[appointments] Athena response type:', Array.isArray(data) ? `array[${data.length}]` : typeof data, '| keys:', data && typeof data === 'object' ? Object.keys(data).join(',') : '');

    // Athena returns { appointments: [...], totalcount: N } or a direct array
    const rawAppts = data.appointments || (Array.isArray(data) ? data : []);

    console.log('[appointments] Appointment count:', rawAppts.length);

    const appointments = rawAppts.map((a) => {
      const pid = String(a.providerid || '');
      // Cross-reference provider-contacts.json for the display name.
      // Athena's appointment response often omits or abbreviates the provider name.
      const contact = providerContacts.find((p) => String(p.athena_provider_id) === pid);
      const providerName = contact?.provider_name
        || a.providername
        || a.providerusername
        || 'Your provider';

      return {
        appointmentId:   String(a.appointmentid),
        appointmentType: a.appointmenttype || 'Appointment',
        appointmentDate: a.date || a.appointmentdate,
        appointmentTime: a.starttime || a.appointmenttime || '',
        providerId:      pid,
        providerName,
        departmentId:    String(a.departmentid || departmentid),
      };
    });

    return res.json({ appointments });
  } catch (err) {
    console.error('[appointments] Athena error:', err.response?.status, err.message, JSON.stringify(err.response?.data));
    return res.status(503).json({ error: 'service_unavailable' });
  }
});

// ─── POST /api/checkin/confirm-arrival ────────────────────────────────────────

app.post('/api/checkin/confirm-arrival', async (req, res) => {
  const { appointmentId, appointmentType, appointmentTime, patientFirstName, providerAthenaId, departmentId } = req.body;

  if (!appointmentId) {
    return res.status(400).json({ error: 'Missing appointmentId' });
  }

  const arrivalTime = nowCentralTime12h();
  const type        = appointmentType || 'Appointment';
  const noteText    = `${type} - Patient has arrived at clinic at ${arrivalTime}`;

  // Write appointment note — do not fail the check-in if this errors
  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
      { notetext: noteText, displayonschedule: 'true' }
    );
    console.log('[confirm-arrival] Note written for appointment', appointmentId);
  } catch (err) {
    console.error('[confirm-arrival] Note write error:', err.response?.status, JSON.stringify(err.response?.data));
  }

  // Send provider SMS if opted in — silently skip if not
  if (providerAthenaId && patientFirstName) {
    const provider = providerContacts.find(
      (p) => String(p.athena_provider_id) === String(providerAthenaId)
    );
    if (provider && provider.sms_opt_in && provider.mobile_number) {
      const location    = locationName(departmentId);
      const timeDisplay = appointmentTime || arrivalTime;
      await sendSms(
        provider.mobile_number,
        `${patientFirstName} has arrived for their ${timeDisplay} appointment at ${location}.`
      );
    }
  }

  return res.json({ success: true });
});

// ─── POST /api/checkin/alert-support ──────────────────────────────────────────

app.post('/api/checkin/alert-support', async (req, res) => {
  const { patientFirstName, patientLastName, departmentId, reason } = req.body;
  const location = locationName(departmentId);

  const message =
    reason === 'no_appointment'
      ? `Check-in alert: ${patientFirstName} ${patientLastName} is in the waiting room at ${location} with no scheduled appointment today.`
      : `Check-in alert: Patient ${patientFirstName} ${patientLastName} needs assistance at ${location}.`;

  await alertSupport(message);
  return res.json({ success: true });
});

// ─── Phase 2 — Notices ────────────────────────────────────────────────────────

// POST /api/checkin/check-notices
// Calls GET /v1/{practiceId}/patients/{patientId}/privacyinformationverified
// Returns { all_current: true } or { all_current: false, missing: { privacyNotice, insuredSignature, patientSignature } }
// Fail-safe: on Athena error returns all missing so the form always shows.
// HIPAA: no patient data in logs.

app.post('/api/checkin/check-notices', async (req, res) => {
  const { patientId, departmentid } = req.body;

  if (!patientId || !departmentid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const allMissing = { privacyNotice: true, insuredSignature: true, patientSignature: true };
  const isTrue = (v) => v === true || v === 'true';

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}/privacyinformationverified`,
      { departmentid }
    );

    const privacyOk  = isTrue(data.privacynotice?.isprivacynoticeonfile);
    const insuredOk  = isTrue(data.insuredsignature?.isinsuredsignatureonfile);
    const patientOk  = isTrue(data.patientsignature?.ispatientsignatureonfile);

    if (privacyOk && insuredOk && patientOk) {
      console.log('[check-notices] all current');
      return res.json({ all_current: true });
    }

    const missing = {
      privacyNotice:     !privacyOk,
      insuredSignature:  !insuredOk,
      patientSignature:  !patientOk,
    };

    console.log('[check-notices] missing:', Object.keys(missing).filter((k) => missing[k]).join(', '));
    return res.json({ all_current: false, missing });

  } catch (err) {
    console.error('[check-notices] Athena error:', err.response?.status, err.message);
    // Fail-safe: show form with all three notices rather than silently skipping
    return res.json({ all_current: false, missing: allMissing });
  }
});

// POST /api/checkin/submit-notices
// Calls POST /v1/{practiceId}/patients/{patientId}/privacyinformationverified
// Only sends boolean flags for notices that are actually missing.
// HIPAA: signatureName is PHI — never logged.

app.post('/api/checkin/submit-notices', async (req, res) => {
  const { patientId, departmentid, signatureName, missing } = req.body;

  if (!patientId || !departmentid || !signatureName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const body = {
    departmentid,
    signaturename:     signatureName.trim(),
    signaturedatetime: nowSignatureDateTime(),
  };

  // Only include the flags for notices that are actually missing —
  // sending a flag for one already on file would re-stamp it unnecessarily.
  if (missing?.privacyNotice)    body.privacynotice    = 'true';
  if (missing?.insuredSignature) body.insuredsignature = 'true';
  if (missing?.patientSignature) body.patientsignature = 'true';

  const submittingKeys = Object.keys(body)
    .filter((k) => !['departmentid', 'signaturename', 'signaturedatetime'].includes(k));
  console.log('[submit-notices] Submitting flags:', submittingKeys.join(', ') || 'none');

  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}/privacyinformationverified`,
      body
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[submit-notices] Athena error:', err.response?.status, err.message, JSON.stringify(err.response?.data));
    return res.json({ success: false });
  }
});

// ─── Phase 3 — Balance ────────────────────────────────────────────────────────

// POST /api/checkin/balance
// Calls GET /v1/{practiceId}/patients/{patientId}?departmentid=...
// Finds the balances[] entry whose departmentlist includes the patient's dept.
// Returns { balance: amount } (number). Returns { balance: 0 } on any error,
// no match, or cleanbalance: false.
// HIPAA: logs only the resolved dollar amount — no PHI.

app.post('/api/checkin/balance', async (req, res) => {
  const { patientId, departmentid } = req.body;

  if (!patientId || !departmentid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}`,
      { departmentid }
    );

    // Log the raw balances array so field names can be confirmed in sandbox
    console.log('[balance] raw balances from Athena:', JSON.stringify(data.balances ?? null));

    const balances = Array.isArray(data.balances) ? data.balances : [];

    // Find the entry whose departmentlist includes the patient's current dept
    const entry = balances.find((b) => {
      const depts = String(b.departmentlist || '').split(',').map((d) => d.trim());
      return depts.includes(String(departmentid));
    });

    // No match, cleanbalance false, or non-positive → $0
    /*
    const amount =
      entry && entry.cleanbalance === true && typeof entry.balance === 'number' && entry.balance > 0
        ? entry.balance
        : 0;
    */

    const amount = 25.00;  // TEMP — remove after testing

    console.log(`[balance] resolved: $${amount.toFixed(2)}`);
    return res.json({ balance: amount });

  } catch (err) {
    console.error('[balance] Athena error:', err.response?.status, err.message);
    return res.json({ balance: 0 });
  }
});

// POST /api/checkin/record-payment — reserved for future use
app.post('/api/checkin/record-payment', async (_req, res) => {
  return res.json({ success: true });
});

// ─── Teams help request ───────────────────────────────────────────────────────

// POST /api/checkin/help-request
// Forwards a patient help request to the Vantage Teams channel via Power Automate.
// Body: { patientName, phoneNumber, message }
// HIPAA: patientName and phoneNumber are NOT logged.

const TEAMS_WEBHOOK_URL =
  process.env.TEAMS_WEBHOOK_URL ||
  'https://default59800dd938624bb2ab142e3238f1b2.82.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/ebe42207c6ad4a39bd82d59e8005c61c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=fVAgrnrk46dTWJbqyeJ09HYXz0BZ9rP-cZAHPSJBxHc';

app.post('/api/checkin/help-request', async (req, res) => {
  const { patientName, phoneNumber, message } = req.body;

  if (!patientName) {
    return res.status(400).json({ error: 'Missing patientName' });
  }

  try {
    const response = await axios.post(
      TEAMS_WEBHOOK_URL,
      { patientName, phoneNumber, message },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const status = response.status;
    if (status === 200 || status === 202) {
      console.log('[help-request] sent to Teams');
      return res.json({ success: true });
    } else {
      console.warn('[help-request] Teams error:', status);
      return res.json({ success: false });
    }
  } catch (err) {
    console.error('[help-request] Teams error:', err.response?.status ?? err.message);
    return res.json({ success: false });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKING ROUTES  /api/booking/*
// Reuses getAccessToken(), athenaGet(), athenaPost(), alertSupport() from above.
// Practice ID: process.env.ATHENA_PRACTICE_ID  (must be 3253301 in sandbox)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper: date N days from today in MM/DD/YYYY (America/Chicago) ───────────
function futureDateMMDDYYYY(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit', day: '2-digit', year: 'numeric',
  }).format(d);
}

// ─── POST /api/booking/reasons ────────────────────────────────────────────────
// Returns appointment reasons for a given provider + department.
// Filters by patient type (new / returning / all).
app.post('/api/booking/reasons', async (req, res) => {
  const { departmentId, providerId, patientType } = req.body;

  if (!departmentId || !providerId) {
    return res.status(400).json({ error: 'Missing departmentId or providerId' });
  }

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patientappointmentreasons`,
      { departmentid: departmentId, providerid: providerId }
    );

    const raw = Array.isArray(data)
      ? data
      : (data.patientappointmentreasons || []);

    const reasons = raw.filter((r) => {
      const rt = (r.reasontype || '').toLowerCase();
      if (patientType === 'new')                      return rt === 'new'      || rt === 'all';
      if (patientType === 'returning' || patientType === 'existing') return rt === 'existing' || rt === 'all';
      return true;
    }).map((r) => ({
      reasonId:         String(r.reasonid),
      reason:           r.reason,
      reasonType:       r.reasontype,
      description:      r.description || '',
      schedulingMaxDays: r.schedulingmaxdays,
      schedulingMinHours: r.schedulingminhours,
    }));

    return res.json({ reasons });
  } catch (err) {
    console.error('[booking/reasons] Athena error:', err.response?.status, err.message);
    return res.status(503).json({ error: 'service_unavailable' });
  }
});

// ─── POST /api/booking/slots ──────────────────────────────────────────────────
// Returns open appointment slots grouped by date.
app.post('/api/booking/slots', async (req, res) => {
  const { reasonId, providerId, departmentId, startDate, endDate } = req.body;

  if (!providerId || !departmentId) {
    return res.status(400).json({ error: 'Missing providerId or departmentId' });
  }

  const params = {
    providerid:   providerId,
    departmentid: departmentId,
    startdate:    startDate || todayMMDDYYYY(),
    enddate:      endDate   || futureDateMMDDYYYY(90),
    reasonid:     reasonId || '-1',
  };

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
      params
    );

    const appointments = Array.isArray(data) ? data : (data.appointments || []);

    // Group slots by date
    const byDate = {};
    for (const appt of appointments) {
      const date = appt.date;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({
        appointmentId: String(appt.appointmentid),
        time:          appt.starttime,
        duration:      appt.duration,
      });
    }

    const slots = Object.entries(byDate)
      .sort(([a], [b]) => {
        const [am, ad, ay] = a.split('/');
        const [bm, bd, by] = b.split('/');
        return new Date(`${ay}-${am}-${ad}`) - new Date(`${by}-${bm}-${bd}`);
      })
      .map(([date, times]) => ({ date, times }));

    return res.json({ slots });
  } catch (err) {
    console.error('[booking/slots] Athena error:', err.response?.status, err.message);
    return res.status(503).json({ error: 'service_unavailable' });
  }
});

// ─── POST /api/booking/find-or-create-patient ─────────────────────────────────
// HIPAA: never log req.body — contains PHI (name, DOB, phone, email).
//
// 1. Try enhancedbestmatch — single result → use patientId
// 2. No match → POST /patients to create new record
// 3. Multiple matches → return errorType "duplicate" (staff must resolve)
app.post('/api/booking/find-or-create-patient', async (req, res) => {
  const { firstname, lastname, dob, departmentId, phone, email, zip } = req.body;

  if (!firstname || !lastname || !dob || !departmentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Always normalize DOB to MM/DD/YYYY before sending to Athena
  const athenaDob = normalizeDob(dob);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(athenaDob)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  try {
    const matchParams = { firstname, lastname, dob: athenaDob, departmentid: departmentId };
    if (phone) matchParams.homephone = phone;
    if (email) matchParams.email     = email;
    if (zip)   matchParams.zip       = zip;

    const matchData = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/enhancedbestmatch`,
      matchParams
    );

    const patients = Array.isArray(matchData) ? matchData : (matchData.patients || []);

    if (patients.length === 1) {
      const pid = patients[0].patientid || patients[0].enterprisepatientid;
      return res.json({ patientId: String(pid), isNew: false });
    }

    if (patients.length > 1) {
      await alertSupport(
        `Booking alert: duplicate patient records for ${firstname} ${lastname} — staff review needed.`
      );
      return res.json({ errorType: 'duplicate' });
    }

    // No match — create new patient
    const createBody = {
      firstname,
      lastname,
      dob:          athenaDob,
      departmentid: departmentId,
    };
    if (phone) createBody.homephone   = phone;
    if (email) createBody.email       = email;
    if (zip)   createBody.zip         = zip;

    const created = await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients`,
      createBody
    );

    const newPatients = Array.isArray(created) ? created : (created.patients || [created]);
    const newPid = newPatients[0]?.patientid;

    if (!newPid) {
      console.error('[booking/find-or-create-patient] Patient created but no ID returned');
      return res.status(500).json({ error: 'patient_create_failed' });
    }

    return res.json({ patientId: String(newPid), isNew: true });
  } catch (err) {
    const status = err.response?.status;
    console.error('[booking/find-or-create-patient] Athena error:', status, err.message);
    if (status === 400) {
      return res.status(400).json({ error: 'invalid_patient_data' });
    }
    return res.status(503).json({ error: 'service_unavailable' });
  }
});

// ─── POST /api/booking/book ───────────────────────────────────────────────────
// HIPAA: do not log patientId or notes.
// Athena Communicator sends confirmation email automatically — do NOT suppress it.
app.post('/api/booking/book', async (req, res) => {
  const { appointmentId, patientId, reasonId, notes } = req.body;

  if (!appointmentId || !patientId || !reasonId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const body = { patientid: patientId, reasonid: reasonId };
  if (notes && notes.trim()) body.patientinstructions = notes.trim();

  try {
    const data = await athenaPut(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}`,
      body
    );

    return res.json({ success: true, appointmentDetails: data });
  } catch (err) {
    const status  = err.response?.status;
    const errBody = err.response?.data;
    const errMsg  = (typeof errBody === 'string' ? errBody : errBody?.error || '').toLowerCase();

    if (errMsg.includes('slot') || errMsg.includes('already') || status === 409) {
      return res.json({ errorType: 'slot_taken' });
    }

    console.error('[booking/book] Athena error:', status, err.message);
    await alertSupport(`Booking failed — Athena error ${status} on appointment ${appointmentId}.`);
    return res.json({ errorType: 'generic' });
  }
});

// ─── POST /api/booking/write-service-note ────────────────────────────────────
// Best-effort — errors are logged but do NOT bubble up to the client.
const SERVICE_NOTE_LABELS = {
  psychiatry:           'Psychiatric Medication Management',
  'therapy-individual': 'Mental Health Therapy',
  'therapy-family':     'Family Therapy',
  'therapy-couples':    'Couples Therapy',
  'therapy-child':      'Child Therapy',
  'therapy-teen':       'Teen Therapy',
  'therapy-group':      'Group Therapy',
  tms:                  'Transcranial Magnetic Stimulation (TMS)',
  adhd:                 'ADHD Evaluation',
  'psych-testing':      'Psychopharmacologic Testing',
};

app.post('/api/booking/write-service-note', async (req, res) => {
  const { appointmentId, serviceSlug } = req.body;

  if (!appointmentId || !serviceSlug) {
    return res.json({ success: false });
  }

  const label = SERVICE_NOTE_LABELS[serviceSlug] || serviceSlug;

  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
      { notetext: `Patient selected service: ${label}`, displayonschedule: 'true' }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[booking/write-service-note] error:', err.response?.status, err.message);
    return res.json({ success: false });
  }
});

// ─── POST /api/booking/update-insurance ──────────────────────────────────────
// Best-effort — insurance name/group/member written as an appointment note
// for staff to process. A full patient insurance API integration can be
// added later once Athena patient insurance IDs are available.
app.post('/api/booking/update-insurance', async (req, res) => {
  const { appointmentId, insuranceName, groupId, memberId } = req.body;

  if (!appointmentId || !insuranceName) {
    return res.json({ success: false });
  }

  const noteText =
    `Insurance submitted online:\n` +
    `Provider: ${insuranceName}\n` +
    `Group ID: ${groupId || '—'}\n` +
    `Member ID: ${memberId || '—'}`;

  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
      { notetext: noteText, displayonschedule: 'false' }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[booking/update-insurance] error:', err.response?.status, err.message);
    return res.json({ success: false });
  }
});

// ─── POST /api/booking/create-patient-case ───────────────────────────────────
// Best-effort — creates a patient case document in Athena assigned to the
// correct office staff so staff can verify new vs. duplicate patient records.
// HIPAA: internalnote contains PHI — never echo it back in logs.

const CASE_ASSIGNED_TO = {
  '1': 'STILLWATER OFFICE STAFF',
  '5': 'SAINT ANTHONY OFFICE STAFF',
  '8': 'EDINA OFFICE STAFF',
};

app.post('/api/booking/create-patient-case', async (req, res) => {
  const { patientId, departmentId, providerId, patientData: pd, appointmentData: ad } = req.body;

  if (!patientId || !departmentId || !providerId) {
    console.error('[booking/create-patient-case] Missing required fields');
    return res.json({ success: false });
  }

  const assignedTo = CASE_ASSIGNED_TO[String(departmentId)] || 'STILLWATER OFFICE STAFF';

  const noteText =
    `The patient booked an appointment online.\n` +
    `Please verify if this is, in fact, a new patient or a\n` +
    `duplicate record for an existing patient.\n\n` +
    `Reason given for appointment: (Patient Email: ${pd?.email || ''},\n` +
    `Phone: ${pd?.phone || ''}, Type: mobile, Patient DOB: ${pd?.dob || ''},\n` +
    `Insurance: ${pd?.insuranceName || 'None'}, Group ID: ${pd?.groupId || '-'},\n` +
    `Member ID: ${pd?.memberId || '-'}) REASON: ${ad?.reasonName || ''}\n\n` +
    `Appointment Type: ${ad?.reasonName || ''}\n` +
    `Appointment Date: ${ad?.date || ''}\n` +
    `Appointment Time: ${ad?.time || ''}`;

  // Athena cap is 4000 chars — truncate defensively
  const safeNote = noteText.slice(0, 4000);

  const params = new URLSearchParams();
  params.append('providerid',       providerId);
  params.append('departmentid',     departmentId);
  params.append('documentsource',   'PATIENT');
  params.append('documentsubclass', 'OTHER');
  params.append('subject',          'New Appointment Scheduled Online via API');
  params.append('assignedto',       assignedTo);
  params.append('internalnote',     safeNote);

  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${process.env.ATHENA_BASE_URL}/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}/documents/patientcase`,
      params,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = response.data;
    // Athena returns [{ patientcaseid: '...' }] or { patientcaseid: '...' }
    const raw = Array.isArray(data) ? data[0] : data;
    const patientCaseId = raw?.patientcaseid || raw?.documentid || null;

    console.log('[booking/create-patient-case] Created, id:', patientCaseId, '| assignedTo:', assignedTo);
    return res.json({ success: true, patientCaseId });
  } catch (err) {
    console.error(
      '[booking/create-patient-case] Athena error:',
      err.response?.status,
      err.message,
      JSON.stringify(err.response?.data)
    );
    return res.json({ success: false });
  }
});

// ─── GET /api/booking/health ─────────────────────────────────────────────────
// Lightweight liveness + Athena reachability check.
// Always returns 200 — never 5xx — so load-balancer health checks never fail.
app.get('/api/booking/health', async (_req, res) => {
  try {
    const token = await getAccessToken();
    await axios.get(
      `${process.env.ATHENA_BASE_URL}/v1/${process.env.ATHENA_PRACTICE_ID}/departments`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params:  { limit: 1 },
        timeout: 3000,
      }
    );
    return res.json({ status: 'ok', athena: 'reachable' });
  } catch {
    return res.json({ status: 'ok', athena: 'unreachable' });
  }
});

// ─── POST /api/booking/alert ─────────────────────────────────────────────────
// Centralised support SMS trigger. Frontend calls this for errors it catches
// that the backend could not handle internally (e.g. network-level failures).
// Never log PHI — only structural context (error type, appointment ID shape).
app.post('/api/booking/alert', async (req, res) => {
  const { type, message } = req.body;
  if (!type || !message) {
    return res.status(400).json({ error: 'Missing type or message' });
  }
  await alertSupport(`[${type}] ${message}`);
  return res.json({ sent: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vantage check-in backend running on port ${PORT}`);
  console.log(`Athena: ${process.env.ATHENA_BASE_URL} | practice: ${process.env.ATHENA_PRACTICE_ID}`);
  if (!twilioClient)              console.warn('WARNING: Twilio not configured (TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET missing) — SMS disabled');
  if (!process.env.SUPPORT_PHONE) console.warn('WARNING: SUPPORT_PHONE not set — support alerts disabled');
});
