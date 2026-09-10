/**
 * Default medical service codes + service locations for agencies with medical billing.
 * Idempotent: only inserts codes/locations that are missing.
 * Catalog aligns with ITSCO pay dictionary + SERVICE_DESCRIPTIONS (same as booking suites).
 */

import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import { buildMedicaid8MinuteBands } from './serviceCodeUnits.service.js';
import { PAYROLL_SERVICE_CODE_DEFAULTS } from './payrollServiceCodeDefaults.js';
import { ITSCO_DIRECT_SERVICE_META, ITSCO_DIRECT_BOOKABLE_CODES } from '../config/tenantServiceSuiteCatalog.js';

const TIER_INTERN = ['intern_plus'];
const TIER_BACHELORS_UP = ['bachelors', 'intern_plus'];
const TIER_ALL = ['qbha', 'bachelors', 'intern_plus'];

const LADDER_15 = new Set([
  'H0004', 'H0023', 'H0025', 'H2014', 'H2015', 'H2017', 'H2021', 'H2032', 'H2033', 'T1017', '97535'
]);

const BACHELORS_UP = new Set(['H0004', 'H0031', 'H0032', 'H2033', 'T1017']);
const INTERN_ONLY = new Set([
  '90791', '90832', '90834', '90837', '90839', '90840', '90846', '90847', '90853', '90785', '99051'
]);

function buildDefaultMedicalServiceCodes() {
  const out = [];

  // Explicit overflow ladder for psychotherapy (keeps prior Claim.MD behavior).
  const psychotherapy = [
    {
      serviceCode: '90832',
      description: 'Psychotherapy, 30 minutes',
      unitCalcMode: 'SINGLE',
      minMinutes: 16,
      maxMinutes: 37,
      overflowServiceCode: '90834',
      overflowAtMinutes: 38,
      allowedCredentialTiers: TIER_INTERN
    },
    {
      serviceCode: '90834',
      description: 'Psychotherapy, 45 minutes',
      unitCalcMode: 'SINGLE',
      minMinutes: 38,
      maxMinutes: 52,
      overflowServiceCode: '90837',
      overflowAtMinutes: 53,
      allowedCredentialTiers: TIER_INTERN
    },
    {
      serviceCode: '90837',
      description: 'Psychotherapy, 60 minutes',
      unitCalcMode: 'SINGLE',
      minMinutes: 53,
      maxMinutes: null,
      overflowServiceCode: null,
      overflowAtMinutes: null,
      allowedCredentialTiers: TIER_INTERN
    }
  ];
  out.push(...psychotherapy);
  const have = new Set(psychotherapy.map((r) => r.serviceCode));

  for (const raw of ITSCO_DIRECT_BOOKABLE_CODES) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code || have.has(code)) continue;
    // Skip non-claim named pay codes from medical fee schedule seed.
    if (code === 'PRO-BONO SERVICE') continue;

    const meta = ITSCO_DIRECT_SERVICE_META[code] || {};
    const payroll = PAYROLL_SERVICE_CODE_DEFAULTS.get(code);
    const isLadder = LADDER_15.has(code);
    let allowedCredentialTiers = TIER_ALL;
    if (INTERN_ONLY.has(code)) allowedCredentialTiers = TIER_INTERN;
    else if (BACHELORS_UP.has(code)) allowedCredentialTiers = TIER_BACHELORS_UP;

    out.push({
      serviceCode: code,
      description: meta.description || meta.name || code,
      unitCalcMode: isLadder ? 'MEDICAID_8_MINUTE_LADDER' : 'SINGLE',
      unitMinutes: isLadder ? 15 : null,
      minMinutes: isLadder ? 8 : (code === '90846' || code === '90847' ? 26 : (code === '90853' ? 45 : null)),
      maxMinutes: null,
      maxUnitsPerSession: isLadder ? 8 : null,
      maxUnitsPerDay: null,
      overflowServiceCode: null,
      overflowAtMinutes: null,
      defaultPlaceOfService: null,
      allowedCredentialTiers,
      // Hint duration from payroll when useful for UI
      defaultDurationMinutes: Number(payroll?.durationMinutes || 0) || null
    });
    have.add(code);
  }

  // Agency medical claim rules (not payroll): day caps + day-code overflow.
  const patchByCode = new Map(out.map((r) => [r.serviceCode, r]));
  if (patchByCode.has('H0004')) {
    Object.assign(patchByCode.get('H0004'), {
      maxUnitsPerSession: 4,
      maxUnitsPerDay: 4,
      description: patchByCode.get('H0004').description
        || 'Behavioral health counseling and therapy (max 4 units / day)'
    });
  }
  // H2015 (15-min community support) → H2016 day code at 4h 8m (248 min).
  // Below that, H2015 bills the 8-minute ladder; at/above 248 min bill H2016 × 1.
  if (patchByCode.has('H2015')) {
    Object.assign(patchByCode.get('H2015'), {
      maxMinutes: 247,
      maxUnitsPerSession: 16,
      maxUnitsPerDay: 16,
      overflowServiceCode: 'H2016',
      overflowAtMinutes: 248
    });
  }
  if (patchByCode.has('H2016')) {
    Object.assign(patchByCode.get('H2016'), {
      unitCalcMode: 'SINGLE',
      unitMinutes: null,
      minMinutes: 248,
      maxMinutes: null,
      maxUnitsPerSession: 1,
      maxUnitsPerDay: 1,
      overflowServiceCode: null,
      overflowAtMinutes: null,
      description: 'Comprehensive community support (day) — 1 unit when duration ≥ 4 hours 8 minutes'
    });
  }
  // Cap 90837 before extended-encounter handling in Note Aid (75+ → 90834 ×2).
  if (patchByCode.has('90837')) {
    Object.assign(patchByCode.get('90837'), {
      maxMinutes: 74
    });
  }

  return out;
}

/** Core psychotherapy + full ITSCO direct behavioral health set. */
export const DEFAULT_MEDICAL_SERVICE_CODES = buildDefaultMedicalServiceCodes();

const DEFAULT_LOCATIONS = [
  { name: 'Telehealth', placeOfService: '02', notes: 'Telehealth other than patient home' },
  { name: 'Telehealth — patient home', placeOfService: '10', notes: 'Patient at home' },
  { name: 'Office', placeOfService: '11', notes: 'In-person office visit' },
  { name: "Patient's Residence", placeOfService: '12', notes: 'In-person at patient residence (POS 12)' }
];

function tierAllows(allowedTiers, providerTier) {
  if (!allowedTiers || !allowedTiers.length) return true;
  const t = String(providerTier || '').trim().toLowerCase();
  if (!t || t === 'unknown') return true; // don't hide codes when tier unknown
  if (t === 'intern_plus') return allowedTiers.includes('intern_plus');
  return allowedTiers.includes(t);
}

export function parseAllowedCredentialTiers(raw) {
  if (!raw) return null;
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
}

/** Patch only when critical claim-duration fields are still unset on an existing row. */
function shouldPatchMedicalCodeDefaults(existing, def) {
  if (!existing || !def) return false;
  const code = String(def.serviceCode || '').toUpperCase();
  if (code === 'H0004') {
    return existing.max_units_per_day == null || existing.max_units_per_session == null;
  }
  if (code === 'H2015') {
    return !existing.overflow_service_code || existing.overflow_at_minutes == null || existing.max_minutes == null;
  }
  if (code === 'H2016') {
    return existing.min_minutes == null || Number(existing.min_minutes) < 248;
  }
  if (code === '90837') {
    return existing.max_minutes == null;
  }
  return false;
}

export async function ensureAgencyMedicalBillingDefaults(agencyId, { actorUserId = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { codesCreated: 0, locationsCreated: 0 };

  let codesCreated = 0;
  let locationsCreated = 0;

  const existingCodes = await AgencyMedicalServiceCode.listByAgency(aid, { includeInactive: true }).catch(() => []);
  const haveCode = new Set((existingCodes || []).map((r) => String(r.service_code || '').toUpperCase()));

  for (const def of DEFAULT_MEDICAL_SERVICE_CODES) {
    const code = String(def.serviceCode).toUpperCase();
    if (haveCode.has(code)) {
      const existing = (existingCodes || []).find((r) => String(r.service_code || '').toUpperCase() === code);
      if (existing && shouldPatchMedicalCodeDefaults(existing, def)) {
        let ladderBandsJson = existing.ladder_bands_json || null;
        if (!ladderBandsJson && (existing.unit_calc_mode || def.unitCalcMode) === 'MEDICAID_8_MINUTE_LADDER') {
          ladderBandsJson = buildMedicaid8MinuteBands({
            unitMinutes: existing.unit_minutes || def.unitMinutes || 15,
            maxUnits: existing.max_units_per_session || def.maxUnitsPerSession || 8,
            minMinutes: existing.min_minutes || def.minMinutes || 8
          });
        }
        await AgencyMedicalServiceCode.upsert({
          agencyId: aid,
          serviceCode: code,
          description: existing.description || def.description,
          unitCalcMode: def.unitCalcMode || existing.unit_calc_mode,
          unitMinutes: def.unitMinutes ?? existing.unit_minutes ?? null,
          minMinutes: def.minMinutes ?? existing.min_minutes ?? null,
          maxMinutes: def.maxMinutes ?? existing.max_minutes ?? null,
          maxUnitsPerSession: def.maxUnitsPerSession ?? existing.max_units_per_session ?? null,
          maxUnitsPerDay: def.maxUnitsPerDay ?? existing.max_units_per_day ?? null,
          ladderBandsJson,
          overflowServiceCode: def.overflowServiceCode || existing.overflow_service_code || null,
          overflowAtMinutes: def.overflowAtMinutes ?? existing.overflow_at_minutes ?? null,
          defaultPlaceOfService: existing.default_place_of_service || def.defaultPlaceOfService || null,
          allowedCredentialTiers: parseAllowedCredentialTiers(existing.allowed_credential_tiers_json)
            || def.allowedCredentialTiers
            || null,
          isActive: existing.is_active !== 0,
          createdByUserId: actorUserId
        });
      }
      continue;
    }
    let ladderBandsJson = null;
    if (def.unitCalcMode === 'MEDICAID_8_MINUTE_LADDER') {
      ladderBandsJson = buildMedicaid8MinuteBands({
        unitMinutes: def.unitMinutes || 15,
        maxUnits: def.maxUnitsPerSession || 8,
        minMinutes: def.minMinutes || 8
      });
    }
    await AgencyMedicalServiceCode.upsert({
      agencyId: aid,
      serviceCode: code,
      description: def.description,
      unitCalcMode: def.unitCalcMode,
      unitMinutes: def.unitMinutes ?? null,
      minMinutes: def.minMinutes ?? null,
      maxMinutes: def.maxMinutes ?? null,
      maxUnitsPerSession: def.maxUnitsPerSession ?? null,
      maxUnitsPerDay: def.maxUnitsPerDay ?? null,
      ladderBandsJson,
      overflowServiceCode: def.overflowServiceCode || null,
      overflowAtMinutes: def.overflowAtMinutes ?? null,
      defaultPlaceOfService: def.defaultPlaceOfService || null,
      allowedCredentialTiers: def.allowedCredentialTiers || null,
      isActive: true,
      createdByUserId: actorUserId
    });
    codesCreated += 1;
    haveCode.add(code);
  }

  const existingLocs = await AgencyServiceLocation.listByAgency(aid, { includeInactive: true }).catch(() => []);
  const haveLocKey = new Set(
    (existingLocs || []).map((r) => `${String(r.name || '').trim().toLowerCase()}|${String(r.place_of_service || '')}`)
  );

  let billingOfficeId = null;
  try {
    const offices = await OfficeLocation.findByAgencyMembership(aid, { includeInactive: false }).catch(() =>
      OfficeLocation.findByAgency(aid, { includeInactive: false })
    );
    billingOfficeId = Number(offices?.[0]?.id || 0) || null;
  } catch {
    billingOfficeId = null;
  }

  for (const loc of DEFAULT_LOCATIONS) {
    const key = `${loc.name.trim().toLowerCase()}|${loc.placeOfService}`;
    if (haveLocKey.has(key)) continue;
    await AgencyServiceLocation.create({
      agencyId: aid,
      name: loc.name,
      placeOfService: loc.placeOfService,
      notes: loc.notes,
      requiresCredentialing: false,
      billingOfficeLocationId: loc.placeOfService === '11' ? billingOfficeId : billingOfficeId,
      createdByUserId: actorUserId
    });
    locationsCreated += 1;
    haveLocKey.add(key);
  }

  return { codesCreated, locationsCreated };
}

export function filterCodesForProviderTier(codeRows, providerTier) {
  return (codeRows || []).filter((row) => {
    const allowed = parseAllowedCredentialTiers(
      row.allowed_credential_tiers_json ?? row.allowedCredentialTiers ?? null
    );
    return tierAllows(allowed, providerTier);
  });
}
