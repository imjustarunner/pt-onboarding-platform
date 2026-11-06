import pool from '../config/database.js';
import { getClinicalServiceReference } from './clinicalServiceReference.service.js';
import { resolvePolicyRuleForServiceCode, isServiceCodeEnabledForAgency } from './billingPolicy.service.js';
import { isServiceCodeDeniedForTier } from '../utils/clinicalServiceCodeEligibility.js';
import { defaultClinicalNoteType, isClinicalAddon } from '../utils/clinicalServiceCodeCatalog.js';

function tiersFor(row) {
  const raw = row.allowed_credential_tiers_json;
  if (!raw) return null;
  const tiers = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(tiers) ? tiers.map(t => String(t).trim().toLowerCase()) : [];
}

/** The agency medical catalog and its approved policy are authoritative even
 * when an older global dictionary was not synchronized. No reads mutate policy.
 * Explicit global, agency, credential and add-on restrictions still win. */
export async function resolveAgencySchedulingCatalog({ agencyId, credentialTier, allServiceCodes, eligibleServiceCodes }) {
  const withReference = row => ({ ...row, serviceInfo: getClinicalServiceReference(row.code) });
  const baseAll = allServiceCodes.filter(row => !isClinicalAddon(row.code, row)).map(withReference);
  const baseEligible = eligibleServiceCodes.filter(row => !isClinicalAddon(row.code, row)).map(withReference);
  if (!Number(agencyId)) return { allServiceCodes: baseAll, eligibleServiceCodes: baseEligible };
  let rows;
  try {
    [rows] = await pool.execute(`SELECT m.*, s.is_active AS scheduling_is_active,
        e.allowed AS scheduling_tier_allowed
      FROM agency_medical_service_codes m
      LEFT JOIN scheduling_service_codes s ON s.code = m.service_code
      LEFT JOIN credential_service_code_eligibility e
        ON e.service_code = m.service_code AND e.credential_tier = ?
      WHERE m.agency_id = ?`, [credentialTier, Number(agencyId)]);
  } catch (error) {
    throw Object.assign(new Error('The agency service catalog could not be verified. Please retry before scheduling.'), {
      status: 503, code: 'SERVICE_CATALOG_UNAVAILABLE', cause: error
    });
  }
  const all = new Map(baseAll.map(row => [row.code, row]));
  const eligible = new Map(baseEligible.map(row => [row.code, row]));
  for (const medical of rows || []) {
    const code = String(medical.service_code || '').trim().toUpperCase();
    if (!code) continue;
    if (!Number(medical.is_active) || isClinicalAddon(code, medical)
        || (medical.scheduling_is_active != null && !Number(medical.scheduling_is_active))
        || !await isServiceCodeEnabledForAgency({ agencyId, serviceCode: code })) {
      all.delete(code); eligible.delete(code); continue;
    }
    const policy = await resolvePolicyRuleForServiceCode({ agencyId, serviceCode: code, credentialTier });
    const row = {
      ...all.get(code), code, label: medical.description || all.get(code)?.label || code,
      isBillable: true, defaultNoteType: all.get(code)?.defaultNoteType || defaultClinicalNoteType(code),
      minDurationMinutes: Math.max(Number(policy?.minMinutes) || 0, Number(medical.min_minutes) || 0,
        Number(eligible.get(code)?.minDurationMinutes) || 0, Number(all.get(code)?.minDurationMinutes) || 0) || null,
      maxDurationMinutes: policy?.maxMinutes || Number(medical.max_minutes) || null,
      unitMinutes: policy?.unitMinutes || Number(medical.unit_minutes) || null,
      unitCalcMode: policy?.unitCalcMode || medical.unit_calc_mode || null,
      maxUnitsPerDay: policy?.maxUnitsPerDay || Number(medical.max_units_per_day) || null,
      policyProfileId: policy?.policyProfileId || null,
      sessionMode: medical.session_mode || 'either',
      serviceInfo: getClinicalServiceReference(code)
    };
    all.set(code, row);
    const tiers = tiersFor(medical);
    const explicitPolicy = policy?.eligibilityRows?.some(r => r.credential_tier === credentialTier && Number(r.allowed) === 1);
    const denied = isServiceCodeDeniedForTier(credentialTier, code)
      || (medical.scheduling_tier_allowed != null && !Number(medical.scheduling_tier_allowed))
      || (tiers !== null && !tiers.includes(credentialTier))
      || (policy && (!policy.enabledForAgency || !policy.allowedForCredentialTier));
    const allowed = eligible.has(code) || tiers?.includes(credentialTier) || explicitPolicy;
    if (!denied && allowed) eligible.set(code, row);
    else eligible.delete(code);
  }
  return { allServiceCodes: [...all.values()].sort((a, b) => a.code.localeCompare(b.code)),
    eligibleServiceCodes: [...eligible.values()].sort((a, b) => a.code.localeCompare(b.code)) };
}
