import React, { useState, useEffect, useMemo, useRef } from 'react';
import logoSrc from '../assets/logo.png';
import { fetchBatchAvailability, fetchSchedulingMeta, fetchProviders } from '../api/bookingApi';
import { ATHENA_PRACTICE_ID } from '../BookingContext';

function pushDataLayer(obj) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(obj);
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://book.vantagementalhealth.org/';

const DEPT_NAMES = {
  '1': 'Stillwater',
  '5': 'St. Anthony',
  '8': 'Edina',
};

const SPECIALTY_TO_SERVICE = {
  'Psychiatric Medication Management': 'psychiatry',
  'Mental Health Therapy':             'therapy-individual',
  'Family Therapy':                    'therapy-family',
  'Couples Therapy':                   'therapy-couples',
  'Child Therapy':                     'therapy-child',
  'Teen Therapy':                      'therapy-teen',
  'Transcranial Magnetic Stimulation': 'tms',
  'ADHD Evaluation':                   'adhd',
  'Psychopharmacologic Testing':       'psych-testing',
};


// Time-of-day: sourced from monthly scheduling-meta endpoint (no extra API cost on page load)
// Availability speed: sourced from real-time batch-availability (4-hour cache)
const ALL_SCHEDULING = [
  { value: 'Morning',                label: 'Morning (before 12pm)' },
  { value: 'Mid Day',                label: 'Mid Day (12pm–5pm)' },
  { value: 'Evening',                label: 'Evening (after 5pm)' },
  { value: 'Weekends',               label: 'Weekends' },
  { value: 'Opening This Week',      label: 'Opening This Week' },
  { value: 'In Less Than Two Weeks', label: 'In Less Than Two Weeks' },
  { value: 'Within One Month',       label: 'Within One Month' },
];


// ALL_WHAT_WE_TREAT and ALL_TREATMENT_APPROACH are derived dynamically inside
// the component from the live provider data, so they always match WordPress.

const ALL_GENDERS = ['Male', 'Female', 'Non-Binary'];

// ── URL ↔ filter sync ────────────────────────────────────────────────────────

// Reverse of SPECIALTY_TO_SERVICE: slug → display name
const SERVICE_SLUG_TO_SPECIALTY = Object.fromEntries(
  Object.entries(SPECIALTY_TO_SERVICE).map(([display, slug]) => [slug, display])
);

function parseDirectoryParams() {
  const p = new URLSearchParams(window.location.search);
  const serviceSlug = p.get('service') || '';
  return {
    service:    SERVICE_SLUG_TO_SPECIALTY[serviceSlug] || '',
    location:   p.get('location')   || '',
    insurance:  p.get('insurance')  || '',
    scheduling: p.get('scheduling') || '',
    treat:      p.get('treat')      || '',
    approach:   p.get('approach')   || '',
    gender:     p.get('gender')     || '',
    language:   p.get('language')   || '',
    age:        p.get('age')        || '',
    accepting:  p.get('accepting')  === '1',
    search:     p.get('search')     || '',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name) {
  return name
    .split(',')[0]
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function buildBookingUrl(provider) {
  const params = new URLSearchParams({
    locationId:     `${ATHENA_PRACTICE_ID}-${provider.departmentId}`,
    practitionerId: `${ATHENA_PRACTICE_ID}-${provider.athena_provider_id}`,
  });
  return BASE_URL + '?' + params.toString();
}

// ── ProviderCard ─────────────────────────────────────────────────────────────

function ProviderCard({ provider, hasSlots, availabilityLoading }) {
  const [imgError,  setImgError]  = useState(false);
  const [visible,   setVisible]   = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const locationName = DEPT_NAMES[provider.departmentId] || '';
  const hasTelehealth = !!(provider.telehealthLocs || '').trim();
  const locationDisplay = locationName
    ? hasTelehealth ? `${locationName}, Telehealth` : locationName
    : hasTelehealth ? 'Telehealth' : '';
  const tags = (provider.specialties || []).slice(0, 3);
  const bookingUrl = buildBookingUrl(provider);

  // canBook = we've confirmed slots exist; don't link while still loading or if none
  const canBook = !availabilityLoading && hasSlots !== false;

  const photoInner = (
    <div className="vpd-card-photo-wrap">
      {provider.photo && !imgError ? (
        <img
          src={provider.photo}
          alt={provider.name}
          className="vpd-card-photo"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="vpd-card-initials" aria-hidden="true">
          {getInitials(provider.name)}
        </div>
      )}
    </div>
  );

  return (
    <div ref={cardRef} className={`vpd-card${visible ? ' vpd-card--visible' : ''}`}>
      {canBook ? (
        <a href={bookingUrl} className="vpd-card-photo-link" tabIndex={-1} aria-hidden="true">
          {photoInner}
        </a>
      ) : (
        photoInner
      )}

      <div className="vpd-card-body">
        <div className="vpd-card-name">{provider.name}</div>
        <div className="vpd-card-title">{provider.provider_title}</div>
        {locationDisplay && (
          <div className="vpd-card-location">{locationDisplay}</div>
        )}
        {tags.length > 0 && (
          <div className="vpd-card-tags">
            {tags.map((t) => (
              <span key={t} className="vpd-tag">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="vpd-card-footer">
        {availabilityLoading ? (
          <span className="vpd-avail-loading">Checking availability…</span>
        ) : hasSlots === false ? (
          <p className="vpd-no-avail-msg">No online availability — call us to schedule</p>
        ) : (
          <a
            href={bookingUrl}
            className="vbf-btn vbf-btn--primary vpd-book-btn"
          >
            Book Appointment
          </a>
        )}
      </div>
    </div>
  );
}

// ── ProviderDirectory ────────────────────────────────────────────────────────

export default function ProviderDirectory() {
  // GTM — fire once when directory is viewed
  useEffect(() => {
    pushDataLayer({ event: 'booking_directory_viewed' });
  }, []);

  // Initialise each filter from URL params (lazy — runs once on mount)
  const [initParams] = useState(parseDirectoryParams);
  const [serviceFilter,    setServiceFilter]    = useState(initParams.service);
  const [locationFilter,   setLocationFilter]   = useState(initParams.location);
  const [insuranceFilter,  setInsuranceFilter]  = useState(initParams.insurance);
  const [schedulingFilter, setSchedulingFilter] = useState(initParams.scheduling);
  const [treatFilter,      setTreatFilter]      = useState(initParams.treat);
  const [approachFilter,   setApproachFilter]   = useState(initParams.approach);
  const [genderFilter,     setGenderFilter]     = useState(initParams.gender);
  const [languageFilter,   setLanguageFilter]   = useState(initParams.language);
  const [ageFilter,        setAgeFilter]        = useState(initParams.age);
  const [acceptingNew,     setAcceptingNew]     = useState(initParams.accepting);
  const [search,           setSearch]           = useState(initParams.search);

  // Provider list — fetched from backend (keeps in sync with WordPress via /api/sync-providers)
  const [providers,        setProviders]        = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    fetchProviders()
      .then(data => { setProviders(Array.isArray(data) ? data : []); })
      .catch(() => { setProviders([]); })
      .finally(() => setProvidersLoading(false));
  }, []);

  // Derived filter options — always match whatever WordPress has
  const allWhatWeTreat = useMemo(() => {
    const s = new Set();
    providers.forEach(p => (p.whatWeTreat || []).forEach(w => s.add(w)));
    return [...s].sort();
  }, [providers]);

  const allTreatmentApproach = useMemo(() => {
    const s = new Set();
    providers.forEach(p => (p.treatmentApproach || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [providers]);

  const allLanguages = useMemo(() => {
    const order = ['English', 'Spanish', 'Other'];
    const s = new Set(order);
    providers.forEach(p => (p.languages || []).forEach(l => s.add(l)));
    return [...s].sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [providers]);

  const allInsurance = useMemo(() => {
    const s = new Set();
    providers.forEach(p => (p.insurance || []).forEach(i => s.add(i)));
    return [...s].sort();
  }, [providers]);

  const allServices = useMemo(() => {
    const s = new Set();
    providers.forEach(p => (p.specialties || []).forEach(sv => s.add(sv)));
    return [...s].sort();
  }, [providers]);

  // null = loading, Map<providerId, bool> once resolved
  const [availability,   setAvailability]   = useState(null);
  // { [providerId]: string[] } — all scheduling prefs from scheduling-meta (monthly cache)
  const [schedulingMeta, setSchedulingMeta] = useState({});

  // Responsive search placeholder
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Sync filter state → URL (replaceState so back button isn't polluted)
  useEffect(() => {
    const params = new URLSearchParams();
    const slug = SPECIALTY_TO_SERVICE[serviceFilter] || '';
    if (slug)             params.set('service',    slug);
    if (locationFilter)   params.set('location',   locationFilter);
    if (insuranceFilter)  params.set('insurance',  insuranceFilter);
    if (schedulingFilter) params.set('scheduling', schedulingFilter);
    if (treatFilter)      params.set('treat',      treatFilter);
    if (approachFilter)   params.set('approach',   approachFilter);
    if (genderFilter)     params.set('gender',     genderFilter);
    if (languageFilter)   params.set('language',   languageFilter);
    if (ageFilter)        params.set('age',        ageFilter);
    if (acceptingNew)     params.set('accepting',  '1');
    if (search)           params.set('search',     search);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [serviceFilter, locationFilter, insuranceFilter, schedulingFilter, treatFilter, approachFilter, genderFilter, languageFilter, ageFilter, acceptingNew, search]);

  // Batch availability — fires once providers have loaded.
  useEffect(() => {
    if (providers.length === 0) return;
    const list = providers.map((p) => ({
      providerId:   String(p.athena_provider_id),
      departmentId: String(p.departmentId),
    }));
    fetchBatchAvailability(list)
      .then((data) => {
        const availMap = new Map();
        for (const { providerId, hasSlots } of data.results || []) {
          availMap.set(String(providerId), hasSlots);
        }
        setAvailability(availMap);
      })
      .catch(() => setAvailability(new Map())); // fail open — show all book buttons
  }, [providers]);

  // Scheduling meta — time-of-day preferences, monthly server cache.
  // Returns instantly on cache hit; triggers ~46 Athena calls only on cache miss (~once/month).
  useEffect(() => {
    fetchSchedulingMeta()
      .then((data) => setSchedulingMeta(data.providers || {}))
      .catch(() => {}); // fail silently — filter just won't narrow on time-of-day
  }, []);

  const filtered = useMemo(() => {
    return providers.filter((p) => {
      const pid = String(p.athena_provider_id);

      // Service
      if (serviceFilter && !(p.specialties || []).includes(serviceFilter)) return false;

      // Location
      if (locationFilter === 'telehealth-mn') {
        if (!(p.telehealthLocs || '').includes('Telehealth - MN')) return false;
      } else if (locationFilter === 'telehealth-wi') {
        if (!(p.telehealthLocs || '').includes('Telehealth - WI')) return false;
      } else if (locationFilter) {
        if (p.departmentId !== locationFilter) return false;
      }

      // Insurance
      if (insuranceFilter && !(p.insurance || []).includes(insuranceFilter)) return false;

      // Scheduling preference — all tags sourced from monthly scheduling-meta
      if (schedulingFilter && !(schedulingMeta[pid] || []).includes(schedulingFilter)) return false;

      // What We Treat
      if (treatFilter && !(p.whatWeTreat || []).includes(treatFilter)) return false;

      // Treatment Approach
      if (approachFilter && !(p.treatmentApproach || []).includes(approachFilter)) return false;

      // Gender
      if (genderFilter && p.gender !== genderFilter) return false;

      // Language — "Other" matches any provider who speaks a language besides English
      if (languageFilter === 'Other') {
        if (!(p.languages || []).some((l) => l !== 'English')) return false;
      } else if (languageFilter) {
        if (!(p.languages || []).includes(languageFilter)) return false;
      }

      // Age
      if (ageFilter !== '') {
        const age = Number(ageFilter);
        if (!isNaN(age)) {
          const min = p.minAge != null ? p.minAge : 0;
          const max = p.maxAge != null ? p.maxAge : 100;
          if (age < min || age > max) return false;
        }
      }

      // Accepting New Patients
      if (acceptingNew && !p.acceptingNew) return false;

      // Search — name, title, specialties, what we treat, treatment approach, or location
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          p.name,
          p.provider_title,
          ...(p.specialties || []),
          ...(p.whatWeTreat || []),
          ...(p.treatmentApproach || []),
          DEPT_NAMES[p.departmentId] || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [providers, serviceFilter, locationFilter, insuranceFilter, schedulingFilter, treatFilter, approachFilter, genderFilter, languageFilter, ageFilter, acceptingNew, search, schedulingMeta]);

  const hasFilters = serviceFilter || locationFilter || insuranceFilter || schedulingFilter || treatFilter || approachFilter || genderFilter || languageFilter || ageFilter || acceptingNew || search;

  function clearFilters() {
    setServiceFilter('');
    setLocationFilter('');
    setInsuranceFilter('');
    setSchedulingFilter('');
    setTreatFilter('');
    setApproachFilter('');
    setGenderFilter('');
    setLanguageFilter('');
    setAgeFilter('');
    setAcceptingNew(false);
    setSearch('');
  }

  const locationLabel = locationFilter === 'telehealth-mn'
    ? 'Telehealth - MN'
    : locationFilter === 'telehealth-wi'
    ? 'Telehealth - WI'
    : DEPT_NAMES[locationFilter] || '';

  const schedulingLabel = ALL_SCHEDULING.find((s) => s.value === schedulingFilter)?.label || schedulingFilter;

  return (
    <div className="vpd-root">
      {/* Header — same markup as booking flow */}
      <header className="vbf-header">
        <div className="vbf-header-inner">
          <a href="https://vantagementalhealth.org" className="vbf-logo-link">
            <img src={logoSrc} alt="Vantage Mental Health" className="vbf-logo-img" />
          </a>
          <span className="vbf-header-phone">
            Questions? <a href="tel:6512171480">(651) 217-1480</a>
          </span>
          <a
            href="tel:6512171480"
            className="vbf-header-phone-btn"
            aria-label="Call us at (651) 217-1480"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 5.5C3 14.0604 9.93959 21 18.5 21C18.8862 21 19.2691 20.9859 19.6483 20.9581C20.0834 20.9262 20.3009 20.9103 20.499 20.7963C20.663 20.7019 20.8185 20.5345 20.9007 20.364C21 20.1582 21 19.9181 21 19.438V16.6207C21 16.2169 21 16.015 20.9335 15.842C20.8749 15.6891 20.7795 15.553 20.6559 15.4456C20.516 15.324 20.3262 15.255 19.9468 15.117L16.74 13.9509C16.2985 13.7904 16.0777 13.7101 15.8683 13.7237C15.6836 13.7357 15.5059 13.7988 15.3549 13.9058C15.1837 14.0271 15.0629 14.2285 14.8212 14.6314L14 16C11.3501 14.7999 9.2019 12.6489 8 10L9.36863 9.17882C9.77145 8.93713 9.97286 8.81628 10.0942 8.64506C10.2012 8.49408 10.2643 8.31637 10.2763 8.1317C10.2899 7.92227 10.2096 7.70153 10.0491 7.26005L8.88299 4.05321C8.745 3.67376 8.67601 3.48403 8.55442 3.3441C8.44701 3.22049 8.31089 3.12515 8.15802 3.06645C7.98496 3 7.78308 3 7.37932 3H4.56201C4.08188 3 3.84181 3 3.63598 3.09925C3.4655 3.18146 3.29814 3.33701 3.2037 3.50103C3.08968 3.69907 3.07375 3.91662 3.04189 4.35173C3.01413 4.73086 3 5.11378 3 5.5Z" stroke="#131313" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </header>

      <main className="vpd-page" aria-label="Provider directory">
        <div className="vpd-page-header">
          <h1 className="vpd-page-title">Book an Appointment</h1>
          <p className="vpd-page-subtitle">
            Choose a provider below to get started. Not sure who to see?{' '}
            Call <a href="tel:6512171480">(651) 217-1480</a> and we'll help.
          </p>
        </div>

        {/* Filters */}
        <div className="vpd-filters">
          {/* Search */}
          <div className="vpd-search-row">
            {isMobile && (
              <p className="vpd-search-mobile-label">
                Find your Provider by searching for a Condition, Service, Treatment, Provider Name, or Practice Location.
              </p>
            )}
            <input
              id="vpd-search"
              name="search"
              type="search"
              className="vpd-search"
              placeholder={isMobile ? 'Search..' : 'Enter a Condition, Service, Treatment, Provider Name, or Practice Location'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search providers"
            />
          </div>

          {/* Row 1: Accepting New | Patient Age */}
          <div className="vpd-filter-row">
            <label className="vpd-telehealth-label">
              <input
                id="vpd-accepting-new"
                name="acceptingNew"
                type="checkbox"
                className="vpd-telehealth-check"
                checked={acceptingNew}
                onChange={(e) => setAcceptingNew(e.target.checked)}
              />
              <span>Accepting New Patients</span>
            </label>

            <div className="vpd-age-wrap">
              <label className="vpd-age-label" htmlFor="vpd-age-input">Patients age</label>
              <input
                id="vpd-age-input"
                type="number"
                className="vpd-age-input"
                placeholder="Patients age in years"
                min="0"
                max="120"
                value={ageFilter}
                onChange={(e) => setAgeFilter(e.target.value)}
                aria-label="Filter by patient age"
              />
            </div>
          </div>

          {/* Row 2: Service | Location */}
          <div className="vpd-filter-row">
            <select
              id="vpd-filter-service"
              name="serviceFilter"
              className="vpd-select"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              aria-label="Filter by service"
            >
              <option value="">All Services</option>
              {allServices.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              id="vpd-filter-location"
              name="locationFilter"
              className="vpd-select"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label="Filter by location"
            >
              <option value="">All Locations</option>
              <option value="1">Stillwater</option>
              <option value="8">Edina</option>
              <option value="5">St. Anthony</option>
              <option value="telehealth-mn">Telehealth - MN</option>
              <option value="telehealth-wi">Telehealth - WI</option>
            </select>
          </div>

          {/* Row 3: Insurance | Scheduling Preference */}
          <div className="vpd-filter-row">
            <select
              id="vpd-filter-insurance"
              name="insuranceFilter"
              className="vpd-select"
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
              aria-label="Filter by insurance"
            >
              <option value="">All Insurance</option>
              {allInsurance.map((ins) => (
                <option key={ins} value={ins}>{ins}</option>
              ))}
            </select>

            <select
              id="vpd-filter-scheduling"
              name="schedulingFilter"
              className="vpd-select"
              value={schedulingFilter}
              onChange={(e) => setSchedulingFilter(e.target.value)}
              aria-label="Filter by scheduling preference"
            >
              <option value="">Scheduling Preference</option>
              {ALL_SCHEDULING.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Row 4: What We Treat | Treatment Approach */}
          <div className="vpd-filter-row">
            <select
              id="vpd-filter-treat"
              name="treatFilter"
              className="vpd-select"
              value={treatFilter}
              onChange={(e) => setTreatFilter(e.target.value)}
              aria-label="Filter by what we treat"
            >
              <option value="">What We Treat</option>
              {allWhatWeTreat.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              id="vpd-filter-approach"
              name="approachFilter"
              className="vpd-select"
              value={approachFilter}
              onChange={(e) => setApproachFilter(e.target.value)}
              aria-label="Filter by modalities"
            >
              <option value="">Modalities</option>
              {allTreatmentApproach.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Row 5: Gender | Language */}
          <div className="vpd-filter-row">
            <select
              id="vpd-filter-gender"
              name="genderFilter"
              className="vpd-select"
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              aria-label="Filter by gender"
            >
              <option value="">Any Gender</option>
              {ALL_GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            <select
              id="vpd-filter-language"
              name="languageFilter"
              className="vpd-select"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="">Any Language</option>
              {allLanguages.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="vpd-active-filters">
              {serviceFilter    && <span className="vpd-chip">{serviceFilter}    <button onClick={() => setServiceFilter('')}    aria-label="Remove">×</button></span>}
              {locationFilter   && <span className="vpd-chip">{locationLabel}    <button onClick={() => setLocationFilter('')}   aria-label="Remove">×</button></span>}
              {insuranceFilter  && <span className="vpd-chip">{insuranceFilter}  <button onClick={() => setInsuranceFilter('')}  aria-label="Remove">×</button></span>}
              {schedulingFilter && <span className="vpd-chip">{schedulingLabel}  <button onClick={() => setSchedulingFilter('')} aria-label="Remove">×</button></span>}
              {treatFilter      && <span className="vpd-chip">{treatFilter}      <button onClick={() => setTreatFilter('')}      aria-label="Remove">×</button></span>}
              {approachFilter   && <span className="vpd-chip">{approachFilter}   <button onClick={() => setApproachFilter('')}   aria-label="Remove">×</button></span>}
              {genderFilter     && <span className="vpd-chip">{genderFilter}     <button onClick={() => setGenderFilter('')}     aria-label="Remove">×</button></span>}
              {languageFilter   && <span className="vpd-chip">{languageFilter}   <button onClick={() => setLanguageFilter('')}   aria-label="Remove">×</button></span>}
              {ageFilter        && <span className="vpd-chip">Age: {ageFilter}   <button onClick={() => setAgeFilter('')}        aria-label="Remove">×</button></span>}
              {acceptingNew     && <span className="vpd-chip">Accepting New Patients <button onClick={() => setAcceptingNew(false)} aria-label="Remove">×</button></span>}
              {search           && <span className="vpd-chip">"{search}" <button onClick={() => setSearch('')} aria-label="Remove">×</button></span>}
              <button className="vpd-clear-btn" onClick={clearFilters}>Clear all</button>
            </div>
          )}
        </div>

        {/* Result count */}
        {!providersLoading && (
          <div className="vpd-result-count">
            {filtered.length} provider{filtered.length !== 1 ? 's' : ''} found
          </div>
        )}

        {/* Grid */}
        {providersLoading ? (
          <div className="vpd-empty">Loading providers…</div>
        ) : filtered.length === 0 ? (
          <div className="vpd-empty">
            No providers match your filters.{' '}
            <button className="vpd-clear-link" onClick={clearFilters}>Clear filters</button>{' '}
            or call <a href="tel:6512171480">(651) 217-1480</a> for help.
          </div>
        ) : (
          <div className="vpd-grid">
            {filtered.map((p) => (
              <ProviderCard
                key={p.athena_provider_id}
                provider={p}
                availabilityLoading={availability === null}
                hasSlots={availability?.get(String(p.athena_provider_id))}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="vbf-footer">
        <p>Copyright &copy; 2026. Vantage Mental Health. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
