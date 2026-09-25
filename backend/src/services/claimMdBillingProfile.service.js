import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Agency from '../models/Agency.model.js';
import { unpackAgencyTaxId } from './agencyTaxId.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

// An office's clinical visibility/shared scheduling access does not grant use of
// another tenant's legal billing identity. Only agency-owned offices qualify.
export async function listClaimMdBillingProfiles(agencyId) {
  const [rows] = await pool.execute(`SELECT id, name, practice_name, practice_npi, street_address, city, state, postal_code
    FROM office_locations WHERE agency_id = ? AND is_active = 1 AND use_as_billing_address = 1 ORDER BY name, id`, [agencyId]);
  return rows;
}

export async function getClaimMdBillingProfile(agencyId, officeId, { requireComplete = true } = {}) {
  if (!Number.isSafeInteger(Number(officeId)) || Number(officeId) < 1) throw fail('Select a billing office for this agency.');
  const [[office]] = await pool.execute(`SELECT id, agency_id, name, practice_name, practice_npi, street_address, city, state, postal_code, phone
    FROM office_locations WHERE id = ? AND agency_id = ? AND is_active = 1 AND use_as_billing_address = 1`, [officeId, agencyId]);
  if (!office) throw fail('The billing office is unavailable or belongs to another agency.');
  if (requireComplete && !/^\d{10}$/.test(String(office.practice_npi || ''))) throw fail('Save the billing office’s group NPI before using Claim.MD.');
  const agency = await Agency.findById(agencyId);
  if (!agency) throw fail('Agency not found.');
  // Tax identity remains agency-specific; never copy it from a shared office.
  const practice = {
    name: office.practice_name, phone_number: office.phone || agency.phone_number,
    street_address: office.street_address, city: office.city, state: office.state, postal_code: office.postal_code,
    tax_id: agency.tax_id, tax_id_type: agency.tax_id_type
  };
  const missing = ['name', 'phone_number', 'street_address', 'city', 'state', 'postal_code'].filter(k => !String(practice[k] || '').trim());
  if (requireComplete && missing.length) throw fail(`Complete the billing office profile: ${missing.join(', ')}.`);
  return { officeId: Number(office.id), officeName: office.name, billingNpi: String(office.practice_npi || ''), practice };
}

export async function resolveClaimMdBillingProfile(agencyId, sessionId, { required = true, requireComplete = true } = {}) {
  const [[session]] = await clinicalPool.execute(`SELECT id, service_location_id, billing_office_location_id
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
  if (!officeId && !required) return null;
  return getClaimMdBillingProfile(agencyId, officeId, { requireComplete });
}

export function assertClaimBillingNpi(profile, billingNpi) {
  if (String(billingNpi || '') !== profile.billingNpi) {
    throw fail('The claim billing NPI differs from its selected billing office. Correct the billing NPI or the session’s billing office before approval.');
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
