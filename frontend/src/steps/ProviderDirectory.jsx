import React, { useState, useMemo } from 'react';
import providers from '../data/provider-contacts.json';
import logoSrc from '../assets/logo.png';

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://booking-frontend-717838047212.us-central1.run.app/';

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

const ALL_SERVICES = [
  'Psychiatric Medication Management',
  'Mental Health Therapy',
  'Family Therapy',
  'Couples Therapy',
  'Child Therapy',
  'Teen Therapy',
  'Transcranial Magnetic Stimulation',
  'ADHD Evaluation',
  'Psychopharmacologic Testing',
];

const ALL_INSURANCE = [
  'Aetna',
  'Americas PPO',
  'Blue Cross Blue Shield',
  'Cigna',
  'HealthPartners',
  'Medica',
  'Medicaid',
  'Medicare',
  'Optum',
  'UCare',
  'United Healthcare',
  'United Behavioral Health',
  'Tricare',
  'Other Commercial Insurance',
  'Self-Pay',
];

const ALL_WHAT_WE_TREAT = [
  'Anxiety and Worry',
  'Depression and Low Mood',
  'Trauma and PTSD',
  'ADHD',
  'Relationship and Couples Issues',
  'Family Conflict and Parenting Support',
  'Grief and Loss',
  'Life Transitions and Stress',
  'Substance Use and Addiction',
  'OCD (Obsessive Compulsive Disorder)',
  'Bipolar Disorder',
  'Autism Spectrum and Neurodivergence',
  'Personality Disorders',
  'Eating and Body Image',
  'Sleep and Insomnia',
  'Self-Esteem and Identity',
  'Anger Management',
  'Perinatal and Maternal Mental Health',
  'LGBTQ+',
  "Men's Mental Health",
  "Women's Mental Health",
  'Chronic Illness',
];

const ALL_TREATMENT_APPROACH = [
  'CBT (Cognitive Behavioral Therapy)',
  'DBT (Dialectical Behavior Therapy)',
  'EMDR and ART',
  'Play Therapy',
  'Brainspotting',
  'Parenting Therapy',
  'Executive Function Coaching',
  'Exposure Therapy',
  'Art Therapy',
  'IFS (Internal Family Systems)',
];

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
  const service = SPECIALTY_TO_SERVICE[provider.specialties[0]] || '';
  const params = new URLSearchParams({
    providerId:     provider.athena_provider_id,
    providerName:   provider.name,
    departmentId:   provider.departmentId,
    service,
    telehealthLocs: provider.telehealthLocs || '',
  });
  return BASE_URL + '?' + params.toString();
}

// ── ProviderCard ─────────────────────────────────────────────────────────────

function ProviderCard({ provider }) {
  const [imgError, setImgError] = useState(false);
  const locationName = DEPT_NAMES[provider.departmentId] || '';
  const tags = (provider.specialties || []).slice(0, 3);

  return (
    <div className="vpd-card">
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

      <div className="vpd-card-body">
        <div className="vpd-card-name">{provider.name}</div>
        <div className="vpd-card-title">{provider.provider_title}</div>
        {locationName && (
          <div className="vpd-card-location">{locationName}</div>
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
        <a
          href={buildBookingUrl(provider)}
          className="vbf-btn vbf-btn--primary vpd-book-btn"
        >
          Book Appointment
        </a>
      </div>
    </div>
  );
}

// ── ProviderDirectory ────────────────────────────────────────────────────────

export default function ProviderDirectory() {
  const [serviceFilter,   setServiceFilter]   = useState('');
  const [locationFilter,  setLocationFilter]  = useState('');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [treatFilter,     setTreatFilter]     = useState('');
  const [approachFilter,  setApproachFilter]  = useState('');
  const [acceptingNew,    setAcceptingNew]    = useState(false);
  const [search,          setSearch]          = useState('');

  const filtered = useMemo(() => {
    return providers.filter((p) => {
      // Service
      if (serviceFilter && !(p.specialties || []).includes(serviceFilter)) return false;

      // Location — "telehealth" is a virtual location option
      if (locationFilter === 'telehealth') {
        if (!(p.telehealthLocs || '').includes('telehealth - mn')) return false;
      } else if (locationFilter) {
        if (p.departmentId !== locationFilter) return false;
      }

      // Insurance
      if (insuranceFilter && !(p.insurance || []).includes(insuranceFilter)) return false;

      // What We Treat
      if (treatFilter && !(p.whatWeTreat || []).includes(treatFilter)) return false;

      // Treatment Approach
      if (approachFilter && !(p.treatmentApproach || []).includes(approachFilter)) return false;

      // Accepting New Patients
      if (acceptingNew && !p.acceptingNew) return false;

      // Search — name, title, or specialties
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${p.name} ${p.provider_title} ${(p.specialties || []).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [serviceFilter, locationFilter, insuranceFilter, treatFilter, approachFilter, acceptingNew, search]);

  const hasFilters = serviceFilter || locationFilter || insuranceFilter || treatFilter || approachFilter || acceptingNew || search;

  function clearFilters() {
    setServiceFilter('');
    setLocationFilter('');
    setInsuranceFilter('');
    setTreatFilter('');
    setApproachFilter('');
    setAcceptingNew(false);
    setSearch('');
  }

  const locationLabel = locationFilter === 'telehealth'
    ? 'Telehealth'
    : DEPT_NAMES[locationFilter] || '';

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
        </div>
      </header>

      <div className="vpd-page">
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
            <input
              type="search"
              className="vpd-search"
              placeholder="Search by name or specialty…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search providers"
            />
          </div>

          {/* Row 1: Service | Location | Insurance */}
          <div className="vpd-filter-row">
            <select
              className="vpd-select"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              aria-label="Filter by service"
            >
              <option value="">All Services</option>
              {ALL_SERVICES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              className="vpd-select"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label="Filter by location"
            >
              <option value="">All Locations</option>
              <option value="1">Stillwater</option>
              <option value="8">Edina</option>
              <option value="5">St. Anthony</option>
              <option value="telehealth">Telehealth / Virtual</option>
            </select>

            <select
              className="vpd-select"
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
              aria-label="Filter by insurance"
            >
              <option value="">All Insurance</option>
              {ALL_INSURANCE.map((ins) => (
                <option key={ins} value={ins}>{ins}</option>
              ))}
            </select>
          </div>

          {/* Row 2: What We Treat | Treatment Approach | Accepting New checkbox */}
          <div className="vpd-filter-row">
            <select
              className="vpd-select"
              value={treatFilter}
              onChange={(e) => setTreatFilter(e.target.value)}
              aria-label="Filter by what we treat"
            >
              <option value="">What We Treat</option>
              {ALL_WHAT_WE_TREAT.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              className="vpd-select"
              value={approachFilter}
              onChange={(e) => setApproachFilter(e.target.value)}
              aria-label="Filter by treatment approach"
            >
              <option value="">Treatment Approach</option>
              {ALL_TREATMENT_APPROACH.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <label className="vpd-telehealth-label">
              <input
                type="checkbox"
                className="vpd-telehealth-check"
                checked={acceptingNew}
                onChange={(e) => setAcceptingNew(e.target.checked)}
              />
              <span>Accepting New Patients</span>
            </label>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="vpd-active-filters">
              {serviceFilter   && <span className="vpd-chip">{serviceFilter}   <button onClick={() => setServiceFilter('')}   aria-label="Remove">×</button></span>}
              {locationFilter  && <span className="vpd-chip">{locationLabel}   <button onClick={() => setLocationFilter('')}  aria-label="Remove">×</button></span>}
              {insuranceFilter && <span className="vpd-chip">{insuranceFilter} <button onClick={() => setInsuranceFilter('')} aria-label="Remove">×</button></span>}
              {treatFilter     && <span className="vpd-chip">{treatFilter}     <button onClick={() => setTreatFilter('')}     aria-label="Remove">×</button></span>}
              {approachFilter  && <span className="vpd-chip">{approachFilter}  <button onClick={() => setApproachFilter('')}  aria-label="Remove">×</button></span>}
              {acceptingNew    && <span className="vpd-chip">Accepting New Patients <button onClick={() => setAcceptingNew(false)} aria-label="Remove">×</button></span>}
              {search          && <span className="vpd-chip">"{search}" <button onClick={() => setSearch('')} aria-label="Remove">×</button></span>}
              <button className="vpd-clear-btn" onClick={clearFilters}>Clear all</button>
            </div>
          )}
        </div>

        {/* Result count */}
        <div className="vpd-result-count">
          {filtered.length} provider{filtered.length !== 1 ? 's' : ''} found
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="vpd-empty">
            No providers match your filters.{' '}
            <button className="vpd-clear-link" onClick={clearFilters}>Clear filters</button>{' '}
            or call <a href="tel:6512171480">(651) 217-1480</a> for help.
          </div>
        ) : (
          <div className="vpd-grid">
            {filtered.map((p) => (
              <ProviderCard key={p.athena_provider_id} provider={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
