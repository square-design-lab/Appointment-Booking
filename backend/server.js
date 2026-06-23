require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const twilio  = require('twilio');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(express.json());

const ALLOWED_ORIGINS = [
  'https://checkin.vantagementalhealth.org',
  'https://vantagementalhealth.org',
  'https://www.vantagementalhealth.org',
  // Booking frontend — subdomain (primary) and Cloud Run URL (both work)
  'https://book.vantagementalhealth.org',
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
  const token   = await getAccessToken();
  const baseUrl = `${process.env.ATHENA_BASE_URL}${path}`;

  // Athena requires date params (MM/DD/YYYY) with literal slashes — never URL-encode them.
  // All other params are safely encoded. This matches vantage-api behaviour.
  const DATE_KEYS = ['startdate', 'enddate', 'appointmentdate'];
  const rawParts  = [];
  const safeParts = [];

  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (DATE_KEYS.includes(k.toLowerCase())) {
      rawParts.push(`${k}=${v}`);
    } else {
      safeParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  });

  const allParts = [...safeParts, ...rawParts];
  const fullUrl  = allParts.length > 0 ? `${baseUrl}?${allParts.join('&')}` : baseUrl;

  const response = await axios.get(fullUrl, {
    headers: { Authorization: `Bearer ${token}` },
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

// ─── Reasons cache ────────────────────────────────────────────────────────────
// Keyed by "departmentId:providerId". Raw Athena response is cached; patientType
// filtering happens after each cache hit so one entry serves new + returning.
// Expires at the next 6 AM America/Chicago — reasons change infrequently and the
// Athena rep confirmed they can be cached for a full day.

const reasonsCache = new Map();

function next6amCentralMs() {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const p = {};
  for (const { type, value } of parts) p[type] = parseInt(value, 10);
  const hour        = p.hour === 24 ? 0 : p.hour;
  const currentSec  = hour * 3600 + p.minute * 60 + p.second;
  const target6amSec = 6 * 3600;
  let secsUntil = target6amSec - currentSec;
  if (secsUntil <= 0) secsUntil += 24 * 3600; // already past 6 AM today — target tomorrow
  return Date.now() + secsUntil * 1000;
}

// ─── POST /api/booking/reasons ────────────────────────────────────────────────
// Returns appointment reasons for a given provider + department.
// Filters by patient type (new / returning / all).
app.post('/api/booking/reasons', async (req, res) => {
  const { departmentId, providerId, patientType } = req.body;

  if (!departmentId || !providerId) {
    return res.status(400).json({ error: 'Missing departmentId or providerId' });
  }

  const cacheKey = `${departmentId}:${providerId}`;
  const cached   = reasonsCache.get(cacheKey);

  let raw;
  if (cached && Date.now() < cached.expiresAt) {
    raw = cached.raw;
  } else {
    try {
      const data = await athenaGet(
        `/v1/${process.env.ATHENA_PRACTICE_ID}/patientappointmentreasons`,
        { departmentid: departmentId, providerid: providerId }
      );
      raw = Array.isArray(data) ? data : (data.patientappointmentreasons || []);
      reasonsCache.set(cacheKey, { raw, expiresAt: Date.now() + 48 * 60 * 60 * 1000 });
      console.log(`[booking/reasons] cached ${raw.length} reasons for ${cacheKey} (48h TTL)`);
    } catch (err) {
      console.error('[booking/reasons] Athena error:', err.response?.status, err.message);
      return res.status(503).json({ error: 'service_unavailable' });
    }
  }

  const reasons = raw.filter((r) => {
    const rt = (r.reasontype || '').toLowerCase();
    if (patientType === 'new')                                       return rt === 'new'      || rt === 'all';
    if (patientType === 'returning' || patientType === 'existing')   return rt === 'existing' || rt === 'all';
    return true;
  }).map((r) => ({
    reasonId:          String(r.reasonid),
    reason:            r.reason,
    reasonType:        r.reasontype,
    description:       r.description || '',
    schedulingMaxDays: r.schedulingmaxdays,
    schedulingMinHours: r.schedulingminhours,
  }));

  return res.json({ reasons });
});

// ─── POST /api/booking/slots ──────────────────────────────────────────────────
// Returns open appointment slots grouped by date.
// Always uses the specific reasonId — this is critical for production because
// Athena's external scheduling rules (telehealth-only days, appointment duration
// requirements, etc.) are only applied when a real reason ID is provided.
// Using reasonid=-1 bypasses those rules and returns raw open blocks regardless
// of day restrictions or whether consecutive blocks exist for the required duration.
app.post('/api/booking/slots', async (req, res) => {
  const { reasonId, providerId, departmentId, startDate, endDate } = req.body;

  if (!providerId || !departmentId || !reasonId) {
    return res.status(400).json({ error: 'Missing providerId, departmentId, or reasonId' });
  }

  const baseParams = {
    providerid:   providerId,
    departmentid: departmentId,
    startdate:    startDate || todayMMDDYYYY(),
    enddate:      endDate   || futureDateMMDDYYYY(90),
  };

  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
      { ...baseParams, reasonid: reasonId }
    );
    const appointments = Array.isArray(data) ? data : (data.appointments || []);
    console.log(`[booking/slots] provider ${providerId}: ${appointments.length} slots via reasonId ${reasonId}`);

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

// ─── POST /api/booking/batch-availability ─────────────────────────────────────
// Quick check: does each provider have any open slots in the next 90 days?
// Used by the provider directory to show/hide the Book Appointment button.
// Cache TTL is time-aware (CT timezone):
//   Weekday before noon  : until noon CT
//   Weekday noon–6pm     : until 6pm CT
//   Weekday after 6pm    : until next noon CT
//   Weekend (Sat & Sun)  : until next 6am CT (once-per-day refresh)

// Returns the UTC timestamp of the next 6:00 AM US/Central after `from`.
// Iterates hour-by-hour so DST transitions are handled correctly.
function next6amCT(from) {
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 3_600_000); // start from next full hour
  for (let i = 0; i < 25; i++) {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour:     '2-digit',
        hour12:   false,
      }).format(candidate)
    );
    if (h === 6) return candidate.getTime();
    candidate.setTime(candidate.getTime() + 3_600_000);
  }
  return from.getTime() + 12 * 3_600_000; // safety fallback
}

// Returns the UTC timestamp of the next occurrence of targetHour:00 US/Central after `from`.
function nextCTHour(targetHour, from) {
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 3_600_000);
  for (let i = 0; i < 25; i++) {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour:     '2-digit',
        hour12:   false,
      }).format(candidate)
    );
    if (h === targetHour) return candidate.getTime();
    candidate.setTime(candidate.getTime() + 3_600_000);
  }
  return from.getTime() + 12 * 3_600_000; // safety fallback
}

// Returns the UTC timestamp at which the batch-availability cache should expire.
function batchAvailExpiry() {
  const now  = new Date();
  const fmt  = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour:     '2-digit',
    weekday:  'long',
    hour12:   false,
  });
  const parts    = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const ctHour   = parseInt(parts.hour);
  const isWeekend = parts.weekday === 'Saturday' || parts.weekday === 'Sunday';

  // Weekday: fixed sync points at noon and 6pm CT
  if (!isWeekend) {
    if (ctHour < 12) return nextCTHour(12, now); // before noon → expire at noon CT
    if (ctHour < 18) return nextCTHour(18, now); // noon–6pm  → expire at 6pm CT
    return nextCTHour(12, now);                  // after 6pm → expire at next noon CT
  }
  // Weekend → once per day at 6am CT
  return next6amCT(now);
}

const batchAvailCache = { results: null, expiresAt: 0 };

// ─── Scheduling-meta cache ────────────────────────────────────────────────────
// Stores time-of-day availability patterns (Morning / Mid Day / Evening / Weekends)
// per provider. Computed from 4-week slot data; refreshed at most once per 30 days.
// Persisted to disk so it survives deploys (Cloud Run ephemeral FS — best-effort).

const SCHEDULING_META_PATH = path.join(__dirname, 'scheduling-meta.json');
const SCHEDULING_META_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let schedulingMetaCache = { lastUpdated: null, providers: {}, expiresAt: 0 };

// Load from disk on startup (skip if expired)
(function loadSchedulingMetaFromDisk() {
  try {
    if (fs.existsSync(SCHEDULING_META_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SCHEDULING_META_PATH, 'utf8'));
      if (raw && raw.expiresAt && Date.now() < raw.expiresAt) {
        schedulingMetaCache = raw;
        console.log('[scheduling-meta] Loaded from disk, expires:', new Date(raw.expiresAt).toISOString());
      } else {
        console.log('[scheduling-meta] Disk cache expired — will refresh on first request');
      }
    }
  } catch (err) {
    console.warn('[scheduling-meta] Could not load from disk:', err.message);
  }
})();

// Classify a provider's slot list into scheduling preference tags.
// refreshDateMs = UTC midnight of the day the refresh runs (for availability-speed tags).
function classifySlots(appointments, refreshDateMs) {
  const prefs    = new Set();
  let   minDays  = Infinity;

  for (const appt of appointments) {
    const time = appt.starttime || ''; // "HH:MM"
    const date = appt.date      || ''; // "MM/DD/YYYY"

    // Time-of-day tags
    if (time) {
      const [h, m] = time.split(':').map(Number);
      const mins = h * 60 + (m || 0);
      if (mins < 720)       prefs.add('Morning');   // before 12:00
      else if (mins < 1020) prefs.add('Mid Day');   // 12:00–17:00
      else                  prefs.add('Evening');   // after 17:00
    }

    // Weekend + availability-speed tags
    if (date) {
      const [mm, dd, yyyy] = date.split('/');
      if (mm && dd && yyyy) {
        const slotMs = new Date(`${yyyy}-${mm}-${dd}`).getTime();
        const dow    = new Date(`${yyyy}-${mm}-${dd}`).getDay();
        if (dow === 0 || dow === 6) prefs.add('Weekends');
        const days = Math.round((slotMs - refreshDateMs) / 86400000);
        if (days >= 0 && days < minDays) minDays = days;
      }
    }
  }

  // Availability-speed tags — based on earliest slot relative to refresh date
  if (minDays <= 7)  prefs.add('Opening This Week');
  if (minDays <= 14) prefs.add('In Less Than Two Weeks');
  if (minDays <= 31) prefs.add('Within One Month');

  return [...prefs];
}

// Refresh scheduling-meta for all providers. Runs ~once/month.
// Sequential (not parallel) to avoid hammering Athena — each call is cheap.
async function refreshSchedulingMeta() {
  const today         = todayMMDDYYYY();
  const endDate       = futureDateMMDDYYYY(31); // cover full "Within One Month" window
  const rd            = new Date(); rd.setHours(0, 0, 0, 0);
  const refreshDateMs = rd.getTime();
  console.log(`[scheduling-meta] Refreshing for ${providerContacts.length} providers (31-day window)…`);

  const providerResults = {};
  for (const p of providerContacts) {
    const providerId   = String(p.athena_provider_id);
    const departmentId = String(p.departmentId);
    try {
      const data = await athenaGet(
        `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
        { providerid: providerId, departmentid: departmentId, startdate: today, enddate: endDate, reasonid: '-1' }
      );
      const appts = Array.isArray(data) ? data : (data.appointments || []);
      providerResults[providerId] = classifySlots(appts, refreshDateMs);
    } catch (err) {
      console.warn(`[scheduling-meta] provider ${providerId} failed:`, err.response?.status ?? err.message);
      providerResults[providerId] = [];
    }
  }

  const newCache = {
    lastUpdated: new Date().toISOString(),
    providers:   providerResults,
    expiresAt:   Date.now() + SCHEDULING_META_TTL_MS,
  };
  schedulingMetaCache = newCache;

  // Persist to disk (best-effort)
  try {
    fs.writeFileSync(SCHEDULING_META_PATH, JSON.stringify(newCache), 'utf8');
    console.log('[scheduling-meta] Persisted to disk');
  } catch (err) {
    console.warn('[scheduling-meta] Disk write failed (non-fatal):', err.message);
  }
  console.log('[scheduling-meta] Refresh complete');
  return newCache;
}

app.post('/api/booking/batch-availability', async (req, res) => {
  const { providers } = req.body;
  if (!Array.isArray(providers) || providers.length === 0) {
    return res.json({ results: [] });
  }

  // Serve from cache if still fresh
  if (batchAvailCache.results && Date.now() < batchAvailCache.expiresAt) {
    const requested = new Set(providers.map((p) => String(p.providerId)));
    const cached = batchAvailCache.results.filter((r) => requested.has(String(r.providerId)));
    return res.json({ results: cached });
  }

  const today   = todayMMDDYYYY();
  const endDate = futureDateMMDDYYYY(90);

  const results = await Promise.all(
    providers.map(async ({ providerId, departmentId }) => {
      try {
        const data = await athenaGet(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
          {
            providerid:   providerId,
            departmentid: departmentId,
            startdate:    today,
            enddate:      endDate,
            reasonid:     '-1',
          }
        );
        const appts = Array.isArray(data) ? data : (data.appointments || []);
        return { providerId: String(providerId), hasSlots: appts.length > 0 };
      } catch {
        return { providerId: String(providerId), hasSlots: true }; // fail open
      }
    })
  );

  batchAvailCache.results   = results;
  batchAvailCache.expiresAt = batchAvailExpiry();
  const ttlMins = Math.round((batchAvailCache.expiresAt - Date.now()) / 60_000);
  console.log(`[batch-availability] checked ${results.length} providers; ${results.filter((r) => r.hasSlots).length} have slots; cache expires in ${ttlMins} min (${new Date(batchAvailCache.expiresAt).toISOString()})`);

  return res.json({ results });
});

// ─── POST /api/booking/find-or-create-patient ─────────────────────────────────
// HIPAA: never log req.body — contains PHI (name, DOB, phone, email).
//
// 1. Try enhancedbestmatch — single result → use patientId
// 2. No match → POST /patients to create new record
// 3. Multiple matches → return errorType "duplicate" (staff must resolve)
app.post('/api/booking/find-or-create-patient', async (req, res) => {
  const {
    firstname, lastname, preferredName, dob, departmentId,
    phone, phoneType, email, zip,
    address1, address2, city, state, legalSex,
    appointmentId,
  } = req.body;

  if (!firstname || !lastname || !dob || !departmentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Always normalize DOB to MM/DD/YYYY before sending to Athena
  const athenaDob = normalizeDob(dob);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(athenaDob)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  // Map phone type to the correct Athena field name
  const phoneField = phoneType === 'mobile' ? 'mobilephone'
                   : phoneType === 'work'   ? 'workphone'
                   :                          'homephone';

  try {
    const matchParams = { firstname, lastname, dob: athenaDob, departmentid: departmentId };
    if (phone) matchParams[phoneField] = phone;
    if (email) matchParams.email       = email;
    if (zip)   matchParams.zip         = zip;

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

    // No match — verify the slot is still open before creating a new patient.
    // This prevents an orphan patient record if the slot was taken between
    // Step 2 (slot selection) and Step 3 (form submit).
    // Fail open: if the check itself errors (network, etc.) we proceed anyway.
    if (appointmentId) {
      try {
        const apptData = await athenaGet(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}`
        );
        const slotStatus = (apptData.appointmentstatus || apptData.status || '').toLowerCase();
        if (slotStatus && slotStatus !== 'o' && slotStatus !== 'open') {
          console.log('[booking/find-or-create-patient] Slot pre-check: not open, aborting patient creation');
          return res.json({ errorType: 'slot_taken' });
        }
      } catch (slotCheckErr) {
        console.warn('[booking/find-or-create-patient] Slot pre-check failed, proceeding:', slotCheckErr.response?.status);
      }
    }

    // No match — create new patient
    const createBody = {
      firstname,
      lastname,
      dob:          athenaDob,
      departmentid: departmentId,
    };
    if (phone)         createBody[phoneField]    = phone;
    if (email)         createBody.email          = email;
    if (zip)           createBody.zip            = zip;
    if (address1)      createBody.address1       = address1;
    if (address2)      createBody.address2       = address2;
    if (city)          createBody.city           = city;
    if (state)         createBody.state          = state;
    if (legalSex)      createBody.sex            = legalSex;
    if (preferredName) createBody.preferredname  = preferredName;

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
    const status   = err.response?.status;
    const errBody  = err.response?.data;
    console.error('[booking/find-or-create-patient] Athena error:', status, err.message, JSON.stringify(errBody));
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
  const { appointmentId, patientId, reasonId, notes, providerId, departmentId } = req.body;

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

    // Also write patient notes to the appointment Notes section so they are
    // visible alongside the service and insurance notes in athenaNet.
    if (notes && notes.trim()) {
      try {
        await athenaPost(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
          { notetext: `Notes from patient: ${notes.trim()}`, displayonschedule: 'true' }
        );
      } catch (noteErr) {
        // Best-effort — do not fail the booking if note write fails
        console.error('[booking/book] Patient note write error:', noteErr.response?.status, noteErr.message);
      }
    }

    // Fire-and-forget: refresh this provider's slots in WordPress via vantage-api.
    // Runs in the background — never delays the booking confirmation response.
    if (providerId && departmentId && process.env.VANTAGE_API_URL && process.env.VANTAGE_API_SECRET) {
      fetch(`${process.env.VANTAGE_API_URL}/api/sync-single-provider`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-sync-secret': process.env.VANTAGE_API_SECRET,
        },
        body: JSON.stringify({ providerId: String(providerId), departmentId: String(departmentId) }),
      }).catch((err) => {
        console.warn('[booking/book] vantage-api sync trigger failed (non-blocking):', err.message);
      });
    }

    // Fire-and-forget: re-check this provider's availability and update their entry
    // in batchAvailCache so the booking app directory reflects the change immediately.
    // Only runs if cache is populated; never delays the booking confirmation response.
    if (providerId && departmentId && batchAvailCache.results) {
      (async () => {
        try {
          const availData = await athenaGet(
            `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
            {
              providerid:   String(providerId),
              departmentid: String(departmentId),
              startdate:    todayMMDDYYYY(),
              enddate:      futureDateMMDDYYYY(90),
              reasonid:     '-1',
            }
          );
          const appts    = Array.isArray(availData) ? availData : (availData.appointments || []);
          const hasSlots = appts.length > 0;
          const idx      = batchAvailCache.results.findIndex(
            (r) => String(r.providerId) === String(providerId)
          );
          if (idx !== -1) {
            batchAvailCache.results[idx] = { ...batchAvailCache.results[idx], hasSlots };
            console.log(`[booking/book] batchAvailCache updated: provider ${providerId} hasSlots=${hasSlots}`);
          }
        } catch (err) {
          console.warn('[booking/book] batchAvail cache update failed (non-blocking):', err.message);
        }
      })();
    }

    return res.json({ success: true, appointmentDetails: data });
  } catch (err) {
    const status  = err.response?.status;
    const errBody = err.response?.data;
    const errMsg  = (typeof errBody === 'string' ? errBody : errBody?.error || '').toLowerCase();

    if (
      status === 409 ||
      errMsg.includes('slot') ||
      errMsg.includes('already') ||
      errMsg.includes('not open') ||
      errMsg.includes('not available') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('cannot be booked') ||
      errMsg.includes('already scheduled')
    ) {
      return res.json({ errorType: 'slot_taken' });
    }

    console.error('[booking/book] Athena error:', status, err.message, JSON.stringify(errBody));
    await alertSupport(`Booking failed — Athena error ${status} on appointment ${appointmentId}.`);
    return res.json({ errorType: 'generic' });
  }
});

// ─── POST /api/booking/register-and-book ─────────────────────────────────────
// HIPAA: never log req.body — contains PHI (name, DOB, phone, email).
// Atomically: find-or-create patient + book appointment in one call.
// If booking fails for a newly-created patient, marks the patient inactive
// (Athena status 'i') to prevent orphan records — Athena has no patient delete.
app.post('/api/booking/register-and-book', async (req, res) => {
  const {
    firstname, lastname, preferredName, dob, departmentId,
    phone, phoneType, email, zip,
    address1, address2, city, state, legalSex,
    appointmentId, reasonId, notes, providerId,
  } = req.body;

  if (!firstname || !lastname || !dob || !departmentId || !appointmentId || !reasonId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const athenaDob = normalizeDob(dob);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(athenaDob)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const phoneField = phoneType === 'mobile' ? 'mobilephone'
                   : phoneType === 'work'   ? 'workphone'
                   :                          'homephone';

  // ── Step 1: Find existing patient ────────────────────────────────────────
  let patientId;
  let isNew = false;

  try {
    const matchParams = { firstname, lastname, dob: athenaDob, departmentid: departmentId };
    if (phone) matchParams[phoneField] = phone;
    if (email) matchParams.email       = email;
    if (zip)   matchParams.zip         = zip;

    const matchData = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/enhancedbestmatch`,
      matchParams
    );

    const patients = Array.isArray(matchData) ? matchData : (matchData.patients || []);

    if (patients.length === 1) {
      patientId = String(patients[0].patientid || patients[0].enterprisepatientid);
      isNew = false;
    } else if (patients.length > 1) {
      await alertSupport(
        `Booking alert: duplicate patient records for ${firstname} ${lastname} — staff review needed.`
      );
      return res.json({ errorType: 'duplicate' });
    } else {
      // No match — slot pre-check before creating patient
      try {
        const apptData = await athenaGet(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}`
        );
        const slotStatus = (apptData.appointmentstatus || apptData.status || '').toLowerCase();
        if (slotStatus && slotStatus !== 'o' && slotStatus !== 'open') {
          console.log('[booking/register-and-book] Slot pre-check: not open, aborting');
          return res.json({ errorType: 'slot_taken' });
        }
      } catch (slotCheckErr) {
        console.warn('[booking/register-and-book] Slot pre-check failed, proceeding:', slotCheckErr.response?.status);
      }

      // Create new patient
      const createBody = {
        firstname,
        lastname,
        dob:          athenaDob,
        departmentid: departmentId,
      };
      if (phone)         createBody[phoneField]   = phone;
      if (email)         createBody.email         = email;
      if (zip)           createBody.zip           = zip;
      if (address1)      createBody.address1      = address1;
      if (address2)      createBody.address2      = address2;
      if (city)          createBody.city          = city;
      if (state)         createBody.state         = state;
      if (legalSex)      createBody.sex           = legalSex;
      if (preferredName) createBody.preferredname = preferredName;

      const created = await athenaPost(
        `/v1/${process.env.ATHENA_PRACTICE_ID}/patients`,
        createBody
      );

      const newPatients = Array.isArray(created) ? created : (created.patients || [created]);
      const newPid = newPatients[0]?.patientid;

      if (!newPid) {
        console.error('[booking/register-and-book] Patient created but no ID returned');
        return res.status(500).json({ error: 'patient_create_failed' });
      }

      patientId = String(newPid);
      isNew = true;
    }
  } catch (err) {
    const status  = err.response?.status;
    const errBody = err.response?.data;
    console.error('[booking/register-and-book] Patient step error:', status, err.message, JSON.stringify(errBody));
    if (status === 400) {
      return res.status(400).json({ error: 'invalid_patient_data' });
    }
    return res.status(503).json({ error: 'service_unavailable' });
  }

  // ── Step 2: Book appointment ──────────────────────────────────────────────
  const bookBody = { patientid: patientId, reasonid: reasonId };
  if (notes && notes.trim()) bookBody.patientinstructions = notes.trim();

  try {
    const data = await athenaPut(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}`,
      bookBody
    );

    // Write patient notes (best-effort)
    if (notes && notes.trim()) {
      try {
        await athenaPost(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
          { notetext: `Notes from patient: ${notes.trim()}`, displayonschedule: 'true' }
        );
      } catch (noteErr) {
        console.error('[booking/register-and-book] Patient note write error:', noteErr.response?.status, noteErr.message);
      }
    }

    // Fire-and-forget: refresh this provider's slots in WordPress via vantage-api
    if (providerId && departmentId && process.env.VANTAGE_API_URL && process.env.VANTAGE_API_SECRET) {
      fetch(`${process.env.VANTAGE_API_URL}/api/sync-single-provider`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-sync-secret': process.env.VANTAGE_API_SECRET,
        },
        body: JSON.stringify({ providerId: String(providerId), departmentId: String(departmentId) }),
      }).catch((syncErr) => {
        console.warn('[booking/register-and-book] vantage-api sync trigger failed (non-blocking):', syncErr.message);
      });
    }

    // Fire-and-forget: update this provider's entry in batchAvailCache
    if (providerId && departmentId && batchAvailCache.results) {
      (async () => {
        try {
          const availData = await athenaGet(
            `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
            {
              providerid:   String(providerId),
              departmentid: String(departmentId),
              startdate:    todayMMDDYYYY(),
              enddate:      futureDateMMDDYYYY(90),
              reasonid:     '-1',
            }
          );
          const appts    = Array.isArray(availData) ? availData : (availData.appointments || []);
          const hasSlots = appts.length > 0;
          const idx      = batchAvailCache.results.findIndex(
            (r) => String(r.providerId) === String(providerId)
          );
          if (idx !== -1) {
            batchAvailCache.results[idx] = { ...batchAvailCache.results[idx], hasSlots };
            console.log(`[booking/register-and-book] batchAvailCache updated: provider ${providerId} hasSlots=${hasSlots}`);
          }
        } catch (cacheErr) {
          console.warn('[booking/register-and-book] batchAvail cache update failed (non-blocking):', cacheErr.message);
        }
      })();
    }

    return res.json({ success: true, patientId, isNew, appointmentDetails: data });
  } catch (err) {
    const status  = err.response?.status;
    const errBody = err.response?.data;
    const errMsg  = (typeof errBody === 'string' ? errBody : errBody?.error || '').toLowerCase();

    // Booking failed — if patient was newly created, mark inactive to prevent orphan record
    if (isNew) {
      try {
        await athenaPut(
          `/v1/${process.env.ATHENA_PRACTICE_ID}/patients/${patientId}`,
          { status: 'i' }
        );
        console.log(`[booking/register-and-book] New patient ${patientId} marked inactive after booking failure`);
      } catch (inactiveErr) {
        console.error('[booking/register-and-book] Failed to mark patient inactive:', inactiveErr.response?.status, inactiveErr.message);
      }
    }

    if (
      status === 409 ||
      errMsg.includes('slot') ||
      errMsg.includes('already') ||
      errMsg.includes('not open') ||
      errMsg.includes('not available') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('cannot be booked') ||
      errMsg.includes('already scheduled')
    ) {
      return res.json({ errorType: 'slot_taken' });
    }

    console.error('[booking/register-and-book] Booking error:', status, err.message, JSON.stringify(errBody));
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
  const { appointmentId, serviceSlug, patientType } = req.body;

  if (!appointmentId || !serviceSlug) {
    return res.json({ success: false });
  }

  const label      = SERVICE_NOTE_LABELS[serviceSlug] || serviceSlug;
  const visitLabel = patientType === 'new' ? 'Intake' : 'Follow Up';

  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
      { notetext: `Web Scheduling: ${visitLabel}, ${label}`, displayonschedule: 'true' }
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
  const { appointmentId, insuranceName, groupId, memberId, email, phone, phoneType, dob, reasonName } = req.body;

  if (!appointmentId || !insuranceName) {
    return res.json({ success: false });
  }

  const noteText =
    `Reported reason for booking: (Patient Email: ${email || ''}, ` +
    `Phone: ${phone || ''}, Type: ${phoneType || ''}, Patient DOB: ${dob || ''}, ` +
    `Insurance: ${insuranceName}, Group ID: ${groupId || '—'}, Member ID: ${memberId || '—'}) ` +
    `REASON: ${reasonName || ''}`;

  try {
    await athenaPost(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/${appointmentId}/notes`,
      { notetext: noteText, displayonschedule: 'true' }
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

app.post('/api/booking/create-patient-case', async (req, res) => {
  const { patientId, departmentId, providerId, patientData: pd, appointmentData: ad } = req.body;

  if (!patientId || !departmentId || !providerId) {
    console.error('[booking/create-patient-case] Missing required fields');
    return res.json({ success: false });
  }

  const assignedTo = 'STILLWATER OFFICE STAFF';

  const noteText =
    `Please verify if this is, in fact, a new patient or a duplicate record for an existing patient.\n\n` +
    `Patient information: (Patient Email: ${pd?.email || ''},\n` +
    `Phone: ${pd?.phone || ''}, Type: mobile, Patient DOB: ${pd?.dob || ''},\n` +
    `Insurance: ${pd?.insuranceName || 'None'}, Group ID: ${pd?.groupId || '-'},\n` +
    `Member ID: ${pd?.memberId || '-'})\n` +
    `REASON: ${ad?.reasonName || ''}, Appointment Type: ${ad?.reasonName || ''}\n` +
    `Notes: ${pd?.notes || '-'}\n\n` +
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

// ─── GET /api/booking/refresh-provider-availability ──────────────────────────
// Browser-callable endpoint. Fetches fresh availability for a single provider
// from Athena (1 call) and updates their entry in batchAvailCache.
// Usage: https://booking-backend-717838047212.us-central1.run.app/api/booking/refresh-provider-availability?providerId=31&departmentId=8&secret=vantage-sync-2026
app.get('/api/booking/refresh-provider-availability', async (req, res) => {
  const { providerId, departmentId, secret } = req.query;
  if (process.env.VANTAGE_API_SECRET && secret !== process.env.VANTAGE_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!providerId || !departmentId) {
    return res.status(400).json({ error: 'providerId and departmentId are required' });
  }
  try {
    const data = await athenaGet(
      `/v1/${process.env.ATHENA_PRACTICE_ID}/appointments/open`,
      {
        providerid:   providerId,
        departmentid: departmentId,
        startdate:    todayMMDDYYYY(),
        enddate:      futureDateMMDDYYYY(90),
        reasonid:     '-1',
      }
    );
    const appts    = Array.isArray(data) ? data : (data.appointments || []);
    const hasSlots = appts.length > 0;

    // Update or insert the entry in batchAvailCache if cache exists
    if (batchAvailCache.results) {
      const idx = batchAvailCache.results.findIndex(
        (r) => String(r.providerId) === String(providerId)
      );
      if (idx !== -1) {
        batchAvailCache.results[idx] = { ...batchAvailCache.results[idx], hasSlots };
      } else {
        batchAvailCache.results.push({ providerId: String(providerId), hasSlots });
      }
    }

    console.log(`[booking/refresh-provider-availability] provider ${providerId} dept ${departmentId} — hasSlots: ${hasSlots} (${appts.length} slots)`);
    return res.json({
      success:      true,
      providerId:   String(providerId),
      departmentId: String(departmentId),
      hasSlots,
      slotCount:    appts.length,
      refreshedAt:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('[booking/refresh-provider-availability] error:', err.message);
    return res.status(503).json({ error: 'Failed to fetch availability from Athena', detail: err.message });
  }
});

// ─── GET /api/booking/clear-availability-cache ───────────────────────────────
// Browser-callable emergency endpoint. Expires the batchAvailCache so the next
// directory load fetches fresh availability from Athena.
// Usage: https://booking-backend-717838047212.us-central1.run.app/api/booking/clear-availability-cache?secret=vantage-sync-2026
app.get('/api/booking/clear-availability-cache', (req, res) => {
  const secret = req.query.secret;
  if (process.env.VANTAGE_API_SECRET && secret !== process.env.VANTAGE_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  batchAvailCache.results   = null;
  batchAvailCache.expiresAt = 0;
  console.log('[booking] batchAvailCache manually cleared via browser');
  return res.json({
    success:   true,
    message:   'Availability cache cleared. Next directory load will fetch fresh data from Athena.',
    clearedAt: new Date().toISOString(),
  });
});

// ─── GET /api/booking/clear-reasons-cache ────────────────────────────────────
// Browser-callable endpoint. Clears the in-memory reasons cache so the next
// booking request fetches fresh reasons from Athena for all providers.
// Usage: https://booking-backend-717838047212.us-central1.run.app/api/booking/clear-reasons-cache?secret=vantage-sync-2026
app.get('/api/booking/clear-reasons-cache', (req, res) => {
  const secret = req.query.secret;
  if (process.env.VANTAGE_API_SECRET && secret !== process.env.VANTAGE_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const count = reasonsCache.size;
  reasonsCache.clear();
  console.log('[booking] reasonsCache manually cleared via browser');
  return res.json({
    success:   true,
    message:   `Reasons cache cleared (${count} entries). Next booking request will fetch fresh reasons from Athena.`,
    clearedAt: new Date().toISOString(),
  });
});

// ─── GET /api/booking/scheduling-meta ────────────────────────────────────────
// Returns time-of-day scheduling preferences (Morning/Mid Day/Evening/Weekends)
// per provider. Served from a 30-day in-memory + disk cache.
// First request after cache expiry triggers a synchronous refresh (~46 Athena calls).
app.get('/api/booking/scheduling-meta', async (_req, res) => {
  const hasData = schedulingMetaCache.providers && Object.keys(schedulingMetaCache.providers).length > 0;
  if (hasData && Date.now() < schedulingMetaCache.expiresAt) {
    return res.json({ lastUpdated: schedulingMetaCache.lastUpdated, providers: schedulingMetaCache.providers });
  }
  try {
    const fresh = await refreshSchedulingMeta();
    return res.json({ lastUpdated: fresh.lastUpdated, providers: fresh.providers });
  } catch (err) {
    console.error('[scheduling-meta] Refresh error:', err.message);
    return res.json({ lastUpdated: null, providers: {} }); // fail open
  }
});

// ─── GET /api/booking/refresh-scheduling-meta ─────────────────────────────────
// Manual trigger to force a scheduling-meta refresh (e.g. mid-month schedule change).
// Usage: /api/booking/refresh-scheduling-meta?secret=<VANTAGE_API_SECRET>
app.get('/api/booking/refresh-scheduling-meta', async (req, res) => {
  const secret = req.query.secret;
  if (process.env.VANTAGE_API_SECRET && secret !== process.env.VANTAGE_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const fresh = await refreshSchedulingMeta();
    return res.json({ success: true, lastUpdated: fresh.lastUpdated, providersCount: Object.keys(fresh.providers).length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
