import Agency from '../models/Agency.model.js';

const fields = {
  name: ['name', 255], officialName: ['official_name', 255], websiteUrl: ['website_url', 512],
  phoneNumber: ['phone_number', 50], streetAddress: ['street_address', 255], city: ['city', 100],
  state: ['state', 100], postalCode: ['postal_code', 20], timezone: ['timezone', 100]
};
function fail(status, message) { return Object.assign(new Error(message), { status }); }
export function normalizeBusinessProfile(input = {}) {
  const allowed = new Set([...Object.keys(fields), 'taxIdType', 'taxId']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw fail(400, 'Only business profile fields can be changed here.');
  const result = {};
  for (const [key, [, length]] of Object.entries(fields)) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && typeof input[key] !== 'string') throw fail(400, `Review ${key}.`);
    const value = String(input[key] || '').trim();
    if (value.length > length || (key === 'name' && !value)) throw fail(400, `Review ${key}.`);
    result[key] = value || null;
  }
  if (result.websiteUrl) {
    let url; try { url = new URL(result.websiteUrl); } catch { throw fail(400, 'Enter a valid business website URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw fail(400, 'Enter a valid business website URL.');
  }
  if (result.timezone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: result.timezone }).format(); }
    catch { throw fail(400, 'Choose a valid business time zone.'); }
  }
  if (input.taxIdType !== undefined) {
    if (![null, '', 'ein', 'ssn'].includes(input.taxIdType)) throw fail(400, 'Choose EIN or SSN.');
    result.taxIdType = input.taxIdType || null;
  }
  if (input.taxId !== undefined) {
    if (typeof input.taxId !== 'string' || !/^\d{9}$/.test(input.taxId.replaceAll('-', '').trim())) throw fail(400, 'Enter a nine-digit tax ID.');
    result.taxId = input.taxId.replaceAll('-', '').trim();
  }
  return result;
}
function publicProfile(agency) {
  return {
    agencyId: Number(agency.id),
    ...Object.fromEntries(Object.entries(fields).map(([key, [column]]) => [key, agency[column] || ''])),
    taxIdType: agency.tax_id_type || '', taxIdLast4: agency.tax_id_last4 || ''
  };
}
async function independentAgency(agencyId) {
  const agency = await Agency.findById(agencyId);
  if (!agency || !agency.is_active || agency.is_archived || !['life_coach','consultant'].includes(agency.organization_type)) throw fail(404, 'Independent business not found.');
  return agency;
}
// Authorization is requireAgencyAdmin: the active owner of this exact tenant,
// or an existing administrator with agency access. Never return tax ID plaintext.
export async function getIndependentBusinessProfile(req, res, next) {
  try { res.set('Cache-Control', 'no-store'); res.json(publicProfile(await independentAgency(req.params.agencyId))); }
  catch (error) { next(error); }
}
export async function updateIndependentBusinessProfile(req, res, next) {
  try {
    const agency = await independentAgency(req.params.agencyId);
    await Agency.update(agency.id, normalizeBusinessProfile(req.body));
    res.set('Cache-Control', 'no-store'); res.json(publicProfile(await independentAgency(agency.id)));
  } catch (error) { next(error); }
}
