export const exchangeLocations = ['Colorado Springs', 'Denver', 'Either location', 'Other location', 'Not yet decided'];

/** An explicit service choice wins. Otherwise use a known local home city,
 * without interpreting a street address, ZIP code, or another city's proximity. */
export function resolveExchangeLocation(client = {}, intake = {}) {
  const explicit = Object.hasOwn(intake, 'serviceLocation') ? intake.serviceLocation
    : Object.hasOwn(intake, 'preferred_service_location') ? intake.preferred_service_location
    : intake.preferredLocation || intake.exchangeReferral?.serviceLocation;
  if (explicit && intake.serviceLocationSource !== 'home_address') return { serviceLocation: explicit, serviceLocationSource: 'preference' };
  const state = String(client.address_state || '').trim().toLowerCase();
  const city = String(client.address_city || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!['co', 'colorado'].includes(state)) return { serviceLocation: null, serviceLocationSource: null };
  const location = ['Colorado Springs', 'Denver'].find(value => value.toLowerCase() === city);
  return { serviceLocation: location || null, serviceLocationSource: location ? 'home_address' : null };
}

export function normalizeExchangeLocation(value, { required = false } = {}) {
  const raw = String(value || '').trim();
  const location = exchangeLocations.find(item => item.toLowerCase() === raw.toLowerCase()) || '';
  if ((raw && !location) || (required && !location)) {
    throw Object.assign(new Error('Choose the requested in-person service location, or select Not yet decided.'), { status: 400 });
  }
  return location;
}

export function exchangeLocationLabel(preferences = {}) {
  const modality = String(preferences.modality || preferences.preferredModality || '').toLowerCase();
  if (modality === 'virtual') return 'Virtual';
  return `In-person location: ${preferences.serviceLocation || 'Not recorded — confirm with the referring team'}${preferences.serviceLocationSource === 'home_address' ? ' (from home address)' : ''}`;
}
