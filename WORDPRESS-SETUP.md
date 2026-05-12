# WordPress Integration — Vantage Booking Form

## Deployed Services

| Service  | URL |
|----------|-----|
| **Frontend** | https://booking-frontend-717838047212.us-central1.run.app |
| **Backend API** | https://booking-backend-717838047212.us-central1.run.app |
| **Health check** | https://booking-backend-717838047212.us-central1.run.app/api/booking/health |

---

## How It Works

The booking form is a React SPA served from Cloud Run. You embed it on the
WordPress `/book/` page using a full-height `<iframe>`. WordPress injects
`window.VANTAGE_BOOKING` before the iframe loads so the form knows which
provider / location to load and where to send API requests.

---

## Step-by-Step WordPress Setup

### Step 1 — Create the `/book/` Page

1. In WordPress admin go to **Pages → Add New**
2. Set the title: **Book an Appointment**
3. Set the slug: `book`
4. Set the page template to **Full Width** (removes sidebar — iframe needs full horizontal space)
5. Leave the body content empty — the iframe block below will fill it

---

### Step 2 — Add the Iframe Block

In the page editor switch to the **Code Editor** view (top-right ⋮ menu →
**Code editor**) and paste:

```html
<!-- wp:html -->
<div id="vantage-booking-wrap">
  <iframe
    id="vantage-booking-iframe"
    src="https://booking-frontend-717838047212.us-central1.run.app"
    title="Book an Appointment — Vantage Mental Health"
    frameborder="0"
    scrolling="no"
    style="width:100%;border:none;display:block;min-height:700px;"
  ></iframe>
</div>
<!-- /wp:html -->
```

---

### Step 3 — Add the Auto-Resize + Config Script

Still in the Code Editor, paste this block **directly below** the iframe block:

```html
<!-- wp:html -->
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var iframe  = document.getElementById('vantage-booking-iframe');

  // Inject API URL + URL params into iframe once it loads
  iframe.addEventListener('load', function () {
    iframe.contentWindow.postMessage(
      {
        type:         'VANTAGE_BOOKING_CONFIG',
        apiUrl:       'https://booking-backend-717838047212.us-central1.run.app',
        providerId:   params.get('provider')      || '',
        providerName: params.get('providerName')  || '',
        service:      params.get('service')       || '',
        location:     params.get('location')      || '',
        visitType:    params.get('visitType')     || '',
      },
      'https://booking-frontend-717838047212.us-central1.run.app'
    );
  });

  // Auto-resize iframe to match content height
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://booking-frontend-717838047212.us-central1.run.app') return;
    if (e.data && e.data.type === 'VANTAGE_HEIGHT') {
      iframe.style.height = (e.data.height + 32) + 'px';
    }
  });
})();
</script>
<!-- /wp:html -->
```

---

### Step 4 — Add Height-Post Message to the React App

Open `frontend/src/main.jsx` and add a `ResizeObserver` that posts height
changes to the WordPress parent page. If it is not already there, add:

```js
const ro = new ResizeObserver(entries => {
  const h = entries[0]?.contentRect.height ?? document.body.scrollHeight;
  window.parent.postMessage({ type: 'VANTAGE_HEIGHT', height: Math.ceil(h) }, '*');
});
ro.observe(document.getElementById('vantage-booking-root'));
```

After adding, redeploy the frontend (see **Redeployment** section below).

---

### Step 5 — Update Each Provider's "Book Now" Button

Every provider page or card on the website should link to:

```
https://vantagementalhealth.org/book/?provider=ATHENA_ID&providerName=DISPLAY_NAME&service=SERVICE_SLUG&location=LOCATION_ID
```

**Parameter reference:**

| Parameter | Example | Description |
|-----------|---------|-------------|
| `provider` | `12345` | Athena provider ID (from provider-contacts.json) |
| `providerName` | `Jane+Smith,+LICSW` | Display name shown in the form header |
| `service` | `psychiatry` | Service slug — see table below |
| `location` | `1` | Department ID: `1`=Stillwater, `5`=St. Anthony, `8`=Edina |
| `visitType` | `telehealth` | Pre-select: `telehealth` or `inperson` (optional) |

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
<a href="/book/?provider=12345&providerName=Jane+Smith%2C+LICSW&service=psychiatry&location=1"
   class="elementor-button">
  Book with Jane Smith
</a>
```

---

### Step 6 — Add CSS to Remove WordPress Page Chrome (Optional)

If the page template still shows a title or extra padding above the iframe,
go to **Appearance → Customize → Additional CSS** and add:

```css
/* Booking page — full-bleed iframe, no header/padding */
.page-id-XXXX .entry-title,
.page-id-XXXX .page-header     { display: none; }

.page-id-XXXX .entry-content,
.page-id-XXXX .page-content    { padding: 0 !important; margin: 0 !important; }

#vantage-booking-wrap           { margin: 0; padding: 0; }
```

Replace `XXXX` with the WordPress page ID (visible in the editor URL:
`post.php?post=XXXX`).

---

### Step 7 — Verify the Integration

1. Open:
   ```
   https://vantagementalhealth.org/book/?provider=TEST&providerName=Test+Provider&service=psychiatry&location=1
   ```
2. The booking form should appear inside the WordPress page layout
3. Open browser DevTools → Console — no CORS errors should appear
4. Step through to Step 2 — calendar should show appointment slots
5. Complete the full flow to the confirmation screen

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
