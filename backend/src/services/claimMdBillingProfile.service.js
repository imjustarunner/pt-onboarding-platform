import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Agency from '../models/Agency.model.js';
import { unpackAgencyTaxId } from './agencyTaxId.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

const payerOverride = row => /payer override/i.test(`${row?.notes || ''} ${row?.label || ''}`);

// The office practice NPI is the billing identity. A payer-override NPI, such as
// the Medicaid billing NPI, stays available for that payer and is not a second office.
async function officeGroupIdentity(agencyId, officeId, officeNpi) {
  const [groups] = await pool.execute(`SELECT npi_number, label, notes FROM agency_group_npis
    WHERE agency_id = ? AND office_location_id = ? AND is_active = 1`, [agencyId, officeId]);
  const rows = (groups || []).map(row => ({ npi: String(row.npi_number || '').trim(), override: payerOverride(row) })).filter(row => /^\d{10}$/.test(row.npi));
  const identities = [...new Set(rows.filter(row => !row.override).map(row => row.npi))];
  const overrideNpis = [...new Set(rows.filter(row => row.override).map(row => row.npi))];
  const office = String(officeNpi || '').trim();
  if (identities.length > 1 || (identities.length === 1 && office && identities[0] !== office))
    throw fail('Credentialing and the billing office have conflicting group NPIs. Review the office mapping.');
  return { billingNpi: identities[0] || office, overrideNpis };
}

// An office's clinical visibility/shared scheduling access does not grant use of
// another tenant's legal billing identity. Only agency-owned offices qualify.
export async function listClaimMdBillingProfiles(agencyId) {
  const [rows] = await pool.execute(`SELECT id, name, practice_name, practice_npi, street_address, city, state, postal_code
    FROM office_locations WHERE agency_id = ? AND is_active = 1 AND use_as_billing_address = 1 ORDER BY name, id`, [agencyId]);
  return Promise.all(rows.map(async office => {
    try {
      const identity = await officeGroupIdentity(agencyId, office.id, office.practice_npi);
      return { ...office, practice_npi: identity.billingNpi, override_npis: identity.overrideNpis };
    }
    catch(error) {
      if(error.status !== 409)throw error;
      return { ...office, practice_npi: '', configuration_error:error.message };
    }
  }));
}

export async function getClaimMdBillingProfile(agencyId, officeId, { requireComplete = true } = {}) {
  if (!Number.isSafeInteger(Number(officeId)) || Number(officeId) < 1) throw fail('Select a billing office for this agency.');
  const [[office]] = await pool.execute(`SELECT id, agency_id, name, practice_name, practice_npi, street_address, city, state, postal_code, phone
    FROM office_locations WHERE id = ? AND agency_id = ? AND is_active = 1 AND use_as_billing_address = 1`, [officeId, agencyId]);
  if (!office) throw fail('The billing office is unavailable or belongs to another agency.');
  const identity = await officeGroupIdentity(agencyId, office.id, office.practice_npi);
  office.practice_npi = identity.billingNpi;
  if (requireComplete && !/^\d{10}$/.test(String(office.practice_npi || ''))) throw fail('Save the billing office’s group NPI before using Claim.MD.');
  const agency = await Agency.findById(agencyId);
  if (!agency) throw fail('Agency not found.');
  const [[taxRow]] = await pool.execute(`SELECT tax_id, tax_id_ciphertext, tax_id_iv, tax_id_auth_tag, tax_id_key_id
    FROM agencies WHERE id = ?`, [agencyId]);
  // Tax identity remains agency-specific; never copy it from a shared office.
  const practice = {
    name: office.practice_name, phone_number: office.phone || agency.phone_number,
    street_address: office.street_address, city: office.city, state: office.state, postal_code: office.postal_code,
    tax_id: unpackAgencyTaxId(taxRow || {}), tax_id_type: agency.tax_id_type
  };
  const missing = ['name', 'phone_number', 'street_address', 'city', 'state', 'postal_code'].filter(k => !String(practice[k] || '').trim());
  if (requireComplete && missing.length) throw fail(`Complete the billing office profile: ${missing.join(', ')}.`);
  return { officeId: Number(office.id), officeName: office.name, billingNpi: String(office.practice_npi || ''), overrideNpis: identity.overrideNpis, practice };
}

async function assignedBillingOfficeId(providerUserId) {
  const providerId = Number(providerUserId || 0);
  if (!providerId) return 0;
  const [assigned] = await pool.execute(`SELECT office_location_id, is_primary FROM user_office_locations
    WHERE user_id = ? AND is_active = 1`, [providerId]);
  const rows = (assigned || []).map(row => ({ id: Number(row.office_location_id), primary: Number(row.is_primary) === 1 })).filter(row => row.id > 0);
  const primaries = rows.filter(row => row.primary);
  if (primaries.length === 1) return primaries[0].id;
  if (rows.length === 1) return rows[0].id;
  if (rows.length > 1) throw fail('This clinician is assigned to more than one office. Choose the billing office for this visit.');
  return 0;
}

export async function resolveClaimMdBillingProfile(agencyId, sessionId, { required = true, requireComplete = true } = {}) {
  const [[session]] = await clinicalPool.execute(`SELECT id, provider_user_id, service_location_id, billing_office_location_id
    FROM clinical_sessions WHERE id = ? AND agency_id = ?`, [sessionId, agencyId]);
  if (!session) throw fail('The clinical session does not belong to this agency.');
  let officeId = Number(session.billing_office_location_id || 0);
  if (session.service_location_id) {
    const [[location]] = await pool.execute(`SELECT billing_office_location_id FROM agency_service_locations
      WHERE id = ? AND agency_id = ? AND is_active = 1`, [session.service_location_id, agencyId]);
    if (!location) throw fail('The session’s service location is unavailable or belongs to another agency.');
    const mappedOfficeId = Number(location.billing_office_location_id || 0);
    if (officeId && mappedOfficeId && officeId !== mappedOfficeId) throw fail('The session and service location select different billing offices. Review the location mapping.');
    officeId ||= mappedOfficeId;
  }
  // A school or telehealth site records where the visit happened. Billing still
  // comes from the office that clinician is assigned to.
  if (!officeId) officeId = await assignedBillingOfficeId(session.provider_user_id);
  if (!officeId && !required) return null;
  return getClaimMdBillingProfile(agencyId, officeId, { requireComplete });
}

// The service site is listed with its place of service. Its street is never the billing address.
export async function describeClaimServiceSite(agencyId, session) {
  const placeOfService = session?.place_of_service || null;
  if (!session?.service_location_id) return { name: null, placeOfService, serviceAddress: null, billsFromThisAddress: false };
  const [[location]] = await pool.execute(`SELECT name, place_of_service, location_kind, street_address, city, state, postal_code
    FROM agency_service_locations WHERE id = ? AND agency_id = ? AND is_active = 1`, [session.service_location_id, agencyId]);
  if (!location) return { name: null, placeOfService, serviceAddress: null, billsFromThisAddress: false };
  const serviceAddress = location.location_kind === 'office_pos' ? null : [location.street_address, location.city, location.state, location.postal_code].filter(Boolean).join(', ');
  return { name: location.name || null, placeOfService: location.place_of_service || placeOfService, locationKind: location.location_kind || null, serviceAddress: serviceAddress || null, billsFromThisAddress: false };
}

export function assertClaimBillingNpi(profile, billingNpi) {
  const allowed = new Set([profile?.billingNpi, ...(profile?.overrideNpis || [])].map(value => String(value || '')).filter(value => /^\d{10}$/.test(value)));
  if (!allowed.has(String(billingNpi || ''))) {
    throw fail('The claim billing NPI differs from its selected billing office. Select the correct billing office and NPI in Edit billing fields before approval.');
  }
}

export async function assertExclusiveClaimMdTaxId(agencyId, taxId) {
  const [candidates] = await pool.execute(`SELECT id, tax_id, tax_id_ciphertext, tax_id_iv, tax_id_auth_tag, tax_id_key_id
    FROM agencies WHERE tax_id IS NOT NULL OR tax_id_last4 = ? OR (tax_id_ciphertext IS NOT NULL AND tax_id_last4 IS NULL)`, [taxId.slice(-4)]);
  const owners = [];
  for (const row of candidates) {
    const decoded = unpackAgencyTaxId(row);
    if (row.tax_id_ciphertext && !decoded) throw fail('Tax ID ownership could not be verified. Ask an administrator to check encryption configuration.');
    if (String(decoded || '').replace(/\D/g, '') === taxId) owners.push(Number(row.id));
  }
  if (owners.length !== 1 || owners[0] !== Number(agencyId)) throw fail('This Tax ID cannot be isolated to this agency. Review ERA in Claim.MD until remittances are matched to individual claims.');
}
