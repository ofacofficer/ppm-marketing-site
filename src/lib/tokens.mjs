// Site facts inside page bodies. A body file writes {{phone.display}} where the page shows the phone
// number, {{portal.tenant}} for the tenant-portal login URL, and so on; the layout fills them in from
// src/site.config.mjs at build time. That keeps "change the phone number" or "point the logins at the
// OS portal" a one-value edit for one-off pages too, not a find-and-replace across bodies.
//
// Tokens are never placed inside <script> elements: the lead-form and listing scripts are moved
// byte-for-byte and are not templated.
import { site } from '../site.config.mjs';

export const TOKENS = {
  'phone.display': site.phone.display,
  'phone.tel': site.phone.tel,
  email: site.email,
  'portal.owner': site.portals.owner,
  'portal.tenant': site.portals.tenant,
};

export function expandTokens(html) {
  return html.replace(/\{\{([a-z.]+)\}\}/g, (m, key) => {
    if (!(key in TOKENS)) throw new Error(`unknown body token ${m}`);
    return TOKENS[key];
  });
}
