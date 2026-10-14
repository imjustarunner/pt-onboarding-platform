import pool from '../config/database.js';

const fields = ['provider_identity_npi_number', 'npi_number', 'provider_npi_number', 'provider_npi', 'npi'];
export async function providerBillingNpi({ agencyId, userId, coreNpi = null }, db = pool) {
  const [rows] = await db.execute(`SELECT d.field_key, d.agency_id, v.value
    FROM user_info_values v JOIN user_info_field_definitions d ON d.id = v.field_definition_id
    JOIN user_agencies ua ON ua.user_id = v.user_id AND ua.agency_id = ? AND ua.is_active = 1
    WHERE v.user_id = ? AND (d.agency_id = ? OR d.agency_id IS NULL)
      AND d.field_key IN ('provider_identity_npi_number','npi_number','provider_npi_number','provider_npi','npi')`,
  [agencyId, userId, agencyId]);
  const candidates = rows.filter(r => fields.includes(r.field_key) && String(r.value || '').trim());
  // Prefer this agency's saved credentialing fields, then shared definitions.
  candidates.sort((a, b) => Number(Number(b.agency_id) === Number(agencyId)) - Number(Number(a.agency_id) === Number(agencyId))
    || fields.indexOf(a.field_key) - fields.indexOf(b.field_key));
  const selected = candidates[0];
  const npi = String(selected?.value || coreNpi || '').trim();
  if (selected) {
    const peers = candidates.filter(r => String(r.agency_id) === String(selected.agency_id) && r.field_key === selected.field_key);
    if (peers.some(r => String(r.value).trim() !== npi)) throw Object.assign(new Error('Conflicting provider NPIs in credentialing. Review the provider record.'), { status: 409 });
  }
  return npi || null;
}
