document.addEventListener('DOMContentLoaded', function () {

  // ── Insurance map ─────────────────────────────────────
  var insuranceMap = {
    'aetna':             ['aetna'],
    'americas-ppo':      ["america's ppo", 'americas ppo'],
    'bcbs':              ['blue cross blue shield'],
    'cigna':             ['cigna'],
    'healthpartners':    ['healthpartners', 'health partners'],
    'medica':            ['medica'],
    'medicaid':          ['medicaid'],
    'medicare':          ['medicare'],
    'optum':             ['optum'],
    'ucare':             ['ucare'],
    'united-behavioral': ['united behavioral health'],
    'united-healthcare': ['united healthcare'],
    'tricare':           ['tricare'],
    'other':             [],
    'self-pay':          []
  };

  var serviceLabels = {
    'psychiatry':         'psychiatric medication management',
    'therapy-individual': 'mental health therapy',
    'therapy-family':     'family therapy',
    'therapy-couples':    'couples therapy',
    'therapy-child':      'child therapy',
    'therapy-teen':       'teen therapy',
    'therapy-group':      'group therapy',
    'tms':                'transcranial magnetic stimulation',
    'adhd':               'adhd evaluation',
    'psych-testing':      'psychopharmacologic testing'
  };

  // ── Age helpers ───────────────────────────────────────
  function calculateAge(dob) {
    var today     = new Date();
    var birthDate = new Date(dob);
    var age = today.getFullYear() - birthDate.getFullYear();
    var m   = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }

  // ── DOB validation ────────────────────────────────────
  function validateDob(value) {
    if (!value || value.trim() === '') return 'Please enter your date of birth.';
    // Only validate once we have a complete YYYY-MM-DD value (4-digit year)
    var parts = value.split('-');
    if (parts.length !== 3 || parts[0].length !== 4) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return 'Please enter a valid date of birth.';
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d > today) return 'Date of birth cannot be in the future.';
    if (d.getFullYear() < 1900) return 'Please enter a valid date of birth.';
    return null;
  }

  // ── Insurance check ───────────────────────────────────
  function checkInsuranceMatch(selected, raw) {
    if (!selected || selected === 'self-pay' || selected === 'other') return true;
    if (!raw || !raw.trim()) return true;
    var stored   = raw.toLowerCase();
    var keywords = insuranceMap[selected] || [];
    return keywords.some(function (kw) { return stored.includes(kw); });
  }

  // ── Service check ─────────────────────────────────────
  function checkServiceMatch(selectedService, servicesRaw) {
    if (!selectedService) return true;
    if (!servicesRaw || !servicesRaw.trim()) return true;
    var offered = servicesRaw.toLowerCase().split(',').map(function (s) { return s.trim(); });
    return offered.indexOf(selectedService.toLowerCase()) !== -1;
  }

  // ── Parse telehealth locations ────────────────────────
  function parseTelehealthLocs(telehealthLocsRaw) {
    var locs = (telehealthLocsRaw || '').toLowerCase().split(',').map(function (s) { return s.trim(); });
    return {
      hasMN: locs.some(function (l) { return l.indexOf('telehealth - mn') !== -1; }),
      hasWI: locs.some(function (l) { return l.indexOf('telehealth - wi') !== -1; })
    };
  }

  // ── Telehealth state check ────────────────────────────
  function checkTelehealthState(patientState, telehealthLocsRaw) {
    var locs = parseTelehealthLocs(telehealthLocsRaw);
    if (patientState === 'mn') {
      return locs.hasMN ? 'ok' : 'no_mn';
    }
    if (locs.hasWI) {
      return 'no_coverage';
    }
    return 'no_wi';
  }

  // ── Update telehealth state question label ────────────
  function updateTelehealthQuestion(telehealthLocsRaw) {
    var labelEl    = document.querySelector('#vb-telehealth-state-field > label');
    var yesLabelEl = document.querySelector('#vb-telehealth-state-field .vantage-radio-group label:first-child');
    var noLabelEl  = document.querySelector('#vb-telehealth-state-field .vantage-radio-group label:last-child');

    if (!labelEl || !yesLabelEl || !noLabelEl) return;

    var locs = parseTelehealthLocs(telehealthLocsRaw);

    if (locs.hasWI) {
      labelEl.innerHTML    = 'Will you be in the state of Minnesota or Wisconsin during your appointment? <span>*</span>';
      yesLabelEl.innerHTML = '<input type="radio" name="telehealth_state" value="mn"> Yes \u2014 I will be in Minnesota or Wisconsin';
      noLabelEl.innerHTML  = '<input type="radio" name="telehealth_state" value="other"> No \u2014 I will be outside Minnesota and Wisconsin';
    } else {
      labelEl.innerHTML    = 'Will you be in the state of Minnesota during your appointment? <span>*</span>';
      yesLabelEl.innerHTML = '<input type="radio" name="telehealth_state" value="mn"> Yes \u2014 I will be in Minnesota';
      noLabelEl.innerHTML  = '<input type="radio" name="telehealth_state" value="other"> No \u2014 I will be outside Minnesota';
    }
  }

  // ── Reusable providers page link ──────────────────────
  var providersLink = '<a href="/providers/" style="color:inherit;font-weight:bold;">providers page</a>';

  // ── Read provider data from .provider-data div ────────
  function getProviderData(card) {
    var el = card.querySelector('.provider-data');
    if (!el) return null;
    return {
      providerId:     el.dataset.providerId     || '',
      departmentId:   el.dataset.departmentId   || '',
      locationId:     el.dataset.locationId     || '',
      practitionerId: el.dataset.practitionerId || '',
      minAge:         el.dataset.minAge         || '0',
      maxAge:         el.dataset.maxAge         || '100',
      insurances:     el.dataset.insurances     || '',
      services:       el.dataset.services       || '',
      telehealthLocs: el.dataset.telehealthLocs || '',
      providerName:   el.dataset.providerName   || ''
    };
  }

  // ── Wire Book Now button ──────────────────────────────
  function wireAllButtons() {
    document.querySelectorAll('.jet-listing-grid__item').forEach(function (card) {
      var cardData = getProviderData(card);
      if (!cardData || !cardData.providerId || !cardData.locationId) return;

      var btnWrapper = card.querySelector('.book-now-btn');
      if (!btnWrapper) return;

      var anchor = btnWrapper.querySelector('a');
      if (anchor) {
        anchor.href = '#';
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      }

      var targets = [btnWrapper];
      if (anchor) targets.push(anchor);

      targets.forEach(function (el) {
        el.dataset.providerId     = cardData.providerId;
        el.dataset.departmentId   = cardData.departmentId;
        el.dataset.locationId     = cardData.locationId;
        el.dataset.practitionerId = cardData.practitionerId;
        el.dataset.minAge         = cardData.minAge;
        el.dataset.maxAge         = cardData.maxAge;
        el.dataset.insurances     = cardData.insurances;
        el.dataset.services       = cardData.services;
        el.dataset.telehealthLocs = cardData.telehealthLocs;
        el.dataset.providerName   = cardData.providerName;
      });
    });
  }

  // ── Modal elements ────────────────────────────────────
  var modal                = document.getElementById('vantage-booking-modal');
  var msgEl                = document.getElementById('vantage-modal-msg');
  var overlay              = document.getElementById('vantage-modal-overlay');
  var closeBtn             = document.getElementById('vantage-modal-close');
  var form                 = document.getElementById('vantage-booking-form');
  var telehealthStateField = document.getElementById('vb-telehealth-state-field');

  // ── DOB inline error element ──────────────────────────
  // Injected directly after the DOB input
  var dobInput = document.getElementById('vb-dob');
  var dobError = document.createElement('div');
  dobError.id            = 'vb-dob-error';
  dobError.className     = 'vb-field-error';
  dobError.style.cssText = 'display:none;color:#c0392b;font-size:13px;margin-top:4px;';
  if (dobInput) dobInput.insertAdjacentElement('afterend', dobError);

  function showDobError(msg) {
    dobError.textContent   = msg;
    dobError.style.display = 'block';
    if (dobInput) dobInput.style.outline = '2px solid #c0392b';
  }

  function clearDobError() {
    dobError.textContent   = '';
    dobError.style.display = 'none';
    if (dobInput) dobInput.style.outline = '';
  }

  // Use 'change' not 'blur' — date inputs fire blur mid-picker interaction
  // 'change' only fires once the user has fully committed a value
  if (dobInput) {
    dobInput.addEventListener('change', function () {
      var val = this.value;
      // Only show error when field has a complete value
      if (!val) { clearDobError(); return; }
      var err = validateDob(val);
      if (err) showDobError(err);
      else clearDobError();
    });
  }

  // ── Open / close / reset ──────────────────────────────
  function openModal() {
    if (!modal) return;
    modal.classList.add('vantage-open');
    document.body.style.overflow = 'hidden';
    clearMsg();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('vantage-open');
    document.body.style.overflow = '';
    clearMsg();
    resetForm();
  }

  function resetForm() {
    if (!form) return;

    // Clear all inputs and selects
    form.querySelectorAll('input[type="date"], select').forEach(function (el) {
      el.value = '';
    });
    form.querySelectorAll('input[type="radio"]').forEach(function (el) {
      el.checked = false;
    });

    // Clear DOB inline error
    clearDobError();

    // Hide telehealth state question
    if (telehealthStateField) telehealthStateField.style.display = 'none';

    // Clear hidden provider fields
    ['vb-provider-id', 'vb-department-id', 'vb-location-id',
     'vb-practitioner-id', 'vb-min-age', 'vb-max-age',
     'vb-insurances', 'vb-services',
     'vb-telehealth-locs', 'vb-provider-name'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function showMsg(text, type) {
    if (!msgEl) return;
    msgEl.innerHTML     = text;
    msgEl.className     = 'msg-' + type;
    msgEl.style.display = 'block';
  }

  function clearMsg() {
    if (!msgEl) return;
    msgEl.innerHTML     = '';
    msgEl.style.display = 'none';
    msgEl.className     = '';
    var cont = document.querySelector('.vantage-continue-btn');
    if (cont) cont.remove();
  }

  function addContinueBtn(cb) {
    var existing = document.querySelector('.vantage-continue-btn');
    if (existing) existing.remove();
    var btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'vantage-continue-btn';
    btn.textContent = 'Continue anyway';
    btn.addEventListener('click', function () { clearMsg(); cb(); });
    msgEl.insertAdjacentElement('afterend', btn);
  }

  function fillHiddenFields(data) {
    var set = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('vb-provider-id',     data.providerId);
    set('vb-department-id',   data.departmentId);
    set('vb-location-id',     data.locationId);
    set('vb-practitioner-id', data.practitionerId);
    set('vb-min-age',         data.minAge);
    set('vb-max-age',         data.maxAge);
    set('vb-insurances',      data.insurances);
    set('vb-services',        data.services);
    set('vb-telehealth-locs', data.telehealthLocs);
    set('vb-provider-name',   data.providerName);
  }

  // ── Show/hide + update telehealth question on visit type change ──
  if (form) {
    form.addEventListener('change', function (e) {
      if (e.target.name !== 'visit_type') return;
      if (!telehealthStateField) return;

      if (e.target.value === 'telehealth') {
        var telehealthLocs = (document.getElementById('vb-telehealth-locs') || {}).value || '';
        updateTelehealthQuestion(telehealthLocs);
        telehealthStateField.style.display = 'block';
      } else {
        telehealthStateField.style.display = 'none';
        form.querySelectorAll('[name="telehealth_state"]').forEach(function (r) {
          r.checked = false;
        });
      }
    });
  }

  // ── Close handlers ────────────────────────────────────
  if (overlay)  overlay.addEventListener('click',  closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // ── Slot date column click → open booking modal ───────
  document.addEventListener('click', function (e) {
    var dateCol = e.target.closest('.slots-date-col');
    if (!dateCol) return;
    e.preventDefault();
    e.stopPropagation();

    var card = dateCol.closest('.jet-listing-grid__item');
    if (!card) return;

    var cardData = getProviderData(card);
    if (!cardData || !cardData.providerId || !cardData.locationId) return;

    fillHiddenFields(cardData);
    openModal();
  });

  // ── Book Now click ────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btnWrapper = e.target.closest('.book-now-btn');
    if (!btnWrapper) return;
    e.preventDefault();
    e.stopPropagation();

    var src = btnWrapper;
    if (!src.dataset.providerId) {
      src = btnWrapper.querySelector('a') || btnWrapper;
    }

    var providerId = src.dataset.providerId;
    var locationId = src.dataset.locationId;

    if (!providerId || !locationId) {
      var card = btnWrapper.closest('.jet-listing-grid__item');
      if (card) {
        var cardData = getProviderData(card);
        if (cardData && cardData.providerId && cardData.locationId) {
          fillHiddenFields(cardData);
          openModal();
          return;
        }
      }
      alert('Provider information is missing. Please try again.');
      return;
    }

    fillHiddenFields({
      providerId:     src.dataset.providerId,
      departmentId:   src.dataset.departmentId,
      locationId:     src.dataset.locationId,
      practitionerId: src.dataset.practitionerId || '',
      minAge:         src.dataset.minAge         || '0',
      maxAge:         src.dataset.maxAge         || '100',
      insurances:     src.dataset.insurances     || '',
      services:       src.dataset.services       || '',
      telehealthLocs: src.dataset.telehealthLocs || '',
      providerName:   src.dataset.providerName   || ''
    });
    openModal();
  });

  // ── Form submit ───────────────────────────────────────
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearMsg();

      var dob               = form.querySelector('[name="dob"]').value;
      var patientTypeEl     = form.querySelector('[name="patient_type"]:checked');
      var patientType       = patientTypeEl ? patientTypeEl.value : '';
      var service           = form.querySelector('[name="service_type"]').value;
      var visitTypeEl       = form.querySelector('[name="visit_type"]:checked');
      var visitType         = visitTypeEl ? visitTypeEl.value : '';
      var telehealthStateEl = form.querySelector('[name="telehealth_state"]:checked');
      var telehealthState   = telehealthStateEl ? telehealthStateEl.value : '';
      var insurance         = form.querySelector('[name="insurance"]').value;
      var locationId        = form.querySelector('[name="location_id"]').value;
      var practitionerId    = form.querySelector('[name="practitioner_id"]').value;
      var insurancesRaw     = form.querySelector('[name="provider_insurances"]').value;
      var servicesRaw       = form.querySelector('[name="provider_services"]').value;
      var telehealthLocs    = form.querySelector('[name="provider_telehealth_locs"]').value;
      var providerName      = form.querySelector('[name="provider_name"]').value;

      var providerMinAge = parseInt(form.querySelector('[name="provider_min_age"]').value || '0',   10);
      var providerMaxAge = parseInt(form.querySelector('[name="provider_max_age"]').value || '100', 10);

      // ── DOB validation (also catches anything missed inline) ──
      var dobErr = validateDob(dob);
      if (dobErr) {
        showDobError(dobErr);
        showMsg(dobErr, 'error');
        return;
      }
      clearDobError();

      // ── Other required fields ──────────────────────────
      if (!patientType) { showMsg('Please select new or returning patient.', 'error'); return; }
      if (!service)     { showMsg('Please select a service.', 'error'); return; }
      if (!visitType)   { showMsg('Please select in-person or telehealth.', 'error'); return; }
      if (!insurance)   { showMsg('Please select your insurance.', 'error'); return; }
      if (!locationId)  { showMsg('Provider data missing. Please close and try again.', 'error'); return; }

      // ── Telehealth state required when telehealth selected ──
      if (visitType === 'telehealth' && !telehealthState) {
        showMsg('Please let us know which state you will be in during your appointment.', 'error');
        return;
      }

      // ── Age range validation ───────────────────────────
      var age = calculateAge(dob);

      if (age < providerMinAge || age > providerMaxAge) {
        var maxDisplay = providerMaxAge >= 100 ? '100+' : String(providerMaxAge);
        showMsg(
          'This provider sees patients aged ' + providerMinAge + ' to ' + maxDisplay + '. ' +
          'Based on your date of birth you are ' + age + ' years old, which is outside this range. ' +
          'You can use the filters on our ' + providersLink + ' to find a provider that matches your needs, or call us for assistance.',
          'error'
        );
        return;
      }

      // ── Service validation ─────────────────────────────
      if (servicesRaw && servicesRaw.trim() && service) {
        if (!checkServiceMatch(service, servicesRaw)) {
          var serviceSelect       = form.querySelector('[name="service_type"]');
          var selectedOption      = serviceSelect.options[serviceSelect.selectedIndex];
          var selectedDisplayName = selectedOption ? selectedOption.text : service;
          showMsg(
            'This provider does not offer ' + selectedDisplayName + '. ' +
            'You can use the filters on our ' + providersLink + ' to find a provider that offers this service.',
            'error'
          );
          return;
        }
      }

      // ── In-person only services ────────────────────────
      if (service === 'tms' && visitType === 'telehealth') {
        showMsg(
          'TMS is only available in-person. Please select In-Person, or use the filters on our ' + providersLink + ' to find a provider that matches your needs.',
          'error'
        );
        return;
      }
      if (service === 'psych-testing' && visitType === 'telehealth') {
        showMsg(
          'Psychopharmacologic Testing is only available in-person. Please select In-Person, or use the filters on our ' + providersLink + ' to find a provider that matches your needs.',
          'error'
        );
        return;
      }

      // ── Telehealth state validation ────────────────────
      if (visitType === 'telehealth' && telehealthLocs) {
        var stateResult = checkTelehealthState(telehealthState, telehealthLocs);
        var name        = providerName || 'This provider';

        if (stateResult === 'no_wi') {
          showMsg(
            "We're sorry, " + name + " does not offer virtual care for patients outside of Minnesota. " +
            "We have providers licensed in both Minnesota and Wisconsin. " +
            "You can use the filters on our " + providersLink + " to find a provider that matches your needs.",
            'error'
          );
          return;
        }

        if (stateResult === 'no_coverage') {
          showMsg(
            "We're sorry, " + name + " does not offer virtual care for patients outside of Minnesota or Wisconsin. " +
            "We only have providers licensed in the states of Minnesota and Wisconsin, and you need to be in one of those states during your visit. " +
            "You can use the filters on our " + providersLink + " to find a provider licensed in Minnesota or Wisconsin.",
            'error'
          );
          return;
        }

        if (stateResult === 'no_mn') {
          showMsg(
            "We're sorry, " + name + " does not currently offer virtual care in Minnesota. " +
            "You can use the filters on our " + providersLink + " to find a provider that matches your needs, or call us for assistance.",
            'error'
          );
          return;
        }
      }

      // ── Insurance soft warning ─────────────────────────
      if (!checkInsuranceMatch(insurance, insurancesRaw)) {
        showMsg(
          'This provider may not be in-network for your insurance. You can still proceed, ' +
          'but we recommend calling to verify coverage first.',
          'warning'
        );
        addContinueBtn(function () {
          closeModal();
          redirect(locationId, practitionerId);
        });
        return;
      }

      closeModal();
      redirect(locationId, practitionerId);
    });
  }

  // ── Redirect ──────────────────────────────────────────
  function redirect(locationId, practitionerId) {
    var bookingPage = '/book/';
    var form   = document.getElementById('vantage-booking-form');
    var getVal = function (name) {
      var el = form ? form.querySelector('[name="' + name + '"]') : null;
      return el ? (el.value || '') : '';
    };
    var getChecked = function (name) {
      var el = form ? form.querySelector('[name="' + name + '"]:checked') : null;
      return el ? el.value : '';
    };
    var params = new URLSearchParams({
      locationId:      locationId     || '',
      practitionerId:  practitionerId || locationId || '',
      departmentId:    getVal('department_id'),
      providerId:      getVal('provider_id'),
      dob:             getVal('dob'),
      patientType:     getChecked('patient_type'),
      service:         getVal('service_type'),
      visitType:       getChecked('visit_type'),
      telehealthState: getChecked('telehealth_state'),
      insurance:       getVal('insurance'),
      providerName:    getVal('provider_name'),
      minAge:          getVal('provider_min_age'),
      maxAge:          getVal('provider_max_age'),
      telehealthLocs:  getVal('provider_telehealth_locs'),
    });
    window.location.href = bookingPage + '?' + params.toString();
  }

  // ── Wire buttons on page load ─────────────────────────
  wireAllButtons();

  // ── Re-wire after AJAX filter/search ─────────────────
  var grid = document.querySelector('.jet-listing-grid');
  if (grid) {
    var observer = new MutationObserver(function (mutations) {
      var hasNewNodes = mutations.some(function (m) {
        return m.addedNodes.length > 0;
      });
      if (hasNewNodes) setTimeout(wireAllButtons, 100);
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

});