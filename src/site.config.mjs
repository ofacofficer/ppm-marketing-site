// The one place for facts the whole site repeats. Change a value here and every page that shows it
// changes with the next build: the nav, the footer, the post template and the JSON-LD all read from
// this file. Plain ESM (not TypeScript) so the build scripts in scripts/ can import it too.
//
// Copy note: the strings below are the site's live copy. Editing them is a copy change, which goes
// through Blake and Dan's approval like any other (WEBSITE_RUNBOOK.md §1).

export const site = {
  name: 'Proactive Property Management',
  legalName: 'Proactive Property Management LLC',
  baseUrl: 'https://www.njpropertymanager.com',
  themeColor: '#012E4B',
  ogImage: 'https://www.njpropertymanager.com/og-image.jpg',
  twitterHandle: '@NJProactivePM',

  phone: {
    display: '(973) 330-8261',
    tel: '9733308261', // href="tel:…"
    e164: '+1-973-330-8261', // JSON-LD telephone
  },
  email: 'contact@njppm.com',
  address: {
    street: '525 Washington Boulevard',
    city: 'Jersey City',
    region: 'NJ',
    postalCode: '07310',
    oneLine: '525 Washington Boulevard, Jersey City, NJ 07310',
  },
  copyrightLine: '© 2026 Proactive Property Management LLC · Jersey City, NJ',
  brokerLine: 'Supervising Broker: FPG Realty NJ LLC · License #2298176',
  equalHousing:
    'Equal Housing Opportunity. We fully support the principles of the Fair Housing Act and NJ Law Against Discrimination.',
  footerBlurb:
    'Residential property management for NJ landlords and investors. Northern & Central New Jersey.',

  // Portal logins. These point at Buildium until the PORTAL_LAUNCH_KIT §4 gate passes; repointing
  // every login link on the site to the OS portal is a change to these two values only.
  portals: {
    owner: 'https://njppm.managebuilding.com/manager/public/authentication/login?ReturnUrl=%2Fmanager%2Fapp%2Fhomepage%2Fdashboard',
    tenant: 'https://njppm.managebuilding.com/Resident/portal/login',
  },

  // Measurement. Vercel Web Analytics is the only analytics on the site (Dan's D1 ruling,
  // 2026-11-09: Google Ads is off, so no GA4/Ads tags). call_click is the phone-tap event.
  analytics: {
    vercelInsightsSrc: '/_vercel/insights/script.js',
    callClickEvent: 'call_click',
  },

  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61559858243845', icon: 'facebook' },
    { label: 'X / Twitter', href: 'https://x.com/NJProactivePM', icon: 'x' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/proactivepropertymanagement/', icon: 'linkedin' },
    { label: 'Instagram', href: 'https://www.instagram.com/proactivepropmgmt', icon: 'instagram' },
  ],

  nav: {
    primary: [
      { href: '/services/', label: 'Services' },
      { href: '/service-areas/', label: 'Areas' },
      { href: '/rentals/', label: 'Rentals' },
      { href: '/pricing/', label: 'Pricing' },
      { href: '/blog/', label: 'Resources' },
      { href: '/about/', label: 'About' },
    ],
    mobile: [
      { href: '/services/', label: 'Services' },
      { href: '/service-areas/', label: 'Areas Served' },
      { href: '/rentals/', label: 'Available Rentals' },
      { href: '/pricing/', label: 'Pricing' },
      { href: '/rent-control-lookup/', label: 'Rent Control Lookup' },
      { href: '/blog/', label: 'Resources' },
      { href: '/about/', label: 'About' },
    ],
    cta: { href: '/contact/', label: 'Free Rental Analysis', mobileLabel: 'Get a Free Rental Analysis' },
  },

  footer: {
    columns: [
      {
        head: 'Services',
        links: [
          { href: '/services/', label: 'All Services' },
          { href: '/services/#tenant-placement', label: 'Tenant Placement' },
          { href: '/services/#rent-collection', label: 'Rent Collection' },
          { href: '/services/#maintenance', label: 'Maintenance' },
          { href: '/services/#compliance', label: 'Legal Compliance' },
        ],
      },
      {
        head: 'Areas',
        links: [
          { href: '/service-areas/jersey-city/', label: 'Jersey City' },
          { href: '/service-areas/hoboken/', label: 'Hoboken' },
          { href: '/service-areas/newark/', label: 'Newark' },
          { href: '/service-areas/parsippany/', label: 'Parsippany' },
          { href: '/service-areas/', label: 'All Areas →' },
        ],
      },
      {
        head: 'Resources',
        links: [
          { href: '/blog/nj-landlord-law/', label: 'NJ Landlord Law' },
          { href: '/blog/property-management-costs/', label: 'PM Costs' },
          { href: '/blog/nj-rental-market/', label: 'NJ Rental Market' },
          { href: '/pricing/', label: 'Pricing' },
          { href: '/rent-control-lookup/', label: 'Rent Control Lookup' },
          { href: '/landlord-checklist/', label: 'Landlord Checklist' },
          { href: '/about/', label: 'About PPM' },
        ],
        // The column ends with one of `footerTails` below, chosen per page.
      },
    ],
    legal: [
      { href: '/privacy/', label: 'Privacy' },
      { href: '/terms/', label: 'Terms' },
      { href: '/eula/', label: 'EULA' },
      { href: '/accessibility/', label: 'Accessibility' },
    ],
  },
};

// The last links of the footer's Resources column. Most pages end with Tenant Resources; the home
// page and the tenant-facing pages (rentals, tenants) end differently today, so Base takes a
// `footerTail` key. Kept exactly as found in Phase 1 (no visible change); unifying it is a Phase 2
// decision.
export const footerTails = {
  default: [{ href: '/tenants/', label: 'Tenant Resources' }],
  home: [{ href: '/rentals/', label: 'Available Rentals' }, { href: '/tenants/', label: 'Tenant Resources' }],
  tenantFacing: [{ href: '/rentals/', label: 'Available Rentals' }],
};

// The LocalBusiness node every post page carries (the post template has always emitted it).
export const businessJsonLd = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'ProfessionalService'],
  '@id': `${site.baseUrl}/#business`,
  name: site.name,
  alternateName: 'PPM',
  url: site.baseUrl,
  telephone: site.phone.e164,
  email: site.email,
  address: { '@type': 'PostalAddress', addressLocality: site.address.city, addressRegion: site.address.region, addressCountry: 'US' },
};
