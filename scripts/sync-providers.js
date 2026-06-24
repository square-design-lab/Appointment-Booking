/**
 * Sync provider data from WordPress REST API into provider-contacts.json.
 *
 * Default (test run):
 *   node scripts/sync-providers.js
 *   Writes to backend/provider-contacts-wp-test.json — review before going live.
 *
 * Live update (after verifying the test file):
 *   node scripts/sync-providers.js --live
 *   Overwrites backend/provider-contacts.json AND frontend/src/data/provider-contacts.json
 *
 * sms_opt_in and mobile_number are preserved from the existing JSON for known providers.
 * New providers get sms_opt_in: false and mobile_number: "".
 */

const fs   = require('fs');
const path = require('path');

const WP_BASE = 'https://vantagementalhealth.org/wp-json/wp/v2';

const ROOT          = path.resolve(__dirname, '..');
const BACKEND_LIVE  = path.join(ROOT, 'backend',  'provider-contacts.json');
const FRONTEND_LIVE = path.join(ROOT, 'frontend', 'src', 'data', 'provider-contacts.json');
const TEST_OUTPUT   = path.join(ROOT, 'backend',  'provider-contacts-wp-test.json');

// Minor name differences between WP and the existing JSON
function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

const INSURANCE_NORM = {
  "America's PPO": 'Americas PPO',
  'Ucare':         'UCare',
};

function normalizeInsurance(name) {
  return INSURANCE_NORM[name] || name;
}

// "Drew Gernand, PA-C"  → name: "Drew Gernand, PA-C", credentials: "PA-C"
// "Saul Clayman, MA, LADC" → name: "Saul Clayman, MA, LADC", credentials: "MA, LADC"
function parseTitle(rendered) {
  const idx = rendered.indexOf(', ');
  if (idx === -1) return { name: rendered, credentials: '' };
  return {
    name:        rendered,
    credentials: rendered.slice(idx + 2),
  };
}

function deriveSpecialty(services) {
  return services.includes('psychiatry') ? 'Psychiatry' : 'Therapy';
}

async function wpFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WP fetch failed ${res.status}: ${url}`);
  return res.json();
}

// Fetch every page of a post type and return an id → title map
async function buildLookup(postType) {
  const map  = {};
  let   page = 1;

  while (true) {
    const url   = `${WP_BASE}/${postType}?per_page=100&page=${page}&_fields=id,title`;
    const posts = await wpFetch(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    posts.forEach(p => { map[p.id] = decodeHtml(p.title?.rendered || ''); });
    if (posts.length < 100) break;
    page++;
  }

  console.log(`  ${postType}: ${Object.keys(map).length} entries`);
  return map;
}

// Fetch all provider posts with embedded featured image
async function fetchProviders() {
  const all  = [];
  let   page = 1;

  while (true) {
    const url   = `${WP_BASE}/providers?per_page=100&page=${page}&_embed&_fields=id,title,featured_media,meta,_links`;
    const posts = await wpFetch(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    all.push(...posts);
    if (posts.length < 100) break;
    page++;
  }

  console.log(`  providers: ${all.length} posts`);
  return all;
}

async function main() {
  const isLive = process.argv.includes('--live');

  // Load existing file to preserve sms_opt_in and mobile_number
  const existing    = JSON.parse(fs.readFileSync(BACKEND_LIVE, 'utf-8'));
  const smsMap      = {};
  existing.forEach(p => {
    smsMap[p.athena_provider_id] = {
      sms_opt_in:    p.sms_opt_in    ?? false,
      mobile_number: p.mobile_number ?? '',
    };
  });

  console.log('Fetching lookup tables from WordPress...');
  const [conditionsMap, treatmentsMap, servicesMap] = await Promise.all([
    buildLookup('conditions'),
    buildLookup('treatments'),
    buildLookup('our-services'),
  ]);

  console.log('Fetching providers...');
  const wpProviders = await fetchProviders();

  const result = [];

  for (const post of wpProviders) {
    const meta       = post.meta || {};
    const providerId = String(meta.athena_provider_id   || '').trim();
    const deptId     = String(meta.athena_department_id || '').trim();

    if (!providerId || !deptId) {
      console.warn(`  Skipping post ${post.id} — missing athena_provider_id or athena_department_id`);
      continue;
    }

    const { name, credentials } = parseTitle(decodeHtml(post.title?.rendered || ''));

    // Featured image URL from _embed
    const featuredMedia = post._embedded?.['wp:featuredmedia'];
    const photo = (Array.isArray(featuredMedia) && featuredMedia[0]?.source_url)
      ? featuredMedia[0].source_url
      : '';

    if (!photo) console.warn(`  No photo for provider ${providerId} (${name})`);

    const whatWeTreat = (meta.treated_conditions || [])
      .map(id => conditionsMap[id])
      .filter(label => {
        if (!label) console.warn(`    Unresolved condition ID for provider ${providerId}`);
        return Boolean(label);
      });

    const treatmentApproach = (meta.treatment || [])
      .map(id => treatmentsMap[id])
      .filter(label => {
        if (!label) console.warn(`    Unresolved treatment ID for provider ${providerId}`);
        return Boolean(label);
      });

    const specialties = (meta.services_provided || [])
      .map(id => servicesMap[id])
      .filter(label => {
        if (!label) console.warn(`    Unresolved our-services ID for provider ${providerId}`);
        return Boolean(label);
      });

    const services      = meta.services            || [];
    const insurance     = (meta.provider_insurances || []).map(normalizeInsurance);
    const gender        = (meta.gender              || [])[0] || '';
    const telehealthLocs = (meta.telehealth_location || []).join(', ');
    const acceptingNew  = (meta.accepting_new_patients || [])[0] === 'Yes';
    const minAge        = parseInt(meta.min_age || '0', 10);
    const maxAge        = parseInt(meta.max_age || '0', 10);
    const sms           = smsMap[providerId] || { sms_opt_in: false, mobile_number: '' };

    result.push({
      athena_provider_id: providerId,
      departmentId:       deptId,
      name,
      provider_title:     decodeHtml(meta.provider_title || ''),
      credentials,
      specialty:          deriveSpecialty(services),
      specialties,
      photo,
      sms_opt_in:         sms.sms_opt_in,
      mobile_number:      sms.mobile_number,
      acceptingNew,
      minAge,
      maxAge,
      telehealthLocs,
      insurance,
      whatWeTreat,
      treatmentApproach,
      gender,
      languages:          meta.language || [],
      services,
    });
  }

  // Sort by athena_provider_id numerically to match existing file order
  result.sort((a, b) => parseInt(a.athena_provider_id) - parseInt(b.athena_provider_id));

  const json = JSON.stringify(result, null, 2);

  if (isLive) {
    fs.writeFileSync(BACKEND_LIVE,  json);
    fs.writeFileSync(FRONTEND_LIVE, json);
    console.log(`\nLive update complete — ${result.length} providers written to:`);
    console.log(`  ${BACKEND_LIVE}`);
    console.log(`  ${FRONTEND_LIVE}`);
  } else {
    fs.writeFileSync(TEST_OUTPUT, json);
    console.log(`\nTest file written — ${result.length} providers:`);
    console.log(`  ${TEST_OUTPUT}`);
    console.log('\nReview the test file, then run with --live to update the live files.');
  }
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
