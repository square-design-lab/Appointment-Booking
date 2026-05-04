# WordPress Setup

## Prerequisites

- Node.js 18+ installed locally for the build step
- Backend (Node/Express) deployed to Google Cloud Run (or equivalent)
- Firebase Hosting project created (or a static host of your choice)

---

## 1. Build the frontend

```bash
cd frontend
npm install
npm run build
```

The production bundle is output to `frontend/dist/`.

---

## 2. Host the static bundle

**Option A — Firebase Hosting (recommended)**

```bash
# From the frontend/ directory
firebase deploy --only hosting
```

Set `public` to `dist` in `firebase.json`. The bundle will be served from
a CDN with automatic SSL.

**Option B — Upload to WordPress**

Upload the contents of `frontend/dist/` to:
```
/wp-content/uploads/booking/
```

Note the hash in the JS filename (e.g. `assets/index-AbCdEfGh.js`) — you'll
need it in step 3.

---

## 3. Create the WordPress `/book/` page

1. In WordPress admin → **Pages → Add New**
2. Set the slug to `book`
3. Add an **Elementor HTML widget** (or use **WPCode**) with this markup:

```html
<div id="vantage-booking-root"></div>
<script>
  window.VANTAGE_BOOKING = {
    apiUrl: 'https://YOUR-CLOUD-RUN-URL'
  };
</script>
```

Replace `YOUR-CLOUD-RUN-URL` with the base URL of your deployed backend
(no trailing slash, no path — the frontend appends `/api/booking/...`).

---

## 4. Enqueue the React bundle

Add to your child theme's `functions.php`, or paste into a **WPCode PHP snippet**:

```php
add_action('wp_enqueue_scripts', function () {
    if (!is_page('book')) return;
    wp_enqueue_script(
        'vantage-booking',
        'https://YOUR-HOSTING-URL/assets/index-HASH.js',
        [],
        null,
        true   // load in footer
    );
    wp_enqueue_style(
        'vantage-booking-css',
        'https://YOUR-HOSTING-URL/assets/index-HASH.css',
        [],
        null
    );
});
```

Replace `YOUR-HOSTING-URL` and `HASH` with the actual values from your build.

> **Tip:** If you use Firebase Hosting with a custom domain alias or a stable
> URL path, you can omit the hash from the filename by configuring Vite's
> `build.rollupOptions.output.entryFileNames`.

---

## 5. Update slots.js in WordPress

The existing WPCode snippet `slots.js` redirects patients from the old
`/schedule/` Athena iframe to the new React form. Replace it with the version
from `wordpress/slots.js` in this repo — it already points `redirect()` to
`/book/` with all required URL parameters.

**Required URL parameters passed to `/book/`:**

| Parameter | Source |
|---|---|
| `locationId` | Vantage location identifier |
| `departmentId` | Athena department ID |
| `providerId` | Athena provider ID |
| `providerName` | Provider display name |
| `service` | Service slug (e.g. `psychiatry`) |
| `visitType` | `inperson` or `telehealth` |
| `patientType` | `new` or `returning` |
| `telehealthState` | Patient state for telehealth eligibility |
| `telehealthLocs` | Comma-separated eligible telehealth locations |
| `insurance` | Pre-selected insurance slug (optional) |
| `minAge` / `maxAge` | Provider age range (optional) |

---

## 6. Verify and clean up

1. Open `/book/?providerId=1&departmentId=1&service=psychiatry` in your browser
2. Confirm the booking flow loads, shows provider info, and reaches Step 2
3. Test a full sandbox booking end-to-end
4. Once confirmed working, **delete the `/schedule/` WordPress page**
   (or redirect it to `/book/` via a 301 redirect in your `.htaccess` or
   Redirection plugin)

---

## 7. Backend environment variables

All secrets are managed via **GCP Secret Manager** and injected into Cloud Run.
Do not commit these values.

| Variable | Description |
|---|---|
| `ATHENA_CLIENT_ID` | Athena OAuth2 client ID |
| `ATHENA_CLIENT_SECRET` | Athena OAuth2 client secret |
| `ATHENA_PRACTICE_ID` | Practice ID (`3153301`) |
| `ATHENA_BASE_URL` | Athena API base URL (sandbox or production) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_API_KEY_SID` | Twilio API key SID |
| `TWILIO_API_KEY_SECRET` | Twilio API key secret |
| `TWILIO_FROM_NUMBER` | Twilio SMS sender number |
| `SUPPORT_PHONE` | Staff phone number for booking alerts |
| `PORT` | Server port (default `3001`) |
| `DATE_OFFSET_DAYS` | Shift slot dates forward N days (sandbox only) |

---

## 8. Health check

The backend exposes a health endpoint you can monitor:

```
GET /api/booking/health
```

Returns `{ "status": "ok", "athena": "reachable" }` when Athena is up,
or `{ "status": "ok", "athena": "unreachable" }` if Athena is down.
Always returns HTTP 200.
