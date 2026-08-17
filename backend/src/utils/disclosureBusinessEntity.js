/**
 * Resolve the Business Entity block at the top of Smart Disclosure from the
 * tenant (agency) record. Saved disclosure settings win; ITSCO hardcoded
 * address/phone is only a fallback for ITSCO itself — never for other tenants.
 */
export const FALLBACK_ITSCO_BUSINESS_ENTITY = {
  name: 'ITSCO LLC',
  address: '437 Windchime Place Colorado Springs CO, 80919',
  phone: '833-444-8726',
  email: null
};

function looksLikeItscoAgency(agency = {}) {
  const id = Number(agency?.id || 0);
  if (id === 2) return true;
  const slug = String(agency?.slug || agency?.portal_url || '').trim().toLowerCase();
  if (slug === 'itsco' || slug === 'demo' || slug === 'itsco-demo') return true;
  const name = String(agency?.name || agency?.official_name || '').trim().toLowerCase();
  return name === 'itsco' || name.startsWith('itsco ');
}

export function tenantBusinessEntityFromAgency(agency = {}) {
  const name = String(agency?.official_name || agency?.legal_name || agency?.name || '').trim();
  const street = String(agency?.street_address || '').trim();
  const cityState = [agency?.city, agency?.state].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  const zip = String(agency?.postal_code || '').trim();
  const address = [street, cityState, zip].filter(Boolean).join(', ');
  const phone = String(agency?.phone_number || agency?.phone || '').trim();
  const email = String(agency?.email || agency?.contact_email || '').trim() || null;
  return { name, address, phone, email };
}

export function resolveDisclosureBusinessEntity(agency = {}, savedEntity = {}) {
  const saved = savedEntity && typeof savedEntity === 'object' ? savedEntity : {};
  const tenant = tenantBusinessEntityFromAgency(agency);
  const itscoFallback = looksLikeItscoAgency(agency) ? FALLBACK_ITSCO_BUSINESS_ENTITY : {
    name: '',
    address: '',
    phone: '',
    email: null
  };
  return {
    name: String(saved.name || '').trim() || tenant.name || itscoFallback.name,
    address: String(saved.address || '').trim() || tenant.address || itscoFallback.address,
    phone: String(saved.phone || '').trim() || tenant.phone || itscoFallback.phone,
    email: String(saved.email || '').trim() || tenant.email || itscoFallback.email || null
  };
}
