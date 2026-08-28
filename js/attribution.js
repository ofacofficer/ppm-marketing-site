/* First-touch attribution capture — Proactive Property Management.
 * Included site-wide. On a visitor's FIRST page view we store the utm_* params, the
 * referrer (external only), the landing page, and a timestamp in localStorage. Lead
 * forms attach that record to their /api/lead/ submission as `attribution`, so the
 * CRM can see which channel actually produced each lead. First touch is immutable:
 * once stored, later visits (even with new utm params) never overwrite it.
 * Everything is best-effort — storage being unavailable must never break a page. */
(function () {
  var KEY = 'ppm_first_touch';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      return (rec && typeof rec === 'object') ? rec : null;
    } catch (e) {
      return null;
    }
  }

  function capture() {
    try {
      if (readStored()) return; /* first touch already recorded — keep it */
      var rec = {};
      var qs = new URLSearchParams(window.location.search);
      for (var i = 0; i < UTM_KEYS.length; i++) {
        var v = qs.get(UTM_KEYS[i]);
        if (v) rec[UTM_KEYS[i]] = String(v).slice(0, 200);
      }
      var ref = document.referrer || '';
      if (ref && ref.indexOf(window.location.origin) !== 0) {
        rec.referrer = ref.slice(0, 500);
      }
      rec.landing_page = (window.location.pathname + window.location.search).slice(0, 500);
      rec.first_touch_at = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(rec));
    } catch (e) {
      /* private browsing / storage blocked — attribution is best-effort only */
    }
  }

  /* Lead forms call this at submit time; returns the stored record or null. */
  window.ppmAttribution = function () {
    return readStored();
  };

  capture();
})();
