export const exchangeLocations = ['Colorado Springs', 'Denver', 'Either location', 'Other location', 'Not yet decided'];

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
  return `In-person location: ${preferences.serviceLocation || 'Not recorded — confirm with the referring team'}`;
}
