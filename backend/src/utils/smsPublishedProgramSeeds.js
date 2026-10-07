// Initial public publication requested by the ITSCO owner. This contains public
// identity and policy URLs only; it is not carrier approval or recipient consent.
export function publishedSmsProgramSeed(agency, program) {
  if (Number(agency.id) !== 2 || String(agency.slug).toLowerCase() !== 'itsco' || program !== 'polling') return null;
  return { at: '2026-10-06T18:00:00Z', by: null, profile: {
    legalName: 'ITSCO, LLC', brandName: 'ITSCO', brandId: 'BRC2ZW3', supportContact: 'support@itsco.health',
    website: 'https://www.itsco.health', portalUrl: 'https://app.itsco.health',
    organizationPrivacyUrl: 'https://www.itsco.health/itsco/privacypolicy',
    organizationTermsUrl: 'https://www.itsco.health/itsco/terms',
    logoUrl: 'https://www.itsco.health/assets/itsco/logo.png', ownership: 'own', volume: 'low'
  } };
}
