import pool from '../config/database.js';
import { ageYearsFromDob } from '../utils/intakeShowIf.js';
import { providerServesAgeBucket } from '../utils/ageMatch.util.js';

function mapProviderRow(row = {}, { ageYears = null } = {}) {
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const name = `${first} ${last}`.trim() || 'Provider';
  const openSlots = Number(row.open_slots || 0);
  const ageGroups = parseAgeGroups(row.age_specialty);
  const bucket = bucketFromYears(ageYears);
  const servesAge = bucket ? providerServesAgeBucket(ageGroups, bucket) : true;
  return {
    id: Number(row.id),
    firstName: first,
    lastName: last,
    name,
    displayName: name,
    title: String(row.title || '').trim() || null,
    credential: String(row.credential || '').trim() || null,
    acceptingNewClients: row.accepting == null ? true : Number(row.accepting) === 1,
    inOfficeAvailable: Number(row.in_office_available || 0) === 1,
    openSlots,
    waitlist: openSlots <= 0,
    ageSpecialty: ageGroups,
    servesAge,
    ageMatch: servesAge && !!bucket
  };
}

function parseAgeGroups(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v || '').trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return text.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
}

function bucketFromYears(years) {
  const n = Number(years);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 5) return 'Toddler (0-5)';
  if (n <= 10) return 'Children (6-10)';
  if (n <= 13) return 'Preteen (11-13)';
  if (n <= 18) return 'Teen (14-18)';
  if (n >= 65) return 'Seniors (65+)';
  return 'Adults (18+)';
}

function youngestAge(ages = []) {
  const nums = (Array.isArray(ages) ? ages : String(ages || '').split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 120);
  if (!nums.length) return null;
  return Math.min(...nums);
}

async function loadAgeSpecialtyMap(userIds = []) {
  const ids = userIds.map((id) => Number(id)).filter(Boolean);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT uiv.user_id, uiv.value
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
        WHERE uiv.user_id IN (${placeholders})
          AND uifd.field_key IN ('age_specialty', 'provider_marketing_age_specialty')`,
      ids
    );
    const map = new Map();
    for (const row of rows || []) {
      const id = Number(row.user_id);
      if (!map.has(id)) map.set(id, row.value);
    }
    return map;
  } catch {
    return new Map();
  }
}

const ROLE_CLAUSE = `
  (
    LOWER(COALESCE(u.role, '')) IN (
      'provider', 'provider_plus', 'intern', 'supervisor', 'counselor',
      'therapist', 'coach', 'employee', 'admin', 'super_admin'
    )
    OR LOWER(COALESCE(ua.role, '')) IN ('provider', 'counselor', 'coach', 'therapist', 'intern')
  )
`;

const ACTIVE_CLAUSE = `
  COALESCE(u.is_active, 1) = 1
  AND (u.is_archived IS NULL OR u.is_archived = FALSE)
`;

/**
 * Office intake provider list: globally available clinicians (users.provider_accepting_new_clients),
 * with open in-office slots first. Zero-slot rows are waitlist. When a child age is known,
 * providers whose age specialty includes that band sort first.
 */
export async function listOfficeIntakeProviders(agencyId, { ages = [] } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const ageYears = youngestAge(ages);

  const queries = [
    `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
            COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
            COALESCE(u.in_office_available, 0) AS in_office_available,
            COALESCE(slot.open_slots, 0) AS open_slots
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       LEFT JOIN (
         SELECT provider_id, COUNT(*) AS open_slots
           FROM provider_in_office_availability
          WHERE is_available = 1
          GROUP BY provider_id
       ) slot ON slot.provider_id = u.id
      WHERE ${ACTIVE_CLAUSE}
        AND COALESCE(ua.is_active, 1) = 1
        AND COALESCE(u.provider_accepting_new_clients, 1) = 1
        AND ${ROLE_CLAUSE}
      ORDER BY open_slots DESC, u.last_name ASC, u.first_name ASC`,
    `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
            COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
            0 AS in_office_available,
            0 AS open_slots
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE ${ACTIVE_CLAUSE}
        AND COALESCE(ua.is_active, 1) = 1
        AND COALESCE(u.provider_accepting_new_clients, 1) = 1
        AND ${ROLE_CLAUSE}
      ORDER BY u.last_name ASC, u.first_name ASC`,
    `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
            COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
            0 AS in_office_available,
            0 AS open_slots
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE ${ACTIVE_CLAUSE}
        AND COALESCE(u.provider_accepting_new_clients, 1) = 1
      ORDER BY u.last_name ASC, u.first_name ASC`
  ];

  let rows = [];
  for (const sql of queries) {
    try {
      const [found] = await pool.execute(sql, [aid]);
      rows = found || [];
      if (rows.length) break;
    } catch (err) {
      console.warn('[officeIntakeProviders] query failed', err?.message || err);
    }
  }

  const ageMap = await loadAgeSpecialtyMap(rows.map((r) => r.id));
  const mapped = rows.map((row) => mapProviderRow(
    { ...row, age_specialty: ageMap.get(Number(row.id)) || '' },
    { ageYears }
  ));
  mapped.sort((a, b) => {
    if (a.ageMatch !== b.ageMatch) return a.ageMatch ? -1 : 1;
    if (a.servesAge !== b.servesAge) return a.servesAge ? -1 : 1;
    if ((b.openSlots || 0) !== (a.openSlots || 0)) return (b.openSlots || 0) - (a.openSlots || 0);
    return String(a.name).localeCompare(String(b.name));
  });
  return mapped;
}

export { ageYearsFromDob, bucketFromYears };
