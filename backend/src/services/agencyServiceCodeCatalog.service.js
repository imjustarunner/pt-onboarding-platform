/**
 * Unified agency service-code catalog across:
 *  - payroll_service_code_rules  (pay math / rate sheets)
 *  - agency_medical_service_codes (claim units / billing)
 *  - tenant_services.service_code (bookable mental health / healthcare)
 *
 * Payroll-only codes (mileage, admin, meetings, bonuses, …) stay in payroll.
 * Clinical/direct CPT–HCPCS codes are mirrored into medical + booking suites.
 * Deleting a shared code in any surface removes it from the others.
 */

import pool from '../config/database.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import TenantService from '../models/TenantService.model.js';
import {
  PAYROLL_SERVICE_CODE_DEFAULTS,
  payrollDefaultsForCode
} from './payrollServiceCodeDefaults.js';
import {
  ITSCO_DIRECT_BOOKABLE_CODES,
  ITSCO_DIRECT_SERVICE_META
} from '../config/tenantServiceSuiteCatalog.js';
import { DEFAULT_MEDICAL_SERVICE_CODES } from './medicalBillingDefaults.service.js';
import { buildMedicaid8MinuteBands } from './serviceCodeUnits.service.js';

const CLINICAL_BOOKABLE = new Set(
  ITSCO_DIRECT_BOOKABLE_CODES.map((c) => String(c).trim().toUpperCase())
);

/** CPT / HCPCS-shaped codes that belong on clinical booking + medical billing. */
const CLINICAL_CODE_RE = /^(?:\d{4,5}|[A-Z]\d{4}|[A-Z]{1,2}\d{3,4})$/;

const PAYROLL_ONLY_CATEGORIES = new Set([
  'admin',
  'meeting',
  'mileage',
  'bonus',
  'reimbursement',
  'other_pay',
  'indirect',
  'tutoring'
]);

/** In-flight guards to prevent recursive sync loops. */
const inFlight = new Set();

function lockKey(agencyId, code, action) {
  return `${Number(agencyId)}:${String(code || '').toUpperCase()}:${action}`;
}

function withLock(agencyId, code, action, fn) {
  const key = lockKey(agencyId, code, action);
  if (inFlight.has(key)) return Promise.resolve(null);
  inFlight.add(key);
  return Promise.resolve()
    .then(fn)
    .finally(() => inFlight.delete(key));
}

export function normalizeServiceCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function isClinicalBookableCode(code, { category = null } = {}) {
  const c = normalizeServiceCode(code);
  if (!c) return false;
  if (CLINICAL_BOOKABLE.has(c)) return true;
  if (c === 'TUTORING' || c === 'PRO-BONO SERVICE') return true;
  const cat = String(category || payrollDefaultsForCode(c)?.category || '').toLowerCase();
  if (PAYROLL_ONLY_CATEGORIES.has(cat) && c !== 'TUTORING') return false;
  if (cat === 'direct' && CLINICAL_CODE_RE.test(c)) return true;
  return false;
}

function medicalDefForCode(code) {
  const c = normalizeServiceCode(code);
  return DEFAULT_MEDICAL_SERVICE_CODES.find((d) => normalizeServiceCode(d.serviceCode) === c) || null;
}

function tenantMetaForCode(code) {
  const c = normalizeServiceCode(code);
  const meta = ITSCO_DIRECT_SERVICE_META[c] || {};
  const payroll = payrollDefaultsForCode(c);
  const mins = Number(payroll?.durationMinutes || 0);
  return {
    name: meta.name || c,
    description: meta.description || `Service code ${c}`,
    defaultDurationMinutes: mins >= 5 ? Math.min(480, mins) : (mins === 1 ? 15 : 60),
    allowsIndividual: meta.allowsIndividual !== false,
    allowsGroup: meta.allowsGroup === true,
    maxParticipants: meta.maxParticipants ?? null,
    packageEligible: meta.packageEligible !== false,
    billingMethod: meta.billingMethod || 'self_pay'
  };
}

/** Seed every ITSCO/platform payroll dictionary code for the agency (INSERT IGNORE). */
export async function ensureAgencyPayrollDictionary(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return { inserted: 0 };
  const codes = Array.from(PAYROLL_SERVICE_CODE_DEFAULTS.keys());
  if (!codes.length) return { inserted: 0 };

  const existing = await PayrollServiceCodeRule.listForAgency(aid);
  const have = new Set((existing || []).map((r) => normalizeServiceCode(r.service_code)));
  let inserted = 0;
  for (const code of codes) {
    if (have.has(code)) continue;
    const d = payrollDefaultsForCode(code);
    await PayrollServiceCodeRule.upsert({
      agencyId: aid,
      serviceCode: code,
      category: d?.category || 'direct',
      otherSlot: Number.isFinite(Number(d?.otherSlot)) ? Number(d.otherSlot) : 1,
      unitToHourMultiplier: 1,
      countsForTier: 1,
      durationMinutes: d?.durationMinutes ?? null,
      tierCreditMultiplier: 1,
      payDivisor: Number.isFinite(Number(d?.payDivisor)) ? Number(d.payDivisor) : 1,
      payRateUnit: Number(d?.durationMinutes) === 0 ? 'per_unit' : 'per_unit',
      creditValue: Number.isFinite(Number(d?.creditValue)) ? Number(d.creditValue) : 0,
      showInRateSheet: 1
    });
    inserted += 1;
    have.add(code);
  }
  return { inserted };
}

async function ensureMedicalCode(agencyId, code, { actorUserId = null } = {}) {
  const c = normalizeServiceCode(code);
  if (!c || !isClinicalBookableCode(c)) return null;
  const def = medicalDefForCode(c);
  const meta = tenantMetaForCode(c);
  let ladderBandsJson = null;
  const unitCalcMode = def?.unitCalcMode || 'SINGLE';
  if (unitCalcMode === 'MEDICAID_8_MINUTE_LADDER') {
    ladderBandsJson = buildMedicaid8MinuteBands({
      unitMinutes: def?.unitMinutes || 15,
      maxUnits: def?.maxUnitsPerSession || 8,
      minMinutes: def?.minMinutes || 8
    });
  }
  return AgencyMedicalServiceCode.upsert({
    agencyId,
    serviceCode: c,
    description: def?.description || meta.description || meta.name,
    unitCalcMode,
    unitMinutes: def?.unitMinutes ?? null,
    minMinutes: def?.minMinutes ?? null,
    maxMinutes: def?.maxMinutes ?? null,
    maxUnitsPerSession: def?.maxUnitsPerSession ?? null,
    maxUnitsPerDay: def?.maxUnitsPerDay ?? null,
    ladderBandsJson,
    overflowServiceCode: def?.overflowServiceCode || null,
    overflowAtMinutes: def?.overflowAtMinutes ?? null,
    defaultPlaceOfService: def?.defaultPlaceOfService || null,
    allowedCredentialTiers: def?.allowedCredentialTiers || null,
    isActive: true,
    createdByUserId: actorUserId
  });
}

async function ensureTenantServiceForCode(agencyId, code, { businessType = 'mental_health' } = {}) {
  const c = normalizeServiceCode(code);
  if (!c || !isClinicalBookableCode(c)) return null;
  // Tutoring pay code lives on tutoring suite, not mental health.
  const bt = c === 'TUTORING' ? 'tutoring' : businessType;

  const existing = await TenantService.listForAgency(agencyId, { includeInactive: true });
  const sameCode = (existing || []).filter(
    (s) => normalizeServiceCode(s.serviceCode) === c && String(s.businessType) === bt
  );
  const active = sameCode.find((s) => s.isActive);
  if (active) return active;

  // Reactivate an inactive match instead of creating a duplicate.
  const inactive = sameCode.find((s) => !s.isActive);
  const meta = tenantMetaForCode(c);
  if (inactive) {
    return TenantService.update(inactive.id, agencyId, {
      ...meta,
      serviceCode: c,
      businessType: bt,
      isActive: true,
      isStaffBookable: true
    });
  }

  // Prefer matching by name from catalog to avoid duplicate names without codes.
  const byName = (existing || []).find(
    (s) => String(s.businessType) === bt
      && String(s.name || '').trim().toLowerCase() === String(meta.name).trim().toLowerCase()
  );
  if (byName) {
    return TenantService.update(byName.id, agencyId, {
      serviceCode: c,
      isActive: true,
      description: byName.description || meta.description
    });
  }

  return TenantService.create(agencyId, {
    ...meta,
    serviceCode: c,
    businessType: bt,
    modality: 'EITHER',
    isStaffBookable: true,
    isPubliclyBookable: false,
    sortOrder: 0
  });
}

async function ensurePayrollRule(agencyId, code) {
  const c = normalizeServiceCode(code);
  if (!c) return;
  const rows = await PayrollServiceCodeRule.listForAgency(agencyId);
  if ((rows || []).some((r) => normalizeServiceCode(r.service_code) === c)) return;
  const d = payrollDefaultsForCode(c);
  await PayrollServiceCodeRule.upsert({
    agencyId,
    serviceCode: c,
    category: d?.category || 'direct',
    otherSlot: Number.isFinite(Number(d?.otherSlot)) ? Number(d.otherSlot) : 1,
    durationMinutes: d?.durationMinutes ?? null,
    payDivisor: Number.isFinite(Number(d?.payDivisor)) ? Number(d.payDivisor) : 1,
    creditValue: Number.isFinite(Number(d?.creditValue)) ? Number(d.creditValue) : 0,
    countsForTier: 1,
    showInRateSheet: 1
  });
}

/**
 * Ensure a clinical code exists in payroll + medical + tenant booking (no duplicates).
 */
export async function syncClinicalCodePresent(agencyId, serviceCode, { actorUserId = null, businessType = 'mental_health' } = {}) {
  const aid = Number(agencyId || 0);
  const code = normalizeServiceCode(serviceCode);
  if (!aid || !code || !isClinicalBookableCode(code)) return null;

  return withLock(aid, code, 'present', async () => {
    await ensurePayrollRule(aid, code);
    await ensureMedicalCode(aid, code, { actorUserId });
    await ensureTenantServiceForCode(aid, code, { businessType: code === 'TUTORING' ? 'tutoring' : businessType });
    return { agencyId: aid, serviceCode: code };
  });
}

/**
 * Remove a code from payroll dictionary, medical fee schedule, and tenant services.
 * Payroll-only codes only clear payroll (+ rates). Clinical codes clear all three.
 */
export async function removeServiceCodeEverywhere(
  agencyId,
  serviceCode,
  {
    skipPayroll = false,
    skipMedical = false,
    skipTenant = false,
    forceAllSurfaces = false
  } = {}
) {
  const aid = Number(agencyId || 0);
  const code = normalizeServiceCode(serviceCode);
  if (!aid || !code) return { removed: false };

  return withLock(aid, code, 'remove', async () => {
    const clinical = forceAllSurfaces || isClinicalBookableCode(code);

    if (!skipPayroll) {
      await PayrollServiceCodeRule.delete({ agencyId: aid, serviceCode: code });
      await pool.execute(
        `DELETE FROM payroll_rates WHERE agency_id = ? AND service_code = ?`,
        [aid, code]
      ).catch(() => null);
    }

    if (clinical && !skipMedical) {
      await AgencyMedicalServiceCode.upsert({
        agencyId: aid,
        serviceCode: code,
        description: code,
        isActive: false
      }).catch(() => null);
    }

    if (clinical && !skipTenant) {
      const services = await TenantService.listForAgency(aid, { includeInactive: true });
      for (const svc of services || []) {
        if (normalizeServiceCode(svc.serviceCode) !== code) continue;
        if (svc.isActive) await TenantService.softDelete(svc.id, aid);
      }
    }

    return { removed: true, serviceCode: code, clinical };
  });
}

/**
 * Full reconcile for an agency:
 *  - seed complete payroll dictionary
 *  - mirror every clinical code into medical + tenant services
 *  - ensure clinical medical/tenant codes exist in payroll
 *  - dedupe active tenant_services by (business_type, service_code)
 */
export async function reconcileAgencyServiceCodeCatalog(agencyId, { actorUserId = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    return { payrollInserted: 0, clinicalSynced: 0, dedupedTenant: 0 };
  }

  const { inserted: payrollInserted } = await ensureAgencyPayrollDictionary(aid);

  const payrollRows = await PayrollServiceCodeRule.listForAgency(aid);
  let clinicalSynced = 0;
  for (const row of payrollRows || []) {
    const code = normalizeServiceCode(row.service_code);
    if (!isClinicalBookableCode(code, { category: row.category })) continue;
    await syncClinicalCodePresent(aid, code, { actorUserId });
    clinicalSynced += 1;
  }

  // Pull clinical codes from medical / tenant that might not be in payroll yet.
  try {
    const medical = await AgencyMedicalServiceCode.listByAgency(aid, { includeInactive: false });
    for (const row of medical || []) {
      const code = normalizeServiceCode(row.service_code);
      if (!isClinicalBookableCode(code)) continue;
      await syncClinicalCodePresent(aid, code, { actorUserId });
    }
  } catch {
    /* optional */
  }

  try {
    const tenant = await TenantService.listForAgency(aid, { includeInactive: false });
    for (const svc of tenant || []) {
      const code = normalizeServiceCode(svc.serviceCode);
      if (!code || !isClinicalBookableCode(code)) continue;
      await syncClinicalCodePresent(aid, code, {
        actorUserId,
        businessType: svc.businessType || 'mental_health'
      });
    }
  } catch {
    /* optional */
  }

  // Dedupe active tenant services sharing the same business_type + service_code.
  let dedupedTenant = 0;
  try {
    const [dupes] = await pool.execute(
      `SELECT business_type, UPPER(TRIM(service_code)) AS code, MIN(id) AS keep_id, COUNT(*) AS cnt
       FROM tenant_services
       WHERE agency_id = ? AND is_active = 1 AND service_code IS NOT NULL AND TRIM(service_code) <> ''
       GROUP BY business_type, UPPER(TRIM(service_code))
       HAVING cnt > 1`,
      [aid]
    );
    for (const row of dupes || []) {
      const [result] = await pool.execute(
        `UPDATE tenant_services
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?
           AND business_type = ?
           AND UPPER(TRIM(service_code)) = ?
           AND is_active = 1
           AND id <> ?`,
        [aid, row.business_type, row.code, Number(row.keep_id)]
      );
      dedupedTenant += Number(result?.affectedRows || 0);
    }
  } catch {
    /* service_code column may be missing pre-migration */
  }

  return { payrollInserted, clinicalSynced, dedupedTenant };
}
