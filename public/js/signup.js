/* Self-serve sign-up on /get-started/ — Proactive Property Management.
 *
 * The page ships its contact form, as it always has. This script asks the sign-up service whether
 * the flow is open (GET /api/signup/, cached at the edge). Open: the form's place is taken by the
 * flow below (check a property, see the fee on your rent, leave your name). Closed, slow or
 * unreachable: nothing changes and the contact form stays. A visitor with scripts off never sees
 * any of this.
 *
 * NOT the lead path. A lead is created by the sign-up service through lead-intake, the door every
 * form uses; this file never posts to /api/lead/ and the lead scripts are untouched.
 *
 * Three ways in besides a plain visit:
 *   #resume=<token>          the link we email. The token moves to localStorage and leaves the URL.
 *   ?signup_preview=<key>    the preview key: the flow opens for this browser tab while the switch
 *                            is still closed to the public, and what it starts is marked a test.
 *   a token already saved    the visitor comes back in the same browser.
 *
 * Every number shown comes from the service (the signed fee schedule). Nothing here computes a fee.
 * Everything is best-effort: any failure falls back to the contact form and the phone number.
 */
(function () {
  'use strict';

  var API = '/api/signup/';
  var TOKEN_KEY = 'ppm_signup_token';
  var PREVIEW_KEY = 'ppm_signup_preview';
  var TOKEN_RE = /^[0-9a-f]{64}$/;

  // ── pure helpers (exported for tests at the bottom) ─────────────────────────────────────────

  function usd(n) {
    var x = Number(n);
    if (!isFinite(x)) return '';
    var whole = Math.round(x * 100) % 100 === 0;
    return '$' + x.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* "512 Palisade Ave, Union City, NJ 07087" -> "Union City". Only a plain town-shaped part. */
  function townFromAddress(address) {
    var parts = String(address || '').split(',');
    if (parts.length < 2) return '';
    var t = parts[1].trim();
    return /^[A-Za-z][A-Za-z .'-]{1,39}$/.test(t) && !/^(nj|new jersey)$/i.test(t) ? t : '';
  }

  /* Step 1, checked before anything is sent. Returns { field: message } for what is wrong. */
  function checkErrors(v) {
    var e = {};
    var a = String(v.address || '').trim();
    if (a.length < 5 || !/[0-9]/.test(a) || !/[a-z]/i.test(a)) e.address = 'Enter the street address, with its number and town.';
    if (!/^[0-9]{1,4}$/.test(String(v.unit_count || '').trim()) || Number(v.unit_count) < 1) e.unit_count = 'Enter how many rental units the property has.';
    if (!v.property_type) e.property_type = 'Choose the property type.';
    if (!v.occupancy) e.occupancy = 'Tell us whether it is rented now.';
    return e;
  }

  /* Step 2. rents is a list of strings; returns the index of the first bad one, or -1. */
  function firstBadRent(rents) {
    for (var i = 0; i < rents.length; i++) {
      var s = String(rents[i] == null ? '' : rents[i]).replace(/[$,\s]/g, '');
      if (!/^[0-9]{1,6}(\.[0-9]{1,2})?$/.test(s) || Number(s) < 300 || Number(s) > 50000) return i;
    }
    return -1;
  }

  function cleanRent(s) { return String(s == null ? '' : s).replace(/[$,\s]/g, ''); }

  /* What step 1 answered, in words. county may be null. */
  function answerFor(j, maxUnits) {
    var county = j && j.county ? j.county + ' County' : '';
    var reasons = (j && j.exception_reasons) || [];
    function has(r) { return reasons.indexOf(r) !== -1; }
    if (j && j.path === 'standard') {
      return { ok: true, head: county ? 'We manage rentals in ' + county + '.' : 'We manage rentals there.',
               body: 'Next, tell us the rent and we will show our fee on it.' };
    }
    if (has('rental_term_not_offered')) {
      return { ok: false, head: 'We manage long-term rentals, with leases of 12 months or more.',
               body: 'We do not manage short-term or furnished stays. If your plans change, leave your details and we will be in touch.' };
    }
    if (has('out_of_area')) {
      return { ok: false, head: county ? 'We do not manage in ' + county + ' yet.' : 'We do not manage there yet.',
               body: 'Leave your details and we will tell you if that changes.' };
    }
    if (has('over_unit_limit')) {
      return { ok: false, head: 'For a property with more than ' + (maxUnits || 4) + ' units we prepare a proposal for you, not a standard price.',
               body: 'Leave your details and we will prepare it. We reply within one business day.' };
    }
    if (has('coverage_unconfirmed')) {
      return { ok: false, head: 'We need to confirm that we cover this address.',
               body: 'Leave your details. We reply within one business day.' };
    }
    return { ok: false, head: 'This one needs a person to look at it.',
             body: 'Leave your details. We reply within one business day.' };
  }

  /* Which panel a journey should open on when a visitor comes back to it. */
  function panelFor(j) {
    if (!j) return 'check';
    if (j.has_contact) return 'done';
    if (j.path !== 'standard') return 'contact';
    return j.quote ? 'quote' : 'price';
  }

  var ERROR_TEXT = {
    invalid_address: 'We could not read that address. Enter the street number, street and town.',
    invalid_units: 'Enter how many rental units the property has.',
    invalid_rent: 'Enter each monthly rent as a number between $300 and $50,000.',
    invalid_contact: 'Enter your name and a working email address.',
    rate_limited: 'That is a lot of tries in a short time. Please call us, or try again in an hour.',
    busy: 'We cannot take this online right now. Please call us or use the contact form.',
    not_found: 'This saved page has expired. Start again below.',
    quote_required: 'Add the rent first, so we can show the price.'
  };
  function errorText(code) { return ERROR_TEXT[code] || 'Something went wrong on our side. Please call us or use the contact form.'; }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { usd: usd, esc: esc, townFromAddress: townFromAddress, checkErrors: checkErrors, firstBadRent: firstBadRent,
                       cleanRent: cleanRent, answerFor: answerFor, panelFor: panelFor, errorText: errorText };
    return;
  }

  // ── the page ────────────────────────────────────────────────────────────────────────────────

  var root = document.getElementById('signup');
  var done = function () { document.documentElement.classList.remove('signup-pending'); };
  if (!root || !window.fetch) { done(); return; }

  var store = {
    get: function (s, k) { try { return s.getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { s.setItem(k, v); } catch (e) { /* no-op */ } },
    del: function (s, k) { try { s.removeItem(k); } catch (e) { /* no-op */ } }
  };

  // The emailed link and the preview key leave the address bar at once.
  var preview = null, token = null;
  try {
    var qs = new URLSearchParams(location.search);
    var pk = qs.get('signup_preview');
    if (pk && /^[0-9a-f]{32,100}$/.test(pk)) store.set(sessionStorage, PREVIEW_KEY, pk);
    var m = /^#resume=([0-9a-f]{64})$/.exec(location.hash || '');
    if (m) store.set(localStorage, TOKEN_KEY, m[1]);
    if (pk || m) {
      qs.delete('signup_preview');
      var rest = qs.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
    }
  } catch (e) { /* no-op */ }
  preview = store.get(sessionStorage, PREVIEW_KEY);
  token = store.get(localStorage, TOKEN_KEY);
  if (token && !TOKEN_RE.test(token)) token = null;

  var cfg = null, journey = null, loadedAt = Date.now();

  function call(payload) {
    if (preview) payload.preview = preview;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'unavailable' }; }); })
      .catch(function () { return { ok: false, error: 'unavailable' }; });
  }
  function track(name) { try { if (window.va) window.va('event', { name: name }); } catch (e) { /* no-op */ } }

  var $ = function (id) { return document.getElementById(id); };
  var panels = ['check', 'price', 'quote', 'contact', 'done'];
  var quiet = true; // nothing takes focus while the page is still loading
  function show(name) {
    panels.forEach(function (p) { var el = $('su-' + p); if (el) el.hidden = (p !== name); });
    // the answer to step 1 stays in view from the price step until the end
    $('su-answer').hidden = (name === 'check' || name === 'done');
    if (quiet) return;
    var head = $('su-' + name) && $('su-' + name).querySelector('h2');
    if (head) { head.setAttribute('tabindex', '-1'); head.focus(); }
  }
  function fieldError(form, name, text) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    var slot = $(input.id + '-err');
    if (slot) { slot.textContent = text || ''; slot.hidden = !text; }
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function formError(panel, text) {
    var slot = $('su-' + panel + '-err');
    if (slot) { slot.textContent = text || ''; slot.hidden = !text; }
  }
  function busy(form, on) {
    var b = form.querySelector('button[type="submit"]');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = 'One moment…'; b.disabled = true; }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
  }

  function renderMap() {
    var map = $('su-map');
    if (!map || !cfg || !cfg.steps || !cfg.steps.length) return;
    map.innerHTML = cfg.steps.map(function (s, i) {
      return '<li class="su-map-step"><span class="su-map-n" aria-hidden="true">' + (i + 1) + '</span><div>' +
        '<p class="su-map-name">' + esc(s.name) + '</p><p class="su-map-what">' + esc(s.what_happens) + '</p>' +
        '<p class="su-map-meta">' + esc(s.who_acts_text) + ' · ' + esc(s.typical_time) + '</p></div></li>';
    }).join('');
    // The map takes the place of the page's three-step "What happens next".
    var old = document.querySelector('.what-to-expect');
    if (old && old.parentNode) { old.hidden = true; old.parentNode.insertBefore($('su-map-wrap'), old); $('su-map-wrap').hidden = false; }
  }

  function renderAnswer() {
    var a = answerFor(journey, cfg && cfg.max_units);
    var town = townFromAddress(journey.property_address);
    var rc = journey.path === 'standard'
      ? '<p class="su-note">Rent control is set town by town. <a href="/rent-control-lookup/' + (town ? '?town=' + encodeURIComponent(town) : '') + '">' +
        (town ? 'Look up ' + esc(town) : 'Look up your town') + '</a>.</p>' : '';
    $('su-answer').innerHTML = '<div class="su-answer-card ' + (a.ok ? 'su-yes' : 'su-no') + '"><p class="su-answer-addr">' + esc(journey.property_address) +
      ' <button type="button" class="su-link" id="su-change">Change</button></p><p class="su-answer-head">' + esc(a.head) + '</p><p>' + esc(a.body) + '</p>' + rc + '</div>';
    $('su-change').addEventListener('click', function () { $('su-answer').innerHTML = ''; show('check'); });
  }

  function renderUnits() {
    var n = journey.unit_count, html = '', saved = journey.units || [];
    for (var i = 0; i < n; i++) {
      var u = saved[i] || {};
      var legend = n === 1 ? 'The rental' : 'Unit ' + (i + 1);
      html += '<fieldset class="su-unit"><legend>' + legend + '</legend><div class="su-row">' +
        '<div class="su-field su-grow"><label for="su-rent-' + i + '">Monthly rent</label><input id="su-rent-' + i + '" name="rent" inputmode="decimal" autocomplete="off" placeholder="2,400" value="' + esc(u.rent == null ? '' : u.rent) + '" aria-describedby="su-price-err"></div>' +
        '<div class="su-field"><label for="su-beds-' + i + '">Bedrooms</label><input id="su-beds-' + i + '" name="beds" inputmode="numeric" autocomplete="off" value="' + esc(u.beds == null ? '' : u.beds) + '"></div>' +
        '<div class="su-field"><label for="su-baths-' + i + '">Bathrooms</label><input id="su-baths-' + i + '" name="baths" inputmode="decimal" autocomplete="off" value="' + esc(u.baths == null ? '' : u.baths) + '"></div>' +
        '</div></fieldset>';
    }
    $('su-units').innerHTML = html;
  }

  function renderQuote() {
    var q = journey.quote, rows = '';
    if (journey.unit_count > 1) {
      rows = '<table class="su-lines"><caption class="sr-only">Management fee by unit</caption><thead><tr><th scope="col">Unit</th><th scope="col">Monthly rent</th><th scope="col">Our fee</th></tr></thead><tbody>' +
        q.units.map(function (u, i) { return '<tr><th scope="row">Unit ' + (i + 1) + '</th><td>' + usd(u.rent) + '</td><td>' + usd(u.monthly_fee) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    var also = [];
    if (q.onboarding_fee != null) also.push('<div><dt>Onboarding</dt><dd>' + usd(q.onboarding_fee) + ' one time, deducted from your first payout</dd></div>');
    if (q.new_lease_fee != null) also.push('<div><dt>New-lease fee</dt><dd>' + usd(q.new_lease_fee) + ' per new lease</dd></div>');
    if (q.renewal_fee != null) also.push('<div><dt>Lease renewal</dt><dd>' + usd(q.renewal_fee) + ' per renewal</dd></div>');
    $('su-quote-body').innerHTML =
      '<p class="su-figure"><span class="su-figure-n">' + usd(q.monthly_fee_total) + '</span> <span class="su-figure-u">a month</span></p>' +
      '<p class="su-figure-on">on ' + usd(q.monthly_rent_total) + ' of monthly rent, in a month the rent is collected in full</p>' + rows +
      '<p class="su-terms">' + esc(q.management_fee_text) + '.</p>' +
      '<dl class="su-also">' + also.join('') + '</dl>' +
      (q.negotiable_statement ? '<p class="su-legal">' + esc(q.negotiable_statement) + ' ' + esc(root.getAttribute('data-broker') || '') + '</p>' : '') +
      '<p class="su-note"><a href="/pricing/">Everything we charge, and what we do not</a></p>';
  }

  function renderDone() {
    $('su-done-text').textContent = journey.path === 'standard'
      ? 'Saved. We will email you a link back to this page, and we reply within one business day.'
      : 'Thanks. We have your details and reply within one business day.';
  }

  function open(j) {
    journey = j;
    var p = panelFor(j);
    if (p !== 'check') renderAnswer();
    if (p === 'price' || p === 'quote') renderUnits();
    if (p === 'quote') renderQuote();
    $('su-contact-title').textContent = j.path === 'standard' ? 'Save this and take the next step' : 'Leave your details';
    if (p === 'done') renderDone();
    show(p);
  }

  function activate() {
    renderMap();
    var card = document.querySelector('.form-card');
    var classic = document.querySelector('.form-placeholder');
    var title = card && card.querySelector('.form-title');
    if (!card || !classic) return false;
    classic.hidden = true;
    if (title) title.hidden = true;
    card.appendChild(root);
    root.hidden = false;
    document.documentElement.classList.add('signup-on');
    if (cfg.mode === 'preview') $('su-test').hidden = false;
    $('su-classic').addEventListener('click', function () {
      root.hidden = true; classic.hidden = false; if (title) title.hidden = false;
      document.documentElement.classList.remove('signup-on');
      var first = classic.querySelector('input:not([tabindex="-1"])'); if (first) first.focus();
    });
    return true;
  }

  // ── the three forms ─────────────────────────────────────────────────────────────────────────

  $('su-check').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, v = {
      address: f.address.value, unit_count: f.unit_count.value, property_type: f.property_type.value,
      occupancy: f.occupancy.value, rental_term: f.rental_term.value, desired_start: f.desired_start.value
    };
    var errs = checkErrors(v), names = ['address', 'unit_count', 'property_type', 'occupancy'], firstBad = null;
    names.forEach(function (n) { fieldError(f, n, errs[n]); if (errs[n] && !firstBad) firstBad = n; });
    formError('check', '');
    if (firstBad) { f[firstBad].focus(); return; }
    var payload = { action: 'start', website: f.website.value };
    Object.keys(v).forEach(function (k) { payload[k] = v[k]; });
    try { if (window.ppmAttribution) payload.attribution = window.ppmAttribution(); } catch (err) { /* no-op */ }
    busy(f, true);
    call(payload).then(function (res) {
      busy(f, false);
      if (!res.ok || !res.token) {
        if (res.error === 'invalid_address') { fieldError(f, 'address', errorText(res.error)); f.address.focus(); }
        else if (res.error === 'invalid_units') { fieldError(f, 'unit_count', errorText(res.error)); f.unit_count.focus(); }
        else formError('check', errorText(res.error));
        return;
      }
      token = res.token; store.set(localStorage, TOKEN_KEY, token);
      track('signup_check');
      open(res.journey);
    });
  });

  $('su-price').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, rents = [], units = [];
    Array.prototype.forEach.call(f.querySelectorAll('.su-unit'), function (u) {
      var r = cleanRent(u.querySelector('[name="rent"]').value);
      rents.push(r);
      units.push({ rent: r, beds: u.querySelector('[name="beds"]').value.trim(), baths: u.querySelector('[name="baths"]').value.trim() });
    });
    var bad = firstBadRent(rents);
    formError('price', bad === -1 ? '' : errorText('invalid_rent'));
    if (bad !== -1) { f.querySelectorAll('[name="rent"]')[bad].focus(); return; }
    busy(f, true);
    call({ action: 'quote', token: token, units: units }).then(function (res) {
      busy(f, false);
      if (!res.ok) { formError('price', errorText(res.error)); return; }
      track('signup_quote');
      open(res.journey);
    });
  });

  $('su-continue').addEventListener('click', function () { show('contact'); });
  $('su-edit-rent').addEventListener('click', function () { renderUnits(); show('price'); });

  $('su-contact').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, name = f.name.value.trim(), email = f.email.value.trim();
    var okName = name.length > 0, okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    fieldError(f, 'name', okName ? '' : 'Enter your name.');
    fieldError(f, 'email', okEmail ? '' : 'Enter a working email address.');
    formError('contact', '');
    if (!okName) { f.name.focus(); return; }
    if (!okEmail) { f.email.focus(); return; }
    var i = name.search(/\s/);
    var payload = {
      action: 'contact', token: token, first_name: i === -1 ? name : name.slice(0, i), last_name: i === -1 ? '' : name.slice(i + 1).trim(),
      email: email, phone: f.phone.value.trim(), website: f.website.value, page: location.pathname.slice(0, 200), elapsed_ms: Math.max(0, Math.floor(Date.now() - loadedAt))
    };
    try { if (window.ppmAttribution) payload.attribution = window.ppmAttribution(); } catch (err) { /* no-op */ }
    busy(f, true);
    call(payload).then(function (res) {
      busy(f, false);
      if (!res.ok) { formError('contact', errorText(res.error)); return; }
      // The same event every lead form sends, so "leads from the site" stays one number.
      track('lead_submit'); track('signup_contact');
      open(res.journey);
    });
  });

  // ── start ───────────────────────────────────────────────────────────────────────────────────

  var ask = preview ? call({ action: 'config' }) : fetch(API, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); });
  ask.then(function (c) {
    if (!c || c.ok !== true || (c.mode !== 'on' && c.mode !== 'preview')) return;
    cfg = c;
    if (!activate()) return;
    if (!token) { show('check'); return; }
    return call({ action: 'get', token: token }).then(function (res) {
      if (res.ok && res.journey && res.journey.status === 'open') { open(res.journey); return; }
      store.del(localStorage, TOKEN_KEY); token = null;
      show('check');
    });
  }).catch(function () { /* the contact form stays */ }).then(function () { quiet = false; done(); });
})();
