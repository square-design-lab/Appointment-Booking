# WordPress Integration — Vantage Booking Form

## Deployed Services

| Service  | URL |
|----------|-----|
| **Booking App** | https://booking-frontend-717838047212.us-central1.run.app |
| **Backend API** | https://booking-backend-717838047212.us-central1.run.app |
| **Health check** | https://booking-backend-717838047212.us-central1.run.app/api/booking/health |

---

## How It Works

The booking form is a standalone React app served from Cloud Run. Patients
access it directly — no iframe needed. WordPress "Book Now" buttons simply
link to the Cloud Run URL with query parameters that identify the provider,
location, and service. When visited without a `providerId` param, the app
shows a full provider directory.

---

## Step-by-Step WordPress Setup

### Step 1 — Update Each Provider's "Book Now" Button

Every provider page or card on the website should link to:

```
https://booking-frontend-717838047212.us-central1.run.app/?providerId=ATHENA_ID&providerName=DISPLAY_NAME&departmentId=DEPT_ID&service=SERVICE_SLUG
```

**Parameter reference:**

| Parameter | Example | Description |
|-----------|---------|-------------|
| `providerId` | `12345` | Athena provider ID (from provider-contacts.json) |
| `providerName` | `Jane+Smith,+LICSW` | Display name shown in the form header |
| `departmentId` | `1` | Department ID: `1`=Stillwater, `5`=St. Anthony, `8`=Edina |
| `service` | `psychiatry` | Service slug — see table below |
| `visitType` | `telehealth` | Pre-select: `telehealth` or `inperson` (optional) |
| `telehealthState` | `mn` | Pre-select state: `mn` or `other` (optional) |

**Service slugs:**

| Slug | Label shown in form |
|------|---------------------|
| `psychiatry` | Psychiatric Medication Management |
| `therapy-individual` | Mental Health Therapy |
| `therapy-family` | Family Therapy |
| `therapy-couples` | Couples Therapy |
| `therapy-child` | Child Therapy |
| `therapy-teen` | Teen Therapy |
| `tms` | Transcranial Magnetic Stimulation |
| `adhd` | ADHD Evaluation |
| `psych-testing` | Psychopharmacologic Testing |

**Example button HTML (Elementor or block editor):**
```html
<a href="https://booking-frontend-717838047212.us-central1.run.app/?providerId=12345&providerName=Jane+Smith%2C+LICSW&departmentId=1&service=psychiatry"
   class="elementor-button">
  Book with Jane Smith
</a>
```

---

### Step 2 — Update the `slots.js` Modal Redirect

The WordPress provider-listing page uses `slots.js` to open a booking modal
that redirects patients into the app. The `bookingPage` variable in that file
already points to the Cloud Run URL:

```js
var bookingPage = 'https://booking-frontend-717838047212.us-central1.run.app/';
```

No further changes needed here — the modal passes all required params as a
query string automatically.

---

### Step 3 — Verify the Integration

1. Open the provider directory directly:
   ```
   https://booking-frontend-717838047212.us-central1.run.app/
   ```
   All providers should appear with photo, title, location, and specialty tags.

2. Open a provider deep-link:
   ```
   https://booking-frontend-717838047212.us-central1.run.app/?providerId=1&providerName=Justin+Gerstner,+MD&departmentId=1&service=psychiatry
   ```
   The booking flow should start at Step 1 with the correct provider name.

3. Open browser DevTools → Console — no CORS errors should appear.

4. Step through to Step 2 — calendar should show appointment slots.

5. Complete the full flow to the confirmation screen.

---

## Redeployment

### After backend code changes:
```bash
cd backend
gcloud run deploy booking-backend \
  --source . \
  --region us-central1 \
  --project vantage-appointment-booking
```
Existing environment variables are preserved automatically.

### After frontend code changes:
```bash
cd frontend
gcloud run deploy booking-frontend \
  --source . \
  --region us-central1 \
  --project vantage-appointment-booking \
  --set-build-env-vars "VITE_API_URL=https://booking-backend-717838047212.us-central1.run.app"
```

---

## Custom Domain Setup (When Ready for Production)

Map `book.vantagementalhealth.org` to the frontend and
`booking-api.vantagementalhealth.org` to the backend:

```bash
# Frontend custom domain
gcloud run domain-mappings create \
  --service booking-frontend \
  --domain book.vantagementalhealth.org \
  --region us-central1

# Backend custom domain
gcloud run domain-mappings create \
  --service booking-backend \
  --domain booking-api.vantagementalhealth.org \
  --region us-central1
```

Then add the CNAME records shown to your DNS provider (Kinsta DNS / Cloudflare).
After DNS propagates, add both domains to `ALLOWED_ORIGINS` in `backend/server.js`
and redeploy the backend.

---

## Switching from Sandbox to Production Athena

When Athena approves production credentials:

```bash
gcloud run services update booking-backend \
  --region us-central1 \
  --project vantage-appointment-booking \
  --update-env-vars "ATHENA_CLIENT_ID=PROD_ID,ATHENA_CLIENT_SECRET=PROD_SECRET,ATHENA_BASE_URL=https://api.platform.athenahealth.com,DATE_OFFSET_DAYS=0"
```

`DATE_OFFSET_DAYS=0` removes the 24-hour scheduling offset that only applies
in the Athena sandbox environment.
