// Home page copy that appears twice on the page and must never drift: the FAQ (visible <details> and
// the FAQPage JSON-LD are both rendered from this list) and the New Jersey rules ledger.
//
// Copy note: these strings are live site copy. Changing them is a copy change (Blake drafts, Dan
// approves, the CCO checks every claim and citation; WEBSITE_RUNBOOK.md §1). Each rule row cites the
// official source it was checked against.
import { site } from '../site.config.mjs';

export const homeFaq = [
  {
    question: 'What does a property management company do?',
    answer: 'A property management company runs your rental on your behalf. That means finding and screening tenants, collecting rent, handling maintenance requests, enforcing the lease, and sending you a financial report every month. You stay the owner. We do the work.',
  },
  {
    question: 'How much does property management cost in New Jersey?',
    answer: 'Most NJ property management companies charge between 8% and 12% of monthly collected rent, plus a one-time leasing fee when a new tenant is placed. Watch for setup fees, technology fees, or maintenance markups — those add up fast. PPM charges one management fee, plus a one-time leasing fee quoted up front when we place a new tenant. No technology fees and no maintenance markups.',
  },
  {
    question: 'What areas of New Jersey does Proactive Property Management serve?',
    answer: `PPM serves landlords across Northern and Central New Jersey — Jersey City, Hoboken, Newark, Parsippany, Morristown, Edison, Woodbridge, Hackensack, Clifton, and surrounding towns. Call ${site.phone.display} to confirm coverage for your address.`,
  },
  {
    question: 'How do I get started with a property manager in NJ?',
    answer: 'Three steps: (1) We do a free rental analysis — no cost, no commitment. We tell you what your property should rent for and what the current market looks like. (2) You review the management agreement. (3) We take over. Most owners are fully onboarded within one to two weeks.',
  },
  {
    question: 'What makes Proactive Property Management different?',
    answer: "We're not a franchise. You get a direct line to the person managing your property — not a call center. One management fee, and no markups on maintenance.",
  },
  {
    question: 'Does PPM handle evictions in New Jersey?',
    answer: 'Yes. When an eviction is necessary, we manage the full process — proper notice, court filing, and coordination through to possession. NJ eviction law is strict and procedural; a misstep resets the clock.',
  },
  {
    question: 'Can you manage my property if I live out of state?',
    answer: "Yes. Your owner portal (Buildium) gives you access to financials, maintenance updates, and lease documents from anywhere. We're your eyes and hands on the ground.",
  },
];

/** The rules ledger. `source` is the official page each row was checked against (PHASE3_CLAIMS.md). */
export const njRules = [
  {
    rule: 'Ending a tenancy takes good cause',
    detail: 'A court can remove most residential tenants only on one of the grounds the Anti-Eviction Act lists, and a landlord may not refuse to renew a lease without one. Owner-occupied buildings with two or fewer rental units are among the exceptions.',
    statute: 'N.J.S.A. 2A:18-61.1',
    source: 'https://www.nj.gov/dca/codes/codreg/pdf_regs/2A_18_61.pdf',
    weDo: 'We coordinate the eviction process when one is necessary: proper notice, court filing and follow-through to possession.',
  },
  {
    rule: 'Security deposits are capped, earn interest and come back in 30 days',
    detail: 'A deposit cannot be more than one and one-half months’ rent. It is held in an interest-bearing account, the interest belongs to the tenant, and the deposit comes back with interest, less any itemized deductions, within 30 days after the tenancy ends.',
    statute: 'N.J.S.A. 46:8-19, 46:8-21.1 and 46:8-21.2',
    source: 'https://www.nj.gov/dca/codes/publications/pdf_lti/t_i_r.pdf',
    weDo: 'Deposit compliance is part of the service: interest, notices and timely returns.',
  },
  {
    rule: 'Tenants get the state’s Truth in Renting statement',
    detail: 'Landlords of buildings with more than two units (more than three if the landlord lives in one) give each tenant the Department of Community Affairs statement of tenant and landlord rights.',
    statute: 'N.J.S.A. 46:8-43 to -51',
    source: 'https://www.nj.gov/dca/codes/publications/pdf_lti/t_i_r.pdf',
    weDo: 'It is one of the required landlord disclosures we handle.',
  },
  {
    rule: 'Flood risk is disclosed before a lease is signed or renewed',
    detail: 'Landlords tell tenants, on the state’s model notice, whether the property is in a FEMA flood hazard area and whether they know of past flooding. Every residential lease also tells renters that flood insurance may be available to them.',
    statute: 'N.J.S.A. 46:8-50 (P.L.2023, c.93)',
    source: 'https://pub.njleg.gov/Bills/2022/PL23/93_.HTM',
    weDo: 'It is one of the required landlord disclosures we handle.',
  },
  {
    rule: 'Rentals built before 1978 need lead-paint inspections',
    detail: 'Most single-family, two-family and multiple rental dwellings built before 1978 must be inspected for lead-based paint hazards every three years or at tenant turnover, unless they hold a valid lead-safe certification.',
    statute: 'N.J.S.A. 52:27D-437.16 et seq. (P.L.2021, c.182); N.J.A.C. 5:28A',
    source: 'https://www.nj.gov/dca/codes/resources/leadpaint.shtml',
    weDo: 'Lead paint is part of the disclosure and compliance work we handle.',
  },
  {
    rule: 'Rent control is set town by town',
    detail: 'New Jersey has no statewide rent control. Municipalities may pass rent control or rent leveling ordinances, and local boards enforce them.',
    statute: 'Local ordinance; no state statute (DCA Truth in Renting guide)',
    source: 'https://www.nj.gov/dca/codes/publications/pdf_lti/t_i_r.pdf',
    weDo: 'We handle rent control registration and compliance where it applies.',
  },
];
