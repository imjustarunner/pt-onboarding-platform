import pool from '../config/database.js';
import { ageYearsFromDob } from '../utils/intakeShowIf.js';
import { providerServesAgeBucket } from '../utils/ageMatch.util.js';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHourLabel(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:00 ${period}`;
}

function mapProviderRow(row = {}, { ageYears = null, slots = [], waitlistCount = 0 } = {}) {
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const name = `${first} ${last}`.trim() || 'Provider';
  const openSlots = Number(row.open_slots || 0);
  const accepting = row.accepting == null ? true : Number(row.accepting) === 1;
  const ageGroups = parseAgeGroups(row.age_specialty);
  const bucket = bucketFromYears(ageYears);
  const servesAge = bucket ? providerServesAgeBucket(ageGroups, bucket) : true;
  const onWaitlist = !accepting || openSlots <= 0;
  const nextSlot = slots[0] || null;
  const frequencies = [...new Set(slots.map((s) => s.frequency).filter(Boolean))];
  return {
    id: Number(row.id),
    firstName: first,
    lastName: last,
    name,
    displayName: name,
    title: String(row.title || '').trim() || null,
    credential: String(row.credential || '').trim() || null,
    credentials: String(row.credential || row.title || '').trim() || null,
    psychologyTodayUrl: String(row.psychology_today_url || '').trim() || null,
    acceptingNewClients: accepting,
    inOfficeAvailable: Number(row.in_office_available || 0) === 1,
    openSlots,
    waitlist: onWaitlist,
    waitlistCount: Number(waitlistCount || 0),
    ageSpecialty: ageGroups,
    servesAge,
    ageMatch: servesAge && !!bucket,
    nextAvailable: nextSlot
      ? `${nextSlot.weekdayLabel} ${nextSlot.hourLabel}${nextSlot.frequency ? ` · ${nextSlot.frequency}` : ''}`
      : null,
    slots,
    frequencies,
    slotPreferenceNote:
      'Choosing a slot is a preference, not a booking. Slots are first come, first served and are not held. Expect a callback within 24–48 hours from support and/or the provider. Goodness of fit still applies.'
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

async function loadSlotDetailsMap(userIds = []) {
  const ids = userIds.map((id) => Number(id)).filter(Boolean);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const map = new Map();
  try {
    const [rows] = await pool.execute(
      `SELECT provider_id, weekday, hour
         FROM provider_in_office_availability
        WHERE is_available = 1
          AND provider_id IN (${placeholders})
        ORDER BY weekday ASC, hour ASC`,
      ids
    );
    const freqByProvider = new Map();
    try {
      const [freqRows] = await pool.execute(
        `SELECT assigned_provider_id AS provider_id, assigned_frequency
           FROM office_standing_assignments
          WHERE is_active = 1
            AND assigned_provider_id IN (${placeholders})`,
        ids
      );
      for (const fr of freqRows || []) {
        const pid = Number(fr.provider_id);
        if (!freqByProvider.has(pid)) {
          freqByProvider.set(pid, String(fr.assigned_frequency || 'WEEKLY').replace(/_/g, ' '));
        }
      }
    } catch {
      /* standing table may differ */
    }

    for (const row of rows || []) {
      const pid = Number(row.provider_id);
      const list = map.get(pid) || [];
      if (list.length >= 8) continue;
      const weekday = Number(row.weekday);
      const hour = Number(row.hour);
      list.push({
        weekday,
        hour,
        weekdayLabel: WEEKDAY_LABELS[weekday] || `Day ${weekday}`,
        hourLabel: formatHourLabel(hour),
        frequency: freqByProvider.get(pid) || 'WEEKLY'
      });
      map.set(pid, list);
    }
  } catch (err) {
    console.warn('[officeIntakeProviders] slot details failed', err?.message || err);
  }
  return map;
}

async function loadWaitlistCountMap(agencyId, userIds = []) {
  const aid = Number(agencyId || 0);
  const ids = userIds.map((id) => Number(id)).filter(Boolean);
  if (!aid || !ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT c.provider_id, COUNT(*) AS cnt
         FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
        WHERE c.agency_id = ?
          AND c.provider_id IN (${placeholders})
          AND LOWER(COALESCE(cs.status_key, '')) = 'waitlist'
          AND (c.is_archived IS NULL OR c.is_archived = 0)
        GROUP BY c.provider_id`,
      [aid, ...ids]
    );
    const map = new Map();
    for (const row of rows || []) {
      map.set(Number(row.provider_id), Number(row.cnt || 0));
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

async function loadPopulationFocusMap(userIds = []) {
  const ids = userIds.map((id) => Number(id)).filter(Boolean);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT uiv.user_id, uiv.value, uifd.field_key
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
        WHERE uiv.user_id IN (${placeholders})
          AND uifd.field_key IN (
            'groups', 'provider_marketing_focus', 'provider_marketing_groups', 'focus'
          )`,
      ids
    );
    const map = new Map();
    for (const row of rows || []) {
      const id = Number(row.user_id);
      const raw = row.value;
      let values = [];
      if (Array.isArray(raw)) values = raw;
      else if (typeof raw === 'string') {
        const text = raw.trim();
        if (text.startsWith('[')) {
          try {
            const parsed = JSON.parse(text);
            values = Array.isArray(parsed) ? parsed : [text];
          } catch {
            values = text.split(/[,;|]/);
          }
        } else {
          values = text.split(/[,;|]/);
        }
      }
      const normalized = values.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
      const prev = map.get(id) || [];
      map.set(id, [...new Set([...prev, ...normalized])]);
    }
    return map;
  } catch {
    return new Map();
  }
}

function providerSupportsServiceMode(populations = [], serviceMode = '') {
  const mode = String(serviceMode || '').trim().toLowerCase();
  if (!mode || mode === 'individual' || mode === 'self' || mode === 'myself') return true;
  const pops = Array.isArray(populations) ? populations : [];
  if (!pops.length) return true; // no facet data → do not hard-exclude
  if (mode === 'couple' || mode === 'couples' || mode === 'couples_therapy') {
    return pops.some((p) => /couple/.test(p));
  }
  if (mode === 'family' || mode === 'family_therapy') {
    return pops.some((p) => /famil/.test(p));
  }
  if (mode === 'child' || mode === 'dependent' || mode === 'child_adolescent') {
    return pops.some((p) => /child|teen|adolesc|youth|famil|individual/.test(p)) || true;
  }
  return true;
}

/**
 * Office intake / Choose a provider directory.
 * Includes providers who are not accepting (shown as waitlist) and those with
 * zero open office slots. Open-slot providers sort first.
 * @param {{ ages?: number[], includeNotAccepting?: boolean, serviceMode?: string }} opts
 * serviceMode: individual | couple | family | child — filters on provider groups/focus when set.
 */
export async function listOfficeIntakeProviders(agencyId, { ages = [], includeNotAccepting = true, serviceMode = '' } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const ageYears = youngestAge(ages);
  const acceptingClause = includeNotAccepting
    ? '1=1'
    : 'COALESCE(u.provider_accepting_new_clients, 1) = 1';

  const queries = [
    `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
            u.psychology_today_url,
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
        AND (${acceptingClause})
        AND ${ROLE_CLAUSE}
      ORDER BY open_slots DESC, u.last_name ASC, u.first_name ASC`,
    `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
            u.psychology_today_url,
            COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
            0 AS in_office_available,
            0 AS open_slots
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE ${ACTIVE_CLAUSE}
        AND COALESCE(ua.is_active, 1) = 1
        AND (${acceptingClause})
        AND ${ROLE_CLAUSE}
      ORDER BY u.last_name ASC, u.first_name ASC`
  ];

  let rows = [];
  for (const sql of queries) {
    try {
      const [found] = await pool.execute(sql, [aid]);
      rows = found || [];
      if (rows.length) break;
    } catch (err) {
      // psychology_today_url may be missing on older DBs — retry without it
      if (String(err?.message || '').includes('psychology_today_url')) {
        try {
          const fallbackSql = sql.replace(/u\.psychology_today_url,?\s*/g, '');
          const [found] = await pool.execute(fallbackSql, [aid]);
          rows = (found || []).map((r) => ({ ...r, psychology_today_url: null }));
          if (rows.length) break;
        } catch (err2) {
          console.warn('[officeIntakeProviders] query failed', err2?.message || err2);
        }
      } else {
        console.warn('[officeIntakeProviders] query failed', err?.message || err);
      }
    }
  }

  const ids = rows.map((r) => r.id);
  const [ageMap, slotMap, waitlistMap, populationMap] = await Promise.all([
    loadAgeSpecialtyMap(ids),
    loadSlotDetailsMap(ids),
    loadWaitlistCountMap(aid, ids),
    loadPopulationFocusMap(ids)
  ]);

  let mapped = rows.map((row) => {
    const populations = populationMap.get(Number(row.id)) || [];
    const supportsCouples = populations.some((p) => /couple/.test(p));
    const supportsFamilyTherapy = populations.some((p) => /famil/.test(p));
    return {
      ...mapProviderRow(
        { ...row, age_specialty: ageMap.get(Number(row.id)) || '' },
        {
          ageYears,
          slots: slotMap.get(Number(row.id)) || [],
          waitlistCount: waitlistMap.get(Number(row.id)) || 0
        }
      ),
      populations,
      supportsCouples,
      supportsFamilyTherapy,
      supportsServiceMode: providerSupportsServiceMode(populations, serviceMode)
    };
  });

  const mode = String(serviceMode || '').trim().toLowerCase();
  if (mode === 'couple' || mode === 'couples' || mode === 'couples_therapy'
    || mode === 'family' || mode === 'family_therapy') {
    const filtered = mapped.filter((p) => p.supportsServiceMode);
    // Prefer strict match; if no one has the facet, keep full list rather than empty directory.
    if (filtered.length) mapped = filtered;
  }

  mapped.sort((a, b) => {
    if (a.waitlist !== b.waitlist) return a.waitlist ? 1 : -1;
    if (a.supportsServiceMode !== b.supportsServiceMode) return a.supportsServiceMode ? -1 : 1;
    if (a.ageMatch !== b.ageMatch) return a.ageMatch ? -1 : 1;
    if (a.servesAge !== b.servesAge) return a.servesAge ? -1 : 1;
    if ((b.openSlots || 0) !== (a.openSlots || 0)) return (b.openSlots || 0) - (a.openSlots || 0);
    return String(a.name).localeCompare(String(b.name));
  });
  return mapped;
}

export { ageYearsFromDob, bucketFromYears };
