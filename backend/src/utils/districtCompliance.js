/**
 * District-based compliance helpers (District 11 background expiration + school badge).
 * District labels come from free-text school_profiles.district_name.
 */
import pool from '../config/database.js';

export const D11_BACKGROUND_EXPIRATION_YEARS = 3;
export const SCHOOL_BADGE_ITEM_KEY = 'school_badge';

/** Normalize free-text district labels for matching. */
export function normalizeDistrictName(districtName) {
  return String(districtName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True for District 11 variants; false for D12, DPS, empty, and other districts.
 */
export function isDistrict11Name(districtName) {
  const n = normalizeDistrictName(districtName);
  if (!n) return false;
  if (/\bdistrict\s*12\b/.test(n) || /\bd12\b/.test(n)) return false;
  if (/\bdps\b/.test(n) || /\bdenver\s+public\s+schools?\b/.test(n)) return false;
  if (/\bdistrict\s*11\b/.test(n)) return true;
  if (/\bd11\b/.test(n)) return true;
  // Bare "11" only when clearly a district label (e.g. "11", "csd 11")
  if (/^(csd|cs|school)?\s*11$/.test(n)) return true;
  return false;
}

export function isDistrict12Name(districtName) {
  const n = normalizeDistrictName(districtName);
  if (!n) return false;
  return /\bdistrict\s*12\b/.test(n) || /\bd12\b/.test(n) || /^(csd|cs|school)?\s*12$/.test(n);
}

export function isDpsName(districtName) {
  const n = normalizeDistrictName(districtName);
  if (!n) return false;
  return /\bdps\b/.test(n) || /\bdenver\s+public\s+schools?\b/.test(n);
}

/**
 * Active school assignments → district flags for a provider.
 */
export async function listProviderDistrictFlags(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return { hasD11: false, hasD12: false, hasDps: false, schoolDistricts: [], schoolOrganizationIds: [] };
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT psa.school_organization_id AS school_id,
            sp.district_name
     FROM provider_school_assignments psa
     LEFT JOIN school_profiles sp ON sp.school_organization_id = psa.school_organization_id
     WHERE psa.provider_user_id = ?
       AND psa.is_active = 1`,
    [uid]
  );

  const schoolDistricts = [];
  const schoolOrganizationIds = [];
  let hasD11 = false;
  let hasD12 = false;
  let hasDps = false;

  for (const row of rows || []) {
    const sid = Number(row.school_id);
    if (Number.isInteger(sid) && sid > 0) schoolOrganizationIds.push(sid);
    const name = row.district_name ? String(row.district_name) : null;
    if (name) schoolDistricts.push(name);
    if (isDistrict11Name(name)) hasD11 = true;
    if (isDistrict12Name(name)) hasD12 = true;
    if (isDpsName(name)) hasDps = true;
  }

  return {
    hasD11,
    hasD12,
    hasDps,
    schoolDistricts: [...new Set(schoolDistricts)],
    schoolOrganizationIds: [...new Set(schoolOrganizationIds)],
  };
}

export async function providerHasDistrict11Assignment(userId) {
  const flags = await listProviderDistrictFlags(userId);
  return flags.hasD11;
}

export async function schoolOrganizationIsDistrict11(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId);
  if (!Number.isInteger(sid) || sid <= 0) return false;
  const [rows] = await pool.execute(
    `SELECT district_name FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
    [sid]
  );
  return isDistrict11Name(rows?.[0]?.district_name);
}
