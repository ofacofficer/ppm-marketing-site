// The pure half of /js/signup.js (the Get Started sign-up flow): what is checked before anything
// is sent, and the words an owner reads for each answer. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const s = require('../../public/js/signup.js');

test('usd: whole dollars drop the cents, others keep two', () => {
  assert.equal(s.usd(275), '$275');
  assert.equal(s.usd(255.5), '$255.50');
  assert.equal(s.usd(5555), '$5,555');
  assert.equal(s.usd('x'), '');
});

test('esc: everything an owner or the service supplies is escaped before it is drawn', () => {
  assert.equal(s.esc('<img src=x onerror=alert(1)>"\'&'), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  assert.equal(s.esc(null), '');
});

test('townFromAddress: the part after the first comma, only when it is shaped like a town', () => {
  assert.equal(s.townFromAddress('512 Palisade Ave, Union City, NJ 07087'), 'Union City');
  assert.equal(s.townFromAddress('512 Palisade Ave, NJ 07087'), '');
  assert.equal(s.townFromAddress('512 Palisade Ave, <script>, NJ'), '');
  assert.equal(s.townFromAddress('512 Palisade Ave'), '');
  assert.equal(s.townFromAddress(null), '');
});

test('checkErrors: an address needs a number and a word; units a whole number of 1 or more', () => {
  const good = { address: '5 Main St, Newark', unit_count: '2', property_type: 'multi_2_4', occupancy: 'vacant' };
  assert.deepEqual(s.checkErrors(good), {});
  assert.ok(s.checkErrors({ ...good, address: 'Main St' }).address);
  assert.ok(s.checkErrors({ ...good, address: '12345' }).address);
  for (const n of ['0', '', 'two', '-1', '1.5']) assert.ok(s.checkErrors({ ...good, unit_count: n }).unit_count, n);
  assert.ok(s.checkErrors({ ...good, property_type: '' }).property_type);
  assert.ok(s.checkErrors({ ...good, occupancy: '' }).occupancy);
});

test('firstBadRent: $300 to $50,000, with or without a dollar sign and commas', () => {
  assert.equal(s.firstBadRent(['$3,000', '2555.50', ' 300 ']), -1);
  assert.equal(s.firstBadRent(['3000', '299']), 1);
  assert.equal(s.firstBadRent(['50001']), 0);
  assert.equal(s.firstBadRent(['', '3000']), 0);
  assert.equal(s.firstBadRent(['1e3']), 0);
  assert.equal(s.cleanRent('$3,000'), '3000');
});

test('answerFor: the standard path names the county; each exception says why in plain words', () => {
  assert.deepEqual(s.answerFor({ path: 'standard', county: 'Hudson' }, 4).head, 'We manage rentals in Hudson County.');
  assert.equal(s.answerFor({ path: 'standard', county: null }, 4).ok, true);
  const ex = (reasons, county) => s.answerFor({ path: 'exception', exception_reasons: reasons, county }, 4);
  assert.equal(ex(['out_of_area'], 'Atlantic').head, 'We do not manage in Atlantic County yet.');
  assert.match(ex(['rental_term_not_offered', 'out_of_area'], 'Atlantic').head, /long-term rentals/);
  assert.match(ex(['over_unit_limit'], 'Hudson').head, /more than 4 units/);
  assert.match(ex(['coverage_unconfirmed'], null).head, /confirm that we cover/);
  assert.match(ex(['something_new'], null).head, /needs a person/);
  assert.equal(ex(['out_of_area'], 'Atlantic').ok, false);
});

test('panelFor: a returning owner lands where they left off', () => {
  assert.equal(s.panelFor(null), 'check');
  assert.equal(s.panelFor({ path: 'standard', quote: null }), 'price');
  assert.equal(s.panelFor({ path: 'standard', quote: {} }), 'quote');
  assert.equal(s.panelFor({ path: 'exception' }), 'contact');
  assert.equal(s.panelFor({ path: 'standard', quote: {}, has_contact: true }), 'done');
});

test('errorText: a known code has its own sentence; anything else points to the phone and the form', () => {
  assert.match(s.errorText('rate_limited'), /try again in an hour/);
  assert.match(s.errorText('whatever'), /call us or use the contact form/);
});
