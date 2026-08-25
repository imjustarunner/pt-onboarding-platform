import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import {
  COLORADO_OUTREACH_SCHOOLS
} from '../data/coloradoOutreachSchools.js';
import {
  COLORADO_OUTREACH_KNOWN_BAD_ADDRESSES
} from '../data/coloradoOutreachSchoolAdditions.js';
import {
  WINDCHIME_ORIGIN,
  tripOutboundMiles,
  tripReturnMiles,
  tripRoundTripMiles,
  scoreNameMatch,
  canAutoPartnerDistrict,
  haversineMiles,
  schoolMapPoint,
  formatOutreachAddressLine,
  rankSchoolsBetweenAnchors,
  stopColorForOrder
} from '../utils/outreachHubPure.js';
import {
  isUniquePrefixSchoolMatch,
  matchImportSchool,
  mapHistoricalRow,
  parsePocInfo
} from '../utils/outreachHistoricalImport.js';

export {
  WINDCHIME_ORIGIN,
  scoreNameMatch,
  canAutoPartnerDistrict,
  haversineMiles,
  schoolMapPoint,
  tripOutboundMiles,
  tripReturnMiles,
  tripRoundTripMiles
};

const ATTENDANCE_STATUSES = new Set(['pending', 'attended', 'skipped', 'time_short']);

const STAGES = new Set([
  'not_started',
  'contacted',
  'follow_up_needed',
  'meeting_scheduled',
  'partnered',
  'on_hold'
]);

const lastStaffContactSync = new Map();

const CONTACT_TYPES = new Set(['email', 'letter', 'phone', 'visit']);

const LOCATION_TYPES = new Set(['school', 'practice', 'business']);

const LOCATION_TYPE_DISTRICT = {
  school: null,
  practice: 'Private practice',
  business: 'Places of business'
};

export function isValidOutreachStage(v) {
  return STAGES.has(String(v || '').trim().toLowerCase());
}

export function isValidContactType(v) {
  return CONTACT_TYPES.has(String(v || '').trim().toLowerCase());
}

export function isValidLocationType(v) {
  return LOCATION_TYPES.has(String(v || '').trim().toLowerCase());
}

function slugifyDirectoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'location';
}

function pickLinkedOrg(entry, orgs) {
  if (!canAutoPartnerDistrict(entry.district)) return null;
  const city = String(entry.city || '').trim().toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const org of orgs) {
    const orgCity = String(org.city || '').trim().toLowerCase();
    if (city && orgCity && city !== orgCity) continue;
    const score = scoreNameMatch(entry.name, org.name);
    if (score > bestScore) {
      bestScore = score;
      best = org;
    }
  }
  return bestScore >= 80 ? best : null;
}

async function loadAffiliatedSchools(agencyId) {
  try {
    const orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
    return (orgs || []).filter((o) => String(o.organization_type || '').toLowerCase() === 'school');
  } catch {
    return [];
  }
}

async function reconcileOutreachPartnerLinks(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return;
  try {
    // Only Denver Public Schools auto-partner; clear stale partnered flags elsewhere.
    await pool.execute(
      `UPDATE outreach_schools
       SET outreach_stage = 'not_started', linked_organization_id = NULL
       WHERE agency_id = ?
         AND district_name NOT LIKE '%Denver Public%'
         AND (outreach_stage = 'partnered' OR linked_organization_id IS NOT NULL)`,
      [id]
    );
    // Within DPS, drop links where the partner school is in a different city.
    await pool.execute(
      `UPDATE outreach_schools s
       INNER JOIN agencies a ON a.id = s.linked_organization_id
       SET s.linked_organization_id = NULL,
           s.outreach_stage = IF(s.outreach_stage = 'partnered', 'not_started', s.outreach_stage)
       WHERE s.agency_id = ?
         AND s.district_name LIKE '%Denver Public%'
         AND s.linked_organization_id IS NOT NULL
         AND LOWER(TRIM(COALESCE(a.city, ''))) != LOWER(TRIM(COALESCE(s.city, '')))`,
      [id]
    );
  } catch {
    /* table may not exist yet */
  }
}

function seededStreetAddress(entry) {
  const address = String(entry?.address || '').trim();
  return address && /\d/.test(address) ? address.slice(0, 255) : null;
}

function seededAddressStatus(entry) {
  return seededStreetAddress(entry) ? 'verified' : 'missing';
}

function knownBadAddressFragment(entry) {
  return String(COLORADO_OUTREACH_KNOWN_BAD_ADDRESSES[entry?.key] || '').trim();
}

export async function ensureOutreachDirectory(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return { inserted: 0, updated: 0 };
  let inserted = 0;
  let updated = 0;
  const affiliated = await loadAffiliatedSchools(id);
  try {
    for (const entry of COLORADO_OUTREACH_SCHOOLS) {
    const linked = pickLinkedOrg(entry, affiliated);
    const stage = linked ? 'partnered' : 'not_started';
    const address = seededStreetAddress(entry);
    const lat = Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null;
    const lng = Number.isFinite(Number(entry.lng)) ? Number(entry.lng) : null;
    const aliases = Array.isArray(entry.aliases) && entry.aliases.length
      ? entry.aliases.join(' | ').slice(0, 512)
      : null;
    const [result] = await pool.execute(
      `INSERT INTO outreach_schools (
         agency_id, directory_key, linked_organization_id, name, district_name,
         city, region, school_level, address, lat, lng, outreach_stage,
         is_charter, search_aliases, address_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         linked_organization_id = IF(VALUES(linked_organization_id) IS NULL, linked_organization_id, VALUES(linked_organization_id)),
         name = VALUES(name),
         district_name = VALUES(district_name),
         city = VALUES(city),
         region = VALUES(region),
         school_level = VALUES(school_level),
         is_charter = VALUES(is_charter),
         search_aliases = VALUES(search_aliases),
         address = IF(address IS NULL OR address = '' OR address NOT REGEXP '[0-9]', VALUES(address), address),
         lat = COALESCE(lat, VALUES(lat)),
         lng = COALESCE(lng, VALUES(lng)),
         address_status = IF(address IS NULL OR address = '' OR address NOT REGEXP '[0-9]', VALUES(address_status), address_status),
         outreach_stage = IF(outreach_stage = 'not_started' AND VALUES(outreach_stage) = 'partnered', 'partnered', outreach_stage)`,
      [
        id,
        entry.key,
        linked?.id || null,
        entry.name,
        entry.district,
        entry.city,
        entry.region || entry.city,
        entry.level,
        address,
        lat,
        lng,
        stage,
        entry.isCharter ? 1 : 0,
        aliases,
        seededAddressStatus(entry)
      ]
    );
    if (result?.insertId) inserted += 1;
    else if (result?.affectedRows > 0) updated += 1;
  }
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { inserted: 0, updated: 0 };
    throw e;
  }
  await reconcileOutreachPartnerLinks(id);
  await applySeededOutreachLocations(id);
  await reconcileVisitedSchoolsFollowUp(id);
  void syncExistingSchoolStaffToOutreachContacts(id).catch(() => {});
  return { inserted, updated };
}

/** Fill placeholder/wrong copied addresses from the seeded NCES/CDE directory. */
export async function applySeededOutreachLocations(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return 0;
  let updated = 0;
  for (const entry of COLORADO_OUTREACH_SCHOOLS) {
    const seeded = seededStreetAddress(entry);
    const lat = Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null;
    const lng = Number.isFinite(Number(entry.lng)) ? Number(entry.lng) : null;
    const status = seededAddressStatus(entry);
    const badFrag = knownBadAddressFragment(entry);
    const [result] = await pool.execute(
      `UPDATE outreach_schools
       SET address = IF(
             address IS NULL OR address = '' OR address NOT REGEXP '[0-9]'
               OR (? != '' AND address LIKE CONCAT('%', ?, '%')),
             ?,
             address
           ),
           lat = IF(
             lat IS NULL
               OR (? != '' AND address LIKE CONCAT('%', ?, '%')),
             ?,
             lat
           ),
           lng = IF(
             lng IS NULL
               OR (? != '' AND address LIKE CONCAT('%', ?, '%')),
             ?,
             lng
           ),
           address_status = IF(
             address IS NULL OR address = '' OR address NOT REGEXP '[0-9]'
               OR (? != '' AND address LIKE CONCAT('%', ?, '%')),
             ?,
             IF(address REGEXP '[0-9]', 'verified', address_status)
           )
       WHERE agency_id = ?
         AND directory_key = ?
         AND (
           address IS NULL OR address = '' OR address NOT REGEXP '[0-9]'
           OR lat IS NULL OR lng IS NULL
           OR (? != '' AND address LIKE CONCAT('%', ?, '%'))
         )`,
      [
        badFrag, badFrag, seeded,
        badFrag, badFrag, lat,
        badFrag, badFrag, lng,
        badFrag, badFrag, status,
        id, entry.key,
        badFrag, badFrag
      ]
    );
    updated += Number(result?.affectedRows || 0);
  }
  return updated;
}

function mapSchoolRow(row, activityCounts = null) {
  const counts = activityCounts || {};
  return {
    id: Number(row.id),
    agency_id: Number(row.agency_id),
    directory_key: row.directory_key,
    linked_organization_id: row.linked_organization_id ? Number(row.linked_organization_id) : null,
    name: row.name,
    district_name: row.district_name,
    city: row.city,
    region: row.region,
    school_level: row.school_level,
    location_type: row.location_type || 'school',
    address: row.address,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    outreach_stage: row.outreach_stage,
    last_contact_at: row.last_contact_at,
    next_follow_up_at: row.next_follow_up_at,
    notes: row.notes,
    primary_contact_name: row.primary_contact_name || null,
    primary_contact_email: row.primary_contact_email || null,
    primary_contact_phone: row.primary_contact_phone || null,
    primary_contact_title: row.primary_contact_title || null,
    agency_contact_id: row.agency_contact_id ? Number(row.agency_contact_id) : null,
    is_charter: Number(row.is_charter || 0) === 1,
    search_aliases: row.search_aliases || null,
    address_status: row.address_status || (row.address && /\d/.test(String(row.address)) ? 'verified' : 'missing'),
    needs_address: !(row.address && /\d/.test(String(row.address))),
    email_count: Number(counts.email || row.email_count || 0),
    letter_count: Number(counts.letter || row.letter_count || 0),
    phone_count: Number(counts.phone || row.phone_count || 0),
    visit_count: Number(counts.visit || row.visit_count || 0)
  };
}

export async function listOutreachSchools(agencyId, filters = {}) {
  await ensureOutreachDirectory(agencyId);
  const where = ['s.agency_id = ?'];
  const params = [agencyId];
  const district = String(filters.district || '').trim();
  const stage = String(filters.stage || '').trim().toLowerCase();
  const level = String(filters.level || '').trim().toLowerCase();
  const locationType = String(filters.locationType || filters.location_type || filters.type || '').trim().toLowerCase();
  const q = String(filters.q || '').trim();
  const needsAddress = String(filters.needsAddress || filters.address || '').trim().toLowerCase();
  const charterOnly = filters.charterOnly === true
    || filters.charterOnly === 1
    || filters.charterOnly === '1'
    || filters.charterOnly === 'true'
    || String(filters.charter || '').trim().toLowerCase() === '1'
    || String(filters.charter || '').trim().toLowerCase() === 'true';
  if (locationType && isValidLocationType(locationType)) {
    where.push('s.location_type = ?');
    params.push(locationType);
  }
  if (district) {
    // D11 + charter: include CSI/"Charter" campuses in Colorado Springs alongside D11
    const isD11 = /colorado springs school district 11/i.test(district);
    if (isD11 && charterOnly) {
      where.push(`(
        s.district_name = ?
        OR (s.district_name = 'Charter' AND LOWER(COALESCE(s.city, '')) = 'colorado springs' AND s.is_charter = 1)
      )`);
      params.push(district);
    } else {
      where.push('s.district_name = ?');
      params.push(district);
    }
  }
  if (stage && isValidOutreachStage(stage)) {
    where.push('s.outreach_stage = ?');
    params.push(stage);
  }
  if (level) {
    where.push('s.school_level = ?');
    params.push(level);
  }
  if (charterOnly) {
    where.push('s.is_charter = 1');
  }
  if (needsAddress === 'missing' || needsAddress === '1' || needsAddress === 'true') {
    where.push("(s.address IS NULL OR s.address = '' OR s.address NOT REGEXP '[0-9]' OR s.address_status = 'missing')");
  }
  if (q) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.district_name LIKE ? OR COALESCE(s.address, \'\') LIKE ? OR COALESCE(s.search_aliases, \'\') LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const sortKey = String(filters.sort || filters.sortBy || 'district').trim().toLowerCase();
  const sortDir = String(filters.sortDir || 'asc').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const sortSql = {
    school: `s.name ${sortDir}`,
    name: `s.name ${sortDir}`,
    level: `s.school_level ${sortDir}, s.name ASC`,
    district: `s.district_name ${sortDir}, s.name ASC`,
    stage: `s.outreach_stage ${sortDir}, s.name ASC`,
    last_contact: `s.last_contact_at ${sortDir}, s.name ASC`,
    visits: `visit_count ${sortDir}, s.name ASC`
  }[sortKey] || `s.district_name ASC, s.name ASC`;
  try {
    const [rows] = await pool.execute(
      `SELECT
         s.*,
         SUM(a.contact_type = 'email') AS email_count,
         SUM(a.contact_type = 'letter') AS letter_count,
         SUM(a.contact_type = 'phone') AS phone_count,
         SUM(a.contact_type = 'visit') AS visit_count
       FROM outreach_schools s
       LEFT JOIN outreach_activities a ON a.outreach_school_id = s.id
       WHERE ${where.join(' AND ')}
       GROUP BY s.id
       ORDER BY ${sortSql}`,
      params
    );
    return (rows || []).map((r) => mapSchoolRow(r));
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' || !locationType) throw e;
    // Pre-migration fallback: ignore location_type filter
    const fallbackWhere = where.filter((w) => w !== 's.location_type = ?');
    const fallbackParams = [...params];
    if (locationType && isValidLocationType(locationType)) fallbackParams.splice(1, 1);
    const [rows] = await pool.execute(
      `SELECT
         s.*,
         SUM(a.contact_type = 'email') AS email_count,
         SUM(a.contact_type = 'letter') AS letter_count,
         SUM(a.contact_type = 'phone') AS phone_count,
         SUM(a.contact_type = 'visit') AS visit_count
       FROM outreach_schools s
       LEFT JOIN outreach_activities a ON a.outreach_school_id = s.id
       WHERE ${fallbackWhere.join(' AND ')}
       GROUP BY s.id
       ORDER BY ${sortSql}`,
      fallbackParams
    );
    return (rows || []).map((r) => mapSchoolRow(r));
  }
}

async function queryOutreachSchoolRows(agencyId, filters = {}) {
  const where = ['s.agency_id = ?'];
  const params = [agencyId];
  const district = String(filters.district || '').trim();
  const stage = String(filters.stage || '').trim().toLowerCase();
  const level = String(filters.level || '').trim().toLowerCase();
  const q = String(filters.q || '').trim();
  const needsAddress = String(filters.needsAddress || filters.address || '').trim().toLowerCase();
  const charterOnly = filters.charterOnly === true
    || filters.charterOnly === 1
    || filters.charterOnly === '1'
    || filters.charterOnly === 'true'
    || String(filters.charter || '').trim().toLowerCase() === '1'
    || String(filters.charter || '').trim().toLowerCase() === 'true';
  if (district) {
    // D11 + charter: include CSI/"Charter" campuses in Colorado Springs alongside D11
    const isD11 = /colorado springs school district 11/i.test(district);
    if (isD11 && charterOnly) {
      where.push(`(
        s.district_name = ?
        OR (s.district_name = 'Charter' AND LOWER(COALESCE(s.city, '')) = 'colorado springs' AND s.is_charter = 1)
      )`);
      params.push(district);
    } else {
      where.push('s.district_name = ?');
      params.push(district);
    }
  }
  if (stage && isValidOutreachStage(stage)) {
    where.push('s.outreach_stage = ?');
    params.push(stage);
  }
  if (level) {
    where.push('s.school_level = ?');
    params.push(level);
  }
  if (charterOnly) {
    where.push('s.is_charter = 1');
  }
  if (needsAddress === 'missing' || needsAddress === '1' || needsAddress === 'true') {
    where.push("(s.address IS NULL OR s.address = '' OR s.address NOT REGEXP '[0-9]' OR s.address_status = 'missing')");
  }
  if (q) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.district_name LIKE ? OR COALESCE(s.address, \'\') LIKE ? OR COALESCE(s.search_aliases, \'\') LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT s.* FROM outreach_schools s WHERE ${where.join(' AND ')} ORDER BY s.district_name ASC, s.name ASC`,
    params
  );
  return (rows || []).map((r) => mapSchoolRow(r));
}

async function resolveOutreachSchoolLocation(row) {
  const name = String(row.name || '').trim();
  const city = String(row.city || '').trim();
  if (!name || !city) return null;

  const orgStreet = String(row.org_street || '').trim();
  if (orgStreet && /\d/.test(orgStreet)) {
    const orgLine = formatOutreachAddressLine([
      orgStreet,
      row.org_city,
      row.org_state || 'CO',
      row.org_zip
    ]);
    try {
      const { geocodeAddressWithGoogle } = await import('./googleGeocode.service.js');
      const geo = await geocodeAddressWithGoogle({
        addressText: orgLine,
        state: row.org_state || 'CO',
        countryCode: 'US'
      });
      return {
        latitude: geo.latitude,
        longitude: geo.longitude,
        formattedAddress: geo.formattedAddress || orgLine,
        source: 'linked_org'
      };
    } catch (e) {
      if (e?.code === 'MAPS_KEY_MISSING' || String(e?.message || '').includes('REQUEST_DENIED')) {
        throw e;
      }
    }
  }

  try {
    const { searchSchoolPlaceWithGoogle } = await import('./googleGeocode.service.js');
    return await searchSchoolPlaceWithGoogle({
      name,
      city,
      districtName: row.district_name
    });
  } catch (e) {
    const denied = e?.code === 'MAPS_KEY_MISSING' || String(e?.message || '').includes('REQUEST_DENIED');
    if (!denied) {
      try {
        const { geocodeAddressWithGoogle } = await import('./googleGeocode.service.js');
        const geo = await geocodeAddressWithGoogle({
          addressText: `${name}, ${city}, Colorado`,
          state: 'CO',
          countryCode: 'US'
        });
        return {
          latitude: geo.latitude,
          longitude: geo.longitude,
          formattedAddress: /\d/.test(String(geo.formattedAddress || '')) ? geo.formattedAddress : null,
          source: 'geocode_name_city'
        };
      } catch (inner) {
        if (inner?.code === 'MAPS_KEY_MISSING' || String(inner?.message || '').includes('REQUEST_DENIED')) {
          throw inner;
        }
      }
    }
    if (denied) {
      throw e;
    }
    return null;
  }
}

/** Geocode schools missing coordinates or still on placeholder addresses (batched). */
export async function backfillOutreachSchoolGeocodes(agencyId, { limit = 50 } = {}) {
  const id = Number(agencyId || 0);
  if (!id) return { geocoded: 0, remaining: 0 };
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await pool.execute(
    `SELECT
       s.id, s.name, s.city, s.district_name, s.address, s.lat, s.lng, s.linked_organization_id,
       a.street_address AS org_street, a.city AS org_city, a.state AS org_state, a.postal_code AS org_zip
     FROM outreach_schools s
     LEFT JOIN agencies a ON a.id = s.linked_organization_id
     WHERE s.agency_id = ?
       AND (
         s.lat IS NULL OR s.lng IS NULL
         OR s.address IS NULL OR s.address = ''
         OR s.address NOT REGEXP '[0-9]'
       )
     ORDER BY (s.lat IS NULL OR s.lng IS NULL) DESC, s.id ASC
     LIMIT ${cap}`,
    [id]
  );
  if (!rows?.length) {
    const [rem] = await pool.execute(
      `SELECT COUNT(*) AS n FROM outreach_schools
       WHERE agency_id = ?
         AND (
           lat IS NULL OR lng IS NULL
           OR address IS NULL OR address = ''
           OR address NOT REGEXP '[0-9]'
         )`,
      [id]
    );
    return { geocoded: 0, remaining: Number(rem?.[0]?.n || 0) };
  }

  let geocoded = 0;
  let geocodeBlocked = false;
  for (const row of rows) {
    if (geocodeBlocked) break;
    try {
      const resolved = await resolveOutreachSchoolLocation(row);
      if (!resolved) continue;
      const formatted = resolved.formattedAddress
        ? String(resolved.formattedAddress).slice(0, 255)
        : null;
      await pool.execute(
        `UPDATE outreach_schools
         SET lat = ?, lng = ?, address = COALESCE(?, address)
         WHERE id = ? AND agency_id = ?`,
        [resolved.latitude, resolved.longitude, formatted, row.id, id]
      );
      geocoded += 1;
    } catch (e) {
      const msg = String(e?.message || '');
      if (e?.code === 'MAPS_KEY_MISSING' || msg.includes('REQUEST_DENIED')) {
        geocodeBlocked = true;
        console.warn(
          '[outreachHub] Google Maps address lookup unavailable — enable Places API (New) and Geocoding API on GOOGLE_MAPS_API_KEY (and check key restrictions)'
        );
      } else {
        console.warn('[outreachHub] address resolve skipped', row.id, e?.message);
      }
    }
  }

  const [rem] = await pool.execute(
    `SELECT COUNT(*) AS n FROM outreach_schools
     WHERE agency_id = ?
       AND (
         lat IS NULL OR lng IS NULL
         OR address IS NULL OR address = ''
         OR address NOT REGEXP '[0-9]'
       )`,
    [id]
  );
  return { geocoded, remaining: Number(rem?.[0]?.n || 0) };
}

export async function getOutreachSchool(agencyId, schoolId) {
  const [rows] = await pool.execute(
    `SELECT
       s.*,
       SUM(a.contact_type = 'email') AS email_count,
       SUM(a.contact_type = 'letter') AS letter_count,
       SUM(a.contact_type = 'phone') AS phone_count,
       SUM(a.contact_type = 'visit') AS visit_count
     FROM outreach_schools s
     LEFT JOIN outreach_activities a ON a.outreach_school_id = s.id
     WHERE s.agency_id = ? AND s.id = ?
     GROUP BY s.id
     LIMIT 1`,
    [agencyId, schoolId]
  );
  const school = rows?.[0] ? mapSchoolRow(rows[0]) : null;
  if (!school) return null;
  let acts = [];
  try {
    const [actRows] = await pool.execute(
      `SELECT
         a.id, a.contact_type, a.activity_at, a.summary, a.notes, a.created_at,
         a.created_by_user_id, a.trip_id, a.trip_stop_id, a.source,
         t.title AS trip_title,
         ts.stop_color, ts.stop_order,
         TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
       FROM outreach_activities a
       LEFT JOIN users u ON u.id = a.created_by_user_id
       LEFT JOIN outreach_trips t ON t.id = a.trip_id
       LEFT JOIN outreach_trip_stops ts ON ts.id = a.trip_stop_id
       WHERE a.outreach_school_id = ?
       ORDER BY a.activity_at DESC, a.id DESC`,
      [schoolId]
    );
    acts = actRows || [];
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [actRows] = await pool.execute(
      `SELECT
         a.id, a.contact_type, a.activity_at, a.summary, a.notes, a.created_at,
         a.created_by_user_id,
         TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
       FROM outreach_activities a
       LEFT JOIN users u ON u.id = a.created_by_user_id
       WHERE a.outreach_school_id = ?
       ORDER BY a.activity_at DESC, a.id DESC`,
      [schoolId]
    );
    acts = actRows || [];
  }
  let notes = [];
  let contacts = [];
  try {
    try {
      const [noteRows] = await pool.execute(
        `SELECT
           n.id, n.body, n.created_at, n.created_by_user_id, n.source,
           n.note_kind, n.trip_id, n.trip_stop_id, n.contact_id,
           n.spoken_with_name, n.follow_up_at,
           t.title AS trip_title,
           ts.stop_color, ts.stop_order,
           TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
         FROM outreach_school_notes n
         LEFT JOIN users u ON u.id = n.created_by_user_id
         LEFT JOIN outreach_trips t ON t.id = n.trip_id
         LEFT JOIN outreach_trip_stops ts ON ts.id = n.trip_stop_id
         WHERE n.outreach_school_id = ?
         ORDER BY n.created_at DESC, n.id DESC`,
        [schoolId]
      );
      notes = noteRows || [];
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [noteRows] = await pool.execute(
        `SELECT
           n.id, n.body, n.created_at, n.created_by_user_id,
           TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
         FROM outreach_school_notes n
         LEFT JOIN users u ON u.id = n.created_by_user_id
         WHERE n.outreach_school_id = ?
         ORDER BY n.created_at DESC, n.id DESC`,
        [schoolId]
      );
      notes = (noteRows || []).map((n) => ({ ...n, note_kind: 'general', source: n.source || null }));
    }
    const [contactRows] = await pool.execute(
      `SELECT * FROM outreach_school_contacts
       WHERE outreach_school_id = ?
       ORDER BY is_primary DESC, full_name ASC`,
      [schoolId]
    );
    contacts = contactRows || [];
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }

  let taskFeed = [];
  try {
    const [taskRows] = await pool.execute(
      `SELECT t.id, t.title, t.status, t.due_date, t.created_at, t.urgency,
              t.outreach_trip_id AS trip_id,
              ot.title AS trip_title,
              TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_by_user_id
       LEFT JOIN outreach_trips ot ON ot.id = t.outreach_trip_id
       WHERE t.assigned_to_agency_id = ?
         AND t.outreach_school_id = ?
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [agencyId, schoolId]
    );
    taskFeed = taskRows || [];
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  const feed = buildSchoolActivityFeed({ activities: acts, notes, tasks: taskFeed });
  return { ...school, activities: acts || [], notes, contacts, feed };
}

function buildSchoolActivityFeed({ activities = [], notes = [], tasks = [] } = {}) {
  const items = [];
  for (const a of activities || []) {
    items.push({
      id: `act-${a.id}`,
      activity_id: Number(a.id),
      entry_type: 'contact',
      contact_type: a.contact_type,
      title: a.summary || a.contact_type,
      body: a.notes || null,
      occurred_at: a.activity_at || a.created_at,
      created_by_name: a.created_by_name || null,
      source: a.source || null,
      trip_id: a.trip_id != null ? Number(a.trip_id) : null,
      trip_title: a.trip_title || null,
      trip_stop_id: a.trip_stop_id != null ? Number(a.trip_stop_id) : null,
      stop_color: a.stop_color || (a.stop_order != null ? stopColorForOrder(Number(a.stop_order) - 1) : null)
    });
  }
  for (const n of notes || []) {
    const kind = String(n.note_kind || 'general');
    items.push({
      id: `note-${n.id}`,
      entry_type: kind === 'conversation' ? 'conversation' : kind === 'follow_up' ? 'follow_up' : 'note',
      note_kind: kind,
      title: kind === 'follow_up'
        ? (n.follow_up_at ? `Follow-up · ${String(n.follow_up_at).slice(0, 10)}` : 'Follow-up')
        : kind === 'conversation'
          ? (n.spoken_with_name ? `Spoke with ${n.spoken_with_name}` : 'Conversation')
          : 'Note',
      body: n.body,
      spoken_with_name: n.spoken_with_name || null,
      follow_up_at: n.follow_up_at || null,
      occurred_at: n.created_at,
      created_by_name: n.created_by_name || null,
      trip_id: n.trip_id != null ? Number(n.trip_id) : null,
      trip_title: n.trip_title || null,
      trip_stop_id: n.trip_stop_id != null ? Number(n.trip_stop_id) : null,
      stop_color: n.stop_color || (n.stop_order != null ? stopColorForOrder(Number(n.stop_order) - 1) : null)
    });
  }
  for (const t of tasks || []) {
    items.push({
      id: `task-${t.id}`,
      entry_type: 'task',
      title: t.title,
      body: t.status === 'completed' ? 'Completed' : (t.due_date ? `Due ${String(t.due_date).slice(0, 10)}` : null),
      occurred_at: t.created_at,
      created_by_name: t.created_by_name || null,
      trip_id: t.trip_id != null ? Number(t.trip_id) : null,
      trip_title: t.trip_title || null,
      stop_color: null,
      task_status: t.status,
      urgency: t.urgency
    });
  }
  items.sort((a, b) => {
    const ta = new Date(a.occurred_at || 0).getTime();
    const tb = new Date(b.occurred_at || 0).getTime();
    return tb - ta;
  });
  return items;
}

function parseGeminiJsonObject(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cityLooksRight(expectedCity, formatted) {
  const city = String(expectedCity || '').trim().toLowerCase();
  const line = String(formatted || '').toLowerCase();
  if (!city || !line) return false;
  return line.includes(city);
}

/** Gemini lookup for schools missing a street address. Saves only after geocode confirms the city. */
export async function lookupOutreachSchoolAddress(agencyId, schoolId) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  if (school.address && /\d/.test(school.address) && school.address_status !== 'missing') {
    return { updated: false, reason: 'already_verified', school };
  }

  const { callGeminiText } = await import('./geminiText.service.js');
  const prompt = [
    'Find the official physical street address for this Colorado public school.',
    'Use only district, CDE, or the school\'s own website. Do not guess.',
    `School name: ${school.name}`,
    `District: ${school.district_name}`,
    `City: ${school.city || ''}`,
    'Return JSON only with keys address, confidence, source.',
    'confidence must be "high" only if you found a street number on an official page.',
    'If you cannot find a street number, return {"address":null,"confidence":"none","source":null}.'
  ].join('\n');
  const gemini = await callGeminiText({ prompt, temperature: 0, maxOutputTokens: 400 });
  const parsed = parseGeminiJsonObject(gemini?.text);
  const candidate = String(parsed?.address || '').trim();
  const confidence = String(parsed?.confidence || '').trim().toLowerCase();
  if (!candidate || !/\d/.test(candidate) || confidence !== 'high') {
    await pool.execute(
      `UPDATE outreach_schools SET address_status = 'missing' WHERE agency_id = ? AND id = ?`,
      [agencyId, schoolId]
    );
    return {
      updated: false,
      reason: 'not_found',
      school: await getOutreachSchool(agencyId, schoolId)
    };
  }

  try {
    const { geocodeAddressWithGoogle } = await import('./googleGeocode.service.js');
    const geo = await geocodeAddressWithGoogle({
      addressText: candidate,
      state: 'CO',
      countryCode: 'US'
    });
    const formatted = String(geo?.formattedAddress || candidate);
    if (!/\d/.test(formatted) || !cityLooksRight(school.city, formatted)) {
      await pool.execute(
        `UPDATE outreach_schools SET address_status = 'lookup_failed' WHERE agency_id = ? AND id = ?`,
        [agencyId, schoolId]
      );
      return {
        updated: false,
        reason: 'city_mismatch',
        candidate,
        school: await getOutreachSchool(agencyId, schoolId)
      };
    }
    await pool.execute(
      `UPDATE outreach_schools
       SET address = ?, lat = ?, lng = ?, address_status = 'verified'
       WHERE agency_id = ? AND id = ?`,
      [formatted.slice(0, 255), geo.latitude, geo.longitude, agencyId, schoolId]
    );
    return { updated: true, reason: 'verified', school: await getOutreachSchool(agencyId, schoolId) };
  } catch (e) {
    await pool.execute(
      `UPDATE outreach_schools SET address_status = 'lookup_failed' WHERE agency_id = ? AND id = ?`,
      [agencyId, schoolId]
    );
    return {
      updated: false,
      reason: 'geocode_unavailable',
      candidate,
      school: await getOutreachSchool(agencyId, schoolId)
    };
  }
}

export async function updateOutreachSchool(agencyId, schoolId, patch = {}) {
  const fields = [];
  const params = [];
  if (patch.outreach_stage != null) {
    const stage = String(patch.outreach_stage).trim().toLowerCase();
    if (!isValidOutreachStage(stage)) throw new Error('Invalid outreach stage');
    fields.push('outreach_stage = ?');
    params.push(stage);
    if (stage === 'partnered' && patch.next_follow_up_at === undefined) {
      fields.push('next_follow_up_at = ?');
      params.push(null);
    }
  }
  if (patch.location_type != null || patch.locationType != null) {
    const locationType = String(patch.location_type || patch.locationType || '').trim().toLowerCase();
    if (!isValidLocationType(locationType)) throw new Error('Location type must be school, practice, or business');
    fields.push('location_type = ?');
    params.push(locationType);
  }
  if (patch.next_follow_up_at !== undefined) {
    fields.push('next_follow_up_at = ?');
    params.push(patch.next_follow_up_at || null);
  }
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim();
    if (!name) throw new Error('School name is required');
    fields.push('name = ?');
    params.push(name.slice(0, 255));
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?');
    params.push(patch.notes == null ? null : String(patch.notes));
  }
  if (patch.address !== undefined) {
    fields.push('address = ?');
    params.push(patch.address ? String(patch.address).slice(0, 255) : null);
    fields.push('address_status = ?');
    params.push(patch.address && /\d/.test(String(patch.address)) ? 'verified' : 'missing');
  }
  if (patch.primary_contact_name !== undefined) {
    fields.push('primary_contact_name = ?');
    params.push(patch.primary_contact_name ? String(patch.primary_contact_name).slice(0, 255) : null);
  }
  if (patch.primary_contact_email !== undefined) {
    fields.push('primary_contact_email = ?');
    params.push(patch.primary_contact_email ? String(patch.primary_contact_email).slice(0, 255) : null);
  }
  if (patch.primary_contact_phone !== undefined) {
    fields.push('primary_contact_phone = ?');
    params.push(patch.primary_contact_phone ? String(patch.primary_contact_phone).slice(0, 64) : null);
  }
  if (patch.primary_contact_title !== undefined) {
    fields.push('primary_contact_title = ?');
    params.push(patch.primary_contact_title ? String(patch.primary_contact_title).slice(0, 128) : null);
  }
  if (!fields.length) return getOutreachSchool(agencyId, schoolId);
  params.push(agencyId, schoolId);
  await pool.execute(
    `UPDATE outreach_schools SET ${fields.join(', ')} WHERE agency_id = ? AND id = ?`,
    params
  );
  return getOutreachSchool(agencyId, schoolId);
}

export async function createOutreachLocation(agencyId, payload = {}) {
  const id = Number(agencyId || 0);
  if (!id) throw new Error('agencyId is required');
  const locationType = String(payload.location_type || payload.locationType || 'practice').trim().toLowerCase();
  if (!isValidLocationType(locationType)) throw new Error('Location type must be school, practice, or business');
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Name is required');
  const city = String(payload.city || '').trim() || null;
  const address = String(payload.address || '').trim() || null;
  const region = String(payload.region || '').trim() || null;
  const schoolLevel = String(payload.school_level || payload.schoolLevel || 'other').trim().toLowerCase() || 'other';
  const districtName = String(payload.district_name || payload.districtName || '').trim()
    || LOCATION_TYPE_DISTRICT[locationType]
    || 'Other';
  const stage = String(payload.outreach_stage || payload.outreachStage || 'not_started').trim().toLowerCase();
  if (!isValidOutreachStage(stage)) throw new Error('Invalid outreach stage');

  const baseKey = `${locationType}:${slugifyDirectoryKey(name)}`;
  let directoryKey = baseKey;
  for (let i = 0; i < 8; i += 1) {
    const [dup] = await pool.execute(
      `SELECT id FROM outreach_schools WHERE agency_id = ? AND directory_key = ? LIMIT 1`,
      [id, directoryKey]
    );
    if (!dup?.length) break;
    directoryKey = `${baseKey}-${Date.now().toString(36).slice(-4)}${i}`;
  }

  const addressStatus = address && /\d/.test(address) ? 'verified' : 'missing';
  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO outreach_schools (
         agency_id, directory_key, name, district_name, city, region, school_level,
         address, address_status, outreach_stage, location_type, is_charter
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        directoryKey.slice(0, 191),
        name.slice(0, 255),
        districtName.slice(0, 255),
        city ? city.slice(0, 128) : null,
        region ? region.slice(0, 128) : null,
        schoolLevel.slice(0, 32),
        address ? address.slice(0, 255) : null,
        addressStatus,
        stage,
        locationType
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    [result] = await pool.execute(
      `INSERT INTO outreach_schools (
         agency_id, directory_key, name, district_name, city, region, school_level,
         address, address_status, outreach_stage, is_charter
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        directoryKey.slice(0, 191),
        name.slice(0, 255),
        districtName.slice(0, 255),
        city ? city.slice(0, 128) : null,
        region ? region.slice(0, 128) : null,
        schoolLevel.slice(0, 32),
        address ? address.slice(0, 255) : null,
        addressStatus,
        stage
      ]
    );
  }
  return getOutreachSchool(id, result.insertId);
}

export async function logOutreachActivity(agencyId, schoolId, payload, userId) {
  const type = String(payload?.contact_type || '').trim().toLowerCase();
  if (!isValidContactType(type)) throw new Error('Contact type must be email, letter, phone, or visit');
  const activityAt = payload?.activity_at ? new Date(payload.activity_at) : new Date();
  if (Number.isNaN(activityAt.getTime())) throw new Error('Invalid activity date');
  const mysqlAt = activityAt.toISOString().slice(0, 19).replace('T', ' ');
  const [own] = await pool.execute(
    'SELECT id FROM outreach_schools WHERE agency_id = ? AND id = ? LIMIT 1',
    [agencyId, schoolId]
  );
  if (!own?.[0]) throw new Error('School not found');
  const tripId = payload?.trip_id || payload?.tripId ? Number(payload.trip_id || payload.tripId) : null;
  const tripStopId = payload?.trip_stop_id || payload?.tripStopId
    ? Number(payload.trip_stop_id || payload.tripStopId)
    : null;
  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO outreach_activities (
         outreach_school_id, agency_id, contact_type, activity_at, summary, notes,
         created_by_user_id, trip_id, trip_stop_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        agencyId,
        type,
        mysqlAt,
        payload?.summary ? String(payload.summary).slice(0, 500) : null,
        payload?.notes ? String(payload.notes) : null,
        userId || null,
        tripId,
        tripStopId
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    [result] = await pool.execute(
      `INSERT INTO outreach_activities (
         outreach_school_id, agency_id, contact_type, activity_at, summary, notes, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        agencyId,
        type,
        mysqlAt,
        payload?.summary ? String(payload.summary).slice(0, 500) : null,
        payload?.notes ? String(payload.notes) : null,
        userId || null
      ]
    );
  }
  await pool.execute(
    `UPDATE outreach_schools
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, '1970-01-01'), ?)
     WHERE id = ?`,
    [mysqlAt, schoolId]
  );
  if (type === 'visit') {
    await markFollowUpNeededIfNotPartnered(agencyId, schoolId);
  } else {
    const current = await getOutreachSchool(agencyId, schoolId);
    if (current && current.outreach_stage === 'not_started') {
      await pool.execute(
        `UPDATE outreach_schools SET outreach_stage = 'contacted' WHERE id = ? AND outreach_stage = 'not_started'`,
        [schoolId]
      );
    }
  }
  return getOutreachSchool(agencyId, schoolId).then((school) => ({
    activityId: result.insertId,
    school
  }));
}

export async function updateOutreachActivity(agencyId, schoolId, activityId, patch = {}) {
  const aid = Number(agencyId || 0);
  const sid = Number(schoolId || 0);
  const actId = Number(activityId || 0);
  if (!aid || !sid || !actId) throw new Error('School or activity not found');

  const [rows] = await pool.execute(
    `SELECT id, contact_type, activity_at
     FROM outreach_activities
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?
     LIMIT 1`,
    [actId, sid, aid]
  );
  if (!rows?.[0]) throw new Error('Activity not found');

  const fields = [];
  const params = [];
  if (patch.activity_at != null) {
    const activityAt = new Date(patch.activity_at);
    if (Number.isNaN(activityAt.getTime())) throw new Error('Invalid activity date');
    fields.push('activity_at = ?');
    params.push(activityAt.toISOString().slice(0, 19).replace('T', ' '));
  }
  if (patch.summary !== undefined) {
    fields.push('summary = ?');
    params.push(patch.summary ? String(patch.summary).slice(0, 500) : null);
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?');
    params.push(patch.notes ? String(patch.notes) : null);
  }
  if (!fields.length) return getOutreachSchool(aid, sid);

  params.push(actId, sid, aid);
  await pool.execute(
    `UPDATE outreach_activities SET ${fields.join(', ')}
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?`,
    params
  );

  const [maxRow] = await pool.execute(
    `SELECT MAX(activity_at) AS mx FROM outreach_activities WHERE outreach_school_id = ?`,
    [sid]
  );
  await pool.execute(
    `UPDATE outreach_schools SET last_contact_at = ? WHERE id = ? AND agency_id = ?`,
    [maxRow?.[0]?.mx || null, sid, aid]
  );

  return getOutreachSchool(aid, sid);
}

export async function markFollowUpNeededIfNotPartnered(agencyId, schoolId) {
  await pool.execute(
    `UPDATE outreach_schools
     SET outreach_stage = 'follow_up_needed'
     WHERE agency_id = ? AND id = ? AND outreach_stage <> 'partnered'`,
    [agencyId, schoolId]
  );
}

export async function reconcileVisitedSchoolsFollowUp(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return 0;
  const [result] = await pool.execute(
    `UPDATE outreach_schools s
     SET s.outreach_stage = 'follow_up_needed'
     WHERE s.agency_id = ?
       AND s.outreach_stage <> 'partnered'
       AND EXISTS (
         SELECT 1 FROM outreach_activities a
         WHERE a.outreach_school_id = s.id AND a.contact_type = 'visit'
       )`,
    [id]
  );
  return Number(result?.affectedRows || 0);
}

export async function getOutreachSummary(agencyId) {
  await ensureOutreachDirectory(agencyId);
  const [stageRows] = await pool.execute(
    `SELECT outreach_stage, COUNT(*) AS n
     FROM outreach_schools
     WHERE agency_id = ?
     GROUP BY outreach_stage`,
    [agencyId]
  );
  const [districtRows] = await pool.execute(
    `SELECT district_name, COUNT(*) AS n
     FROM outreach_schools
     WHERE agency_id = ?
     GROUP BY district_name
     ORDER BY district_name`,
    [agencyId]
  );
  const [typeRows] = await pool.execute(
    `SELECT contact_type, COUNT(*) AS n
     FROM outreach_activities
     WHERE agency_id = ?
     GROUP BY contact_type`,
    [agencyId]
  );
  const [follow] = await pool.execute(
    `SELECT COUNT(*) AS n
     FROM outreach_schools
     WHERE agency_id = ?
       AND next_follow_up_at IS NOT NULL
       AND next_follow_up_at <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
    [agencyId]
  );
  let missingAddresses = 0;
  try {
    const [miss] = await pool.execute(
      `SELECT COUNT(*) AS n
       FROM outreach_schools
       WHERE agency_id = ?
         AND (address IS NULL OR address = '' OR address NOT REGEXP '[0-9]' OR address_status = 'missing')`,
      [agencyId]
    );
    missingAddresses = Number(miss?.[0]?.n || 0);
  } catch {
    missingAddresses = 0;
  }
  const byStage = {};
  let total = 0;
  for (const r of stageRows || []) {
    byStage[r.outreach_stage] = Number(r.n || 0);
    total += Number(r.n || 0);
  }
  const byType = { email: 0, letter: 0, phone: 0, visit: 0 };
  for (const r of typeRows || []) {
    byType[r.contact_type] = Number(r.n || 0);
  }
  return {
    total_schools: total,
    partnered: byStage.partnered || 0,
    active_outreach: total - (byStage.not_started || 0) - (byStage.on_hold || 0),
    meeting_scheduled: byStage.meeting_scheduled || 0,
    follow_ups_due: Number(follow?.[0]?.n || 0),
    missing_addresses: missingAddresses,
    by_stage: byStage,
    by_district: (districtRows || []).map((r) => ({ district: r.district_name, count: Number(r.n || 0) })),
    by_contact_type: byType,
    ...(await outreachHubRollupCounts(agencyId))
  };
}

async function outreachHubRollupCounts(agencyId) {
  let planned_trips = 0;
  let completed_trips = 0;
  let open_outreach_tasks = 0;
  try {
    const [tripRows] = await pool.execute(
      `SELECT status, COUNT(*) AS n
       FROM outreach_trips
       WHERE agency_id = ?
       GROUP BY status`,
      [agencyId]
    );
    for (const r of tripRows || []) {
      const n = Number(r.n || 0);
      if (r.status === 'completed') completed_trips += n;
      else if (['planned', 'in_progress'].includes(String(r.status || ''))) planned_trips += n;
    }
  } catch {
    planned_trips = 0;
    completed_trips = 0;
  }
  try {
    const [taskRows] = await pool.execute(
      `SELECT COUNT(*) AS n
       FROM tasks t
       INNER JOIN task_lists tl ON tl.id = t.task_list_id
       WHERE tl.agency_id = ?
         AND LOWER(TRIM(tl.name)) = 'outreach'
         AND COALESCE(t.status, '') NOT IN ('completed', 'cancelled', 'archived')`,
      [agencyId]
    );
    open_outreach_tasks = Number(taskRows?.[0]?.n || 0);
  } catch {
    open_outreach_tasks = 0;
  }
  return { planned_trips, completed_trips, open_outreach_tasks };
}

export async function listOutreachAssignableUsers(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND (
         LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin', 'support')
         OR COALESCE(u.has_outreach_access, 0) = 1
       )
     ORDER BY u.last_name, u.first_name, u.id`,
    [aid]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    email: r.email || null
  }));
}

export async function listOutreachTimeline(agencyId, filters = {}) {
  const where = ['a.agency_id = ?'];
  const params = [agencyId];
  const type = String(filters.contactType || filters.contact_type || '').trim().toLowerCase();
  if (type && isValidContactType(type)) {
    where.push('a.contact_type = ?');
    params.push(type);
  }
  if (filters.from) {
    where.push('a.activity_at >= ?');
    params.push(String(filters.from).slice(0, 10));
  }
  if (filters.to) {
    where.push('a.activity_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(String(filters.to).slice(0, 10));
  }
  const [rows] = await pool.execute(
    `SELECT
       a.id, a.contact_type, a.activity_at, a.summary, a.notes,
       s.id AS school_id, s.name AS school_name, s.district_name, s.city, s.school_level, s.outreach_stage,
       TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS created_by_name
     FROM outreach_activities a
     JOIN outreach_schools s ON s.id = a.outreach_school_id
     LEFT JOIN users u ON u.id = a.created_by_user_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.activity_at DESC, a.id DESC
     LIMIT 500`,
    params
  );
  return rows || [];
}

export async function listOutreachSchoolOnboarding(agencyId, schoolId) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) return [];
  const { default: SchoolOnboardingInvite } = await import('../models/SchoolOnboardingInvite.model.js');
  const { serializeInvite } = await import('./schoolOnboarding.service.js');
  const linkedId = Number(school.linked_organization_id || 0) || null;
  try {
    const [rows] = await pool.execute(
      `SELECT i.*
       FROM school_onboarding_invites i
       WHERE i.agency_id = ?
         AND (
           i.outreach_school_id = ?
           OR (? IS NOT NULL AND i.school_organization_id = ?)
           OR LOWER(TRIM(i.school_name)) = LOWER(TRIM(?))
         )
       ORDER BY i.created_at DESC`,
      [agencyId, schoolId, linkedId, linkedId, school.name]
    );
    return (rows || []).map((r) => serializeInvite(SchoolOnboardingInvite.normalizeRow(r), { admin: true }));
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [rows] = await pool.execute(
      `SELECT i.*
       FROM school_onboarding_invites i
       WHERE i.agency_id = ?
         AND (
           (? IS NOT NULL AND i.school_organization_id = ?)
           OR LOWER(TRIM(i.school_name)) = LOWER(TRIM(?))
         )
       ORDER BY i.created_at DESC`,
      [agencyId, linkedId, linkedId, school.name]
    );
    return (rows || []).map((r) => serializeInvite(SchoolOnboardingInvite.normalizeRow(r), { admin: true }));
  }
}

export async function sendOutreachSchoolOnboarding({
  agencyId,
  schoolId,
  actorUserId,
  contactFirstName,
  contactLastName,
  contactEmail,
  sendEmail = true,
  priorSchoolDecision = null,
  resetPassword = false,
  confirmExistingSchoolStaff = false
} = {}) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  const S = await import('./schoolOnboarding.service.js');
  const result = await S.createInvite({
    agencyId,
    contactFirstName,
    contactLastName,
    contactEmail,
    schoolName: school.name,
    invitedByUserId: actorUserId || null,
    sendEmail: sendEmail === true,
    priorSchoolDecision,
    resetPassword,
    confirmExistingSchoolStaff
  });
  const inviteId = Number(result?.invite?.id || 0);
  if (inviteId) {
    try {
      await pool.execute(
        `UPDATE school_onboarding_invites SET outreach_school_id = ? WHERE id = ?`,
        [schoolId, inviteId]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
  }
  if (school.outreach_stage === 'not_started') {
    try {
      await updateOutreachSchool(agencyId, schoolId, { outreach_stage: 'contacted' });
    } catch {
      /* ignore */
    }
  }
  const invites = await listOutreachSchoolOnboarding(agencyId, schoolId);
  return {
    ...result,
    invite: invites.find((i) => Number(i.id) === inviteId) || result.invite,
    invites
  };
}

function mysqlDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function addOutreachSchoolNote(agencyId, schoolId, bodyOrPayload, userId) {
  const payload = bodyOrPayload && typeof bodyOrPayload === 'object' && !Array.isArray(bodyOrPayload)
    ? bodyOrPayload
    : { body: bodyOrPayload };
  const text = String(payload.body || payload.notes || '').trim();
  if (!text) throw new Error('Note text is required');
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) throw new Error('School not found');

  const noteKindRaw = String(payload.note_kind || payload.noteKind || 'general').trim().toLowerCase();
  const noteKind = ['general', 'conversation', 'follow_up'].includes(noteKindRaw) ? noteKindRaw : 'general';
  const tripId = payload.trip_id || payload.tripId ? Number(payload.trip_id || payload.tripId) : null;
  const tripStopId = payload.trip_stop_id || payload.tripStopId
    ? Number(payload.trip_stop_id || payload.tripStopId)
    : null;
  let contactId = payload.contact_id || payload.contactId
    ? Number(payload.contact_id || payload.contactId)
    : null;
  let spokenWith = String(payload.spoken_with_name || payload.spokenWithName || '').trim() || null;
  const followUpAt = payload.follow_up_at || payload.followUpAt
    ? String(payload.follow_up_at || payload.followUpAt).slice(0, 10)
    : null;

  // Conversation: create contact from typed name if needed
  if (noteKind === 'conversation' && spokenWith && !contactId) {
    const existing = (school.contacts || []).find(
      (c) => String(c.full_name || '').trim().toLowerCase() === spokenWith.toLowerCase()
    );
    if (existing) {
      contactId = Number(existing.id);
    } else {
      const updated = await addOutreachSchoolContact(agencyId, schoolId, {
        full_name: spokenWith,
        title: payload.contact_title || payload.contactTitle || null,
        email: payload.contact_email || payload.contactEmail || null,
        phone: payload.contact_phone || payload.contactPhone || null,
        is_primary: false
      }, userId);
      const created = (updated?.contacts || []).find(
        (c) => String(c.full_name || '').trim().toLowerCase() === spokenWith.toLowerCase()
      );
      contactId = created?.id ? Number(created.id) : null;
    }
  }

  try {
    await pool.execute(
      `INSERT INTO outreach_school_notes (
         outreach_school_id, agency_id, body, created_by_user_id,
         note_kind, trip_id, trip_stop_id, contact_id, spoken_with_name, follow_up_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        agencyId,
        text.slice(0, 8000),
        userId || null,
        noteKind,
        tripId,
        tripStopId,
        contactId,
        spokenWith,
        followUpAt
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await pool.execute(
      `INSERT INTO outreach_school_notes (outreach_school_id, agency_id, body, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [schoolId, agencyId, text.slice(0, 8000), userId || null]
    );
  }

  if (noteKind === 'follow_up' && followUpAt) {
    await pool.execute(
      `UPDATE outreach_schools
       SET next_follow_up_at = ?,
           outreach_stage = IF(outreach_stage = 'partnered', outreach_stage, 'follow_up_needed')
       WHERE id = ? AND agency_id = ?`,
      [followUpAt, schoolId, agencyId]
    );
  }

  return getOutreachSchool(agencyId, schoolId);
}

export async function addOutreachSchoolContact(agencyId, schoolId, payload, userId) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) throw new Error('School not found');
  const fullName = String(payload?.full_name || payload?.fullName || '').trim();
  if (!fullName) throw new Error('Contact name is required');
  const email = String(payload?.email || '').trim().toLowerCase() || null;
  const phone = String(payload?.phone || '').trim() || null;
  const title = String(payload?.title || '').trim() || null;
  const isPrimary = payload?.is_primary === true || payload?.isPrimary === true || payload?.is_primary === 1;

  let agencyContactId = null;
  try {
    const AgencyContact = (await import('../models/AgencyContact.model.js')).default;
    const existing = email ? await AgencyContact.findByEmail(email, agencyId) : null;
    const contact = existing || await AgencyContact.create({
      agencyId,
      createdByUserId: userId || null,
      shareWithAll: true,
      fullName,
      email,
      phone,
      source: 'outreach_hub',
      sourceRefId: schoolId
    });
    agencyContactId = contact?.id || null;
    if (existing?.id && existing.share_with_all !== 1 && existing.share_with_all !== true) {
      await AgencyContact.update(existing.id, { share_with_all: true });
    }
    if (agencyContactId && school.linked_organization_id) {
      await AgencyContact.addSchoolAssignment(agencyContactId, school.linked_organization_id);
    }
  } catch (e) {
    console.warn('[outreachHub] agency contact sync skipped', e?.message);
  }

  if (isPrimary) {
    await pool.execute(
      `UPDATE outreach_school_contacts SET is_primary = 0 WHERE outreach_school_id = ?`,
      [schoolId]
    );
  }
  await pool.execute(
    `INSERT INTO outreach_school_contacts (
       outreach_school_id, agency_id, full_name, email, phone, title, is_primary,
       agency_contact_id, created_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, agencyId, fullName, email, phone, title, isPrimary ? 1 : 0, agencyContactId, userId || null]
  );
  if (isPrimary) {
    await pool.execute(
      `UPDATE outreach_schools
       SET primary_contact_name = ?, primary_contact_email = ?, primary_contact_phone = ?,
           primary_contact_title = ?, agency_contact_id = ?
       WHERE id = ?`,
      [fullName, email, phone, title, agencyContactId, schoolId]
    );
  }
  if (isPrimary && school.linked_organization_id) {
    try {
      await pool.execute(
        `UPDATE school_contacts SET is_primary = FALSE WHERE school_organization_id = ?`,
        [school.linked_organization_id]
      );
      await pool.execute(
        `INSERT INTO school_contacts
           (school_organization_id, full_name, email, role_title, notes, is_primary)
         VALUES (?, ?, ?, ?, 'Outreach Hub primary contact', TRUE)`,
        [school.linked_organization_id, fullName, email, title]
      );
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') {
        console.warn('[outreachHub] school_contacts sync skipped', e?.message);
      }
    }
  }
  return getOutreachSchool(agencyId, schoolId);
}

async function syncPrimaryContactFields(agencyId, schoolId) {
  const [rows] = await pool.execute(
    `SELECT full_name, email, phone, title, agency_contact_id
     FROM outreach_school_contacts
     WHERE outreach_school_id = ? AND agency_id = ? AND is_primary = 1
     ORDER BY id DESC
     LIMIT 1`,
    [schoolId, agencyId]
  );
  const primary = rows?.[0] || null;
  await pool.execute(
    `UPDATE outreach_schools
     SET primary_contact_name = ?, primary_contact_email = ?, primary_contact_phone = ?,
         primary_contact_title = ?, agency_contact_id = ?
     WHERE id = ? AND agency_id = ?`,
    [
      primary?.full_name || null,
      primary?.email || null,
      primary?.phone || null,
      primary?.title || null,
      primary?.agency_contact_id || null,
      schoolId,
      agencyId
    ]
  );
}

export async function updateOutreachSchoolContact(agencyId, schoolId, contactId, payload = {}) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) throw new Error('School not found');
  const cid = Number(contactId || 0);
  if (!cid) throw new Error('Contact not found');
  const [rows] = await pool.execute(
    `SELECT * FROM outreach_school_contacts
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?
     LIMIT 1`,
    [cid, schoolId, agencyId]
  );
  if (!rows?.[0]) throw new Error('Contact not found');

  const fullName = payload.full_name !== undefined || payload.fullName !== undefined
    ? String(payload.full_name || payload.fullName || '').trim()
    : String(rows[0].full_name || '').trim();
  if (!fullName) throw new Error('Contact name is required');
  const email = payload.email !== undefined
    ? (String(payload.email || '').trim().toLowerCase() || null)
    : (rows[0].email || null);
  const phone = payload.phone !== undefined
    ? (String(payload.phone || '').trim() || null)
    : (rows[0].phone || null);
  const title = payload.title !== undefined
    ? (String(payload.title || '').trim() || null)
    : (rows[0].title || null);
  const isPrimary = payload.is_primary !== undefined || payload.isPrimary !== undefined
    ? (payload.is_primary === true || payload.isPrimary === true || payload.is_primary === 1 || payload.isPrimary === 1)
    : Number(rows[0].is_primary) === 1;

  if (isPrimary) {
    await pool.execute(
      `UPDATE outreach_school_contacts SET is_primary = 0 WHERE outreach_school_id = ? AND id <> ?`,
      [schoolId, cid]
    );
  }

  await pool.execute(
    `UPDATE outreach_school_contacts
     SET full_name = ?, email = ?, phone = ?, title = ?, is_primary = ?
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?`,
    [fullName, email, phone, title, isPrimary ? 1 : 0, cid, schoolId, agencyId]
  );

  if (isPrimary || Number(rows[0].is_primary) === 1) {
    await syncPrimaryContactFields(agencyId, schoolId);
  }
  return getOutreachSchool(agencyId, schoolId);
}

export async function deleteOutreachSchoolContact(agencyId, schoolId, contactId) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) throw new Error('School not found');
  const cid = Number(contactId || 0);
  if (!cid) throw new Error('Contact not found');
  const [rows] = await pool.execute(
    `SELECT id, is_primary FROM outreach_school_contacts
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?
     LIMIT 1`,
    [cid, schoolId, agencyId]
  );
  if (!rows?.[0]) throw new Error('Contact not found');
  const wasPrimary = Number(rows[0].is_primary) === 1;
  await pool.execute(
    `DELETE FROM outreach_school_contacts
     WHERE id = ? AND outreach_school_id = ? AND agency_id = ?`,
    [cid, schoolId, agencyId]
  );
  if (wasPrimary) {
    const [next] = await pool.execute(
      `SELECT id FROM outreach_school_contacts
       WHERE outreach_school_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [schoolId]
    );
    if (next?.[0]?.id) {
      await pool.execute(
        `UPDATE outreach_school_contacts SET is_primary = 1 WHERE id = ?`,
        [next[0].id]
      );
    }
    await syncPrimaryContactFields(agencyId, schoolId);
  }
  return getOutreachSchool(agencyId, schoolId);
}

async function insertOutreachContactIfMissing(agencyId, schoolId, contact, { source = 'manual', sourceUserId = null, userId = null } = {}) {
  const fullName = String(contact.full_name || contact.fullName || '').trim();
  if (!fullName) return false;
  const email = String(contact.email || '').trim().toLowerCase() || null;
  const phone = String(contact.phone || '').trim() || null;
  const title = String(contact.title || contact.role_title || '').trim() || null;
  if (email) {
    const [dup] = await pool.execute(
      `SELECT id FROM outreach_school_contacts
       WHERE outreach_school_id = ? AND LOWER(email) = ? LIMIT 1`,
      [schoolId, email]
    );
    if (dup?.length) return false;
  } else {
    const [dup] = await pool.execute(
      `SELECT id FROM outreach_school_contacts
       WHERE outreach_school_id = ? AND LOWER(full_name) = LOWER(?) AND (email IS NULL OR email = '')
       LIMIT 1`,
      [schoolId, fullName]
    );
    if (dup?.length) return false;
  }
  try {
    await pool.execute(
      `INSERT INTO outreach_school_contacts (
         outreach_school_id, agency_id, full_name, email, phone, title, is_primary,
         agency_contact_id, created_by_user_id, source, source_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
      [schoolId, agencyId, fullName, email, phone, title, userId || null, source, sourceUserId]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await pool.execute(
      `INSERT INTO outreach_school_contacts (
         outreach_school_id, agency_id, full_name, email, phone, title, is_primary,
         agency_contact_id, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
      [schoolId, agencyId, fullName, email, phone, title, userId || null]
    );
  }
  return true;
}

function findConfidentOrgForSchool(school, orgs, siblingSchools = []) {
  const city = String(school.city || '').trim().toLowerCase();
  const hits = [];
  for (const org of orgs || []) {
    const orgCity = String(org.city || '').trim().toLowerCase();
    if (city && orgCity && city !== orgCity) continue;
    if (isUniquePrefixSchoolMatch(school, org.name, siblingSchools)) hits.push(org);
  }
  if (hits.length === 1) return hits[0];
  return null;
}

/**
 * Copy current school_staff users and school_contacts onto matching Outreach Hub schools.
 * Never overwrites existing outreach contacts.
 */
export async function syncExistingSchoolStaffToOutreachContacts(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return { inserted: 0, schools: 0 };
  const last = lastStaffContactSync.get(id) || 0;
  if (Date.now() - last < 60 * 1000) return { inserted: 0, schools: 0, skipped: true };
  lastStaffContactSync.set(id, Date.now());

  const schools = await queryOutreachSchoolRows(id, {});
  const affiliated = await loadAffiliatedSchools(id);
  const orgById = new Map((affiliated || []).map((o) => [Number(o.id), o]));

  const [staffRows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, ua.agency_id AS school_org_id
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     INNER JOIN agencies a ON a.id = ua.agency_id AND LOWER(COALESCE(a.organization_type,'')) = 'school'
     WHERE u.role = 'school_staff'
       AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','DELETED'))`
  );
  let contactRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT school_organization_id, full_name, email, role_title, is_primary
       FROM school_contacts`
    );
    contactRows = rows || [];
  } catch {
    contactRows = [];
  }

  const staffByOrg = new Map();
  for (const r of staffRows || []) {
    const oid = Number(r.school_org_id);
    if (!staffByOrg.has(oid)) staffByOrg.set(oid, []);
    staffByOrg.get(oid).push(r);
  }
  const contactsByOrg = new Map();
  for (const r of contactRows) {
    const oid = Number(r.school_organization_id);
    if (!contactsByOrg.has(oid)) contactsByOrg.set(oid, []);
    contactsByOrg.get(oid).push(r);
  }

  let inserted = 0;
  let matchedSchools = 0;
  for (const school of schools) {
    const linked = school.linked_organization_id ? orgById.get(Number(school.linked_organization_id)) : null;
    const org = (linked && isUniquePrefixSchoolMatch(school, linked.name, schools)
      && (!school.city || !linked.city || String(school.city).toLowerCase() === String(linked.city).toLowerCase()))
      ? linked
      : findConfidentOrgForSchool(school, affiliated, schools);
    if (!org) continue;
    matchedSchools += 1;
    const seen = new Set();
    const add = async (payload, sourceUserId = null) => {
      const key = String(payload.email || payload.full_name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const ok = await insertOutreachContactIfMissing(id, school.id, payload, {
        source: 'school_staff_sync',
        sourceUserId
      });
      if (ok) inserted += 1;
    };
    for (const u of staffByOrg.get(Number(org.id)) || []) {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.replace(/\s+/g, ' ').trim();
      await add({ full_name: fullName, email: u.email, title: 'School staff' }, u.id);
    }
    for (const c of contactsByOrg.get(Number(org.id)) || []) {
      await add({
        full_name: c.full_name,
        email: c.email,
        title: c.role_title
      });
    }
  }
  return { inserted, schools: matchedSchools };
}

export async function previewHistoricalOutreachImport(agencyId, rows = [], { districtIncludes = 'denver public' } = {}) {
  const schools = await queryOutreachSchoolRows(agencyId, {});
  const preview = [];
  for (const raw of rows || []) {
    const mapped = mapHistoricalRow(raw);
    const match = matchImportSchool(mapped.school, schools, { districtIncludes });
    const contacts = parsePocInfo(mapped.pocInfo);
    preview.push({
      spreadsheet_name: mapped.school,
      status: match.status,
      reason: match.reason,
      matched_school: match.school ? { id: match.school.id, name: match.school.name } : null,
      contacts,
      has_notes: Boolean(mapped.combinedNotes),
      visit_count: mapped.visitCount,
      meeting: mapped.meeting,
      services_started: mapped.servicesStarted,
      follow_up_email: mapped.followUpEmail
    });
  }
  return {
    matched: preview.filter((p) => p.status === 'match').length,
    skipped: preview.filter((p) => p.status === 'skip').length,
    rows: preview
  };
}

export async function importHistoricalOutreachRows(agencyId, rows = [], userId, { districtIncludes = 'denver public', dryRun = false } = {}) {
  const id = Number(agencyId || 0);
  await ensureOutreachDirectory(id);
  lastStaffContactSync.delete(id);
  await syncExistingSchoolStaffToOutreachContacts(id);

  const schools = await queryOutreachSchoolRows(id, {});
  const results = [];
  let contactsAdded = 0;
  let notesAdded = 0;
  let visitsAdded = 0;

  for (const raw of rows || []) {
    const mapped = mapHistoricalRow(raw);
    const match = matchImportSchool(mapped.school, schools, { districtIncludes });
    if (match.status !== 'match' || !match.school) {
      results.push({ spreadsheet_name: mapped.school, status: 'skip', reason: match.reason });
      continue;
    }
    const schoolId = match.school.id;
    const [existingContacts] = await pool.execute(
      'SELECT COUNT(*) AS n FROM outreach_school_contacts WHERE outreach_school_id = ?',
      [schoolId]
    );
    const [existingNotes] = await pool.execute(
      'SELECT COUNT(*) AS n FROM outreach_school_notes WHERE outreach_school_id = ?',
      [schoolId]
    );
    const [existingVisits] = await pool.execute(
      `SELECT COUNT(*) AS n FROM outreach_activities
       WHERE outreach_school_id = ? AND contact_type = 'visit'`,
      [schoolId]
    );
    const hasContacts = Number(existingContacts?.[0]?.n || 0) > 0;
    const hasNotes = Number(existingNotes?.[0]?.n || 0) > 0;
    const hasVisits = Number(existingVisits?.[0]?.n || 0) > 0;

    const parsedContacts = parsePocInfo(mapped.pocInfo);
    const actions = { contacts: 0, notes: 0, visits: 0, skipped_because: [] };

    if (hasContacts) actions.skipped_because.push('contacts_already_in_app');
    else if (!dryRun) {
      for (const c of parsedContacts) {
        const ok = await insertOutreachContactIfMissing(id, schoolId, c, {
          source: 'historical_import',
          userId
        });
        if (ok) {
          actions.contacts += 1;
          contactsAdded += 1;
        }
      }
    } else {
      actions.contacts = hasContacts ? 0 : parsedContacts.length;
    }

    if (mapped.combinedNotes) {
      if (hasNotes) actions.skipped_because.push('notes_already_in_app');
      else if (!dryRun) {
        try {
          await pool.execute(
            `INSERT INTO outreach_school_notes (outreach_school_id, agency_id, body, created_by_user_id, source)
             VALUES (?, ?, ?, ?, 'historical_import')`,
            [schoolId, id, mapped.combinedNotes.slice(0, 8000), userId || null]
          );
        } catch (e) {
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
          await pool.execute(
            `INSERT INTO outreach_school_notes (outreach_school_id, agency_id, body, created_by_user_id)
             VALUES (?, ?, ?, ?)`,
            [schoolId, id, mapped.combinedNotes.slice(0, 8000), userId || null]
          );
        }
        actions.notes = 1;
        notesAdded += 1;
      } else actions.notes = 1;
    }

    const visitN = Number(mapped.visitCount);
    const hadVisitSignal = (Number.isFinite(visitN) && visitN > 0) || mapped.meeting;
    if (hadVisitSignal) {
      if (hasVisits) actions.skipped_because.push('visits_already_in_app');
      else if (!dryRun) {
        const when = mapped.date ? new Date(mapped.date) : new Date();
        const mysqlAt = Number.isNaN(when.getTime())
          ? mysqlDateTime(new Date())
          : mysqlDateTime(when);
        const summary = mapped.meeting
          ? 'Historical meeting (imported)'
          : `Historical visit${Number.isFinite(visitN) ? ` #${visitN}` : ''} (imported)`;
        try {
          await pool.execute(
            `INSERT INTO outreach_activities (
               outreach_school_id, agency_id, contact_type, activity_at, summary, notes, created_by_user_id, source
             ) VALUES (?, ?, 'visit', ?, ?, ?, ?, 'historical_import')`,
            [schoolId, id, mysqlAt, summary, mapped.combinedNotes || null, userId || null]
          );
        } catch (e) {
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
          await pool.execute(
            `INSERT INTO outreach_activities (
               outreach_school_id, agency_id, contact_type, activity_at, summary, notes, created_by_user_id
             ) VALUES (?, ?, 'visit', ?, ?, ?, ?)`,
            [schoolId, id, mysqlAt, summary, mapped.combinedNotes || null, userId || null]
          );
        }
        actions.visits = 1;
        visitsAdded += 1;
      } else actions.visits = 1;
    }

    if (hadVisitSignal && !dryRun) {
      await markFollowUpNeededIfNotPartnered(id, schoolId);
    }

    results.push({
      spreadsheet_name: mapped.school,
      status: 'imported',
      matched_school: match.school.name,
      actions
    });
  }

  return { contactsAdded, notesAdded, visitsAdded, dryRun: !!dryRun, results };
}

export async function rankSchoolsFromOrigin(agencyId, {
  originSchoolId = null,
  secondSchoolId = null,
  excludeIds = [],
  charterOnly = false
} = {}) {
  const schools = await queryOutreachSchoolRows(agencyId, { charterOnly: !!charterOnly });
  const skip = new Set((excludeIds || []).map((id) => Number(id)));
  if (originSchoolId) skip.add(Number(originSchoolId));
  if (secondSchoolId) skip.add(Number(secondSchoolId));

  // Closest-to-both: rank by detour extra miles between two anchors
  if (originSchoolId && secondSchoolId) {
    const schoolA = schools.find((s) => Number(s.id) === Number(originSchoolId))
      || (await queryOutreachSchoolRows(agencyId, {})).find((s) => Number(s.id) === Number(originSchoolId));
    const schoolB = schools.find((s) => Number(s.id) === Number(secondSchoolId))
      || (await queryOutreachSchoolRows(agencyId, {})).find((s) => Number(s.id) === Number(secondSchoolId));
    const pointA = schoolMapPoint(schoolA);
    const pointB = schoolMapPoint(schoolB);
    const ranked = rankSchoolsBetweenAnchors(schools, pointA, pointB, { excludeIds: [...skip] });
    return {
      origin: {
        type: 'between',
        school_id: Number(originSchoolId),
        second_school_id: Number(secondSchoolId),
        school_a_name: schoolA?.name || null,
        school_b_name: schoolB?.name || null
      },
      mode: 'closest_to_both',
      schools: ranked
    };
  }

  const origin = originSchoolId
    ? schoolMapPoint(schools.find((s) => Number(s.id) === Number(originSchoolId))
      || (await queryOutreachSchoolRows(agencyId, {})).find((s) => Number(s.id) === Number(originSchoolId)))
    : { lat: WINDCHIME_ORIGIN.lat, lng: WINDCHIME_ORIGIN.lng, approx: false };
  const ranked = schools
    .filter((s) => !skip.has(Number(s.id)))
    .map((s) => {
      const pt = schoolMapPoint(s);
      const miles = origin && pt ? haversineMiles(origin, pt) : null;
      return {
        ...s,
        miles_from_origin: miles,
        distance_approx: !!(origin?.approx || pt?.approx)
      };
    })
    .sort((a, b) => {
      if (a.miles_from_origin == null && b.miles_from_origin == null) return String(a.name).localeCompare(String(b.name));
      if (a.miles_from_origin == null) return 1;
      if (b.miles_from_origin == null) return -1;
      return a.miles_from_origin - b.miles_from_origin;
    });
  return {
    origin: originSchoolId
      ? { type: 'school', school_id: Number(originSchoolId) }
      : { type: 'windchime', ...WINDCHIME_ORIGIN },
    mode: 'from_origin',
    schools: ranked
  };
}

async function enrichDrivingDistances(origin, ranked) {
  try {
    const { drivingDistancesFromOrigin } = await import('./googleDistanceMatrix.service.js');
    const slice = ranked.filter((s) => s.address || (s.lat && s.lng)).slice(0, 40);
    if (!slice.length) return ranked;
    const originAddress = origin?.address || WINDCHIME_ORIGIN.address;
    const map = await drivingDistancesFromOrigin({
      originLat: origin?.lat,
      originLng: origin?.lng,
      originAddress,
      entries: slice.map((s) => ({
        key: String(s.id),
        destination: (Number.isFinite(s.lat) && Number.isFinite(s.lng))
          ? `${s.lat},${s.lng}`
          : String(s.address || `${s.name}, ${s.city}, CO`)
      }))
    });
    return ranked.map((s) => {
      const hit = map.get(String(s.id));
      if (!hit?.ok || !Number.isFinite(hit.meters)) return s;
      return {
        ...s,
        miles_from_origin: Math.round((hit.meters / 1609.344) * 10) / 10,
        duration_text: hit.durationText || null,
        distance_approx: false
      };
    }).sort((a, b) => (a.miles_from_origin ?? 9999) - (b.miles_from_origin ?? 9999));
  } catch {
    return ranked;
  }
}

export async function previewTripStops(agencyId, {
  originSchoolId = null,
  secondSchoolId = null,
  excludeIds = [],
  useDriving = false,
  charterOnly = false
} = {}) {
  const geo = await backfillOutreachSchoolGeocodes(agencyId, { limit: 40 });
  const ranked = await rankSchoolsFromOrigin(agencyId, {
    originSchoolId,
    secondSchoolId,
    excludeIds,
    charterOnly
  });
  if (!useDriving || ranked.mode === 'closest_to_both') {
    return { ...ranked, geocode_remaining: geo.remaining };
  }
  const origin = originSchoolId
    ? schoolMapPoint((await queryOutreachSchoolRows(agencyId, {})).find((s) => Number(s.id) === Number(originSchoolId)))
    : WINDCHIME_ORIGIN;
  const schools = await enrichDrivingDistances(
    originSchoolId
      ? { ...origin, address: ranked.origin?.address }
      : WINDCHIME_ORIGIN,
    ranked.schools
  );
  return { ...ranked, schools, geocode_remaining: geo.remaining };
}

function tripWasEdited(row) {
  if (row?.updated_by_user_id) return true;
  const created = row?.created_at ? new Date(row.created_at).getTime() : 0;
  const updated = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  return updated > created + 2000;
}

function mapTripRow(row, stops = [], participants = []) {
  const mappedStops = (stops || []).map((s) => ({
    ...s,
    id: Number(s.id),
    trip_id: Number(s.trip_id),
    outreach_school_id: Number(s.outreach_school_id),
    stop_order: Number(s.stop_order),
    miles_from_prev: s.miles_from_prev != null ? Number(s.miles_from_prev) : null,
    lat: s.lat != null ? Number(s.lat) : null,
    lng: s.lng != null ? Number(s.lng) : null,
    attendance_status: s.attendance_status || 'pending',
    attendance_notes: s.attendance_notes || null,
    attended_at: s.attended_at || null,
    stop_color: s.stop_color || stopColorForOrder(Math.max(0, Number(s.stop_order || 1) - 1))
  }));
  return {
    id: Number(row.id),
    agency_id: Number(row.agency_id),
    title: row.title,
    status: row.status,
    origin_label: row.origin_label,
    origin_address: row.origin_address,
    planned_date: row.planned_date,
    completed_at: row.completed_at,
    notes: row.notes,
    created_by_user_id: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at || null,
    updated_by_user_id: row.updated_by_user_id != null ? Number(row.updated_by_user_id) : null,
    updated_by_name: row.updated_by_name || null,
    was_edited: tripWasEdited(row),
    outbound_miles: tripOutboundMiles(mappedStops),
    return_miles: tripReturnMiles(mappedStops),
    round_trip_miles: tripRoundTripMiles(mappedStops),
    stops: mappedStops,
    participants
  };
}

export async function listOutreachTrips(agencyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM outreach_trips WHERE agency_id = ? ORDER BY COALESCE(planned_date, created_at) DESC, id DESC`,
    [agencyId]
  );
  const trips = [];
  for (const row of rows || []) {
    trips.push(await getOutreachTrip(agencyId, row.id));
  }
  return trips.filter(Boolean);
}

export async function getOutreachTrip(agencyId, tripId) {
  const [rows] = await pool.execute(
    `SELECT t.*,
            TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name)) AS created_by_name,
            TRIM(CONCAT_WS(' ', uu.first_name, uu.last_name)) AS updated_by_name
     FROM outreach_trips t
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     LEFT JOIN users uu ON uu.id = t.updated_by_user_id
     WHERE t.agency_id = ? AND t.id = ?
     LIMIT 1`,
    [agencyId, tripId]
  );
  const row = rows?.[0];
  if (!row) return null;
  const [stops] = await pool.execute(
    `SELECT ts.*, s.name AS school_name, s.city, s.district_name, s.address, s.school_level,
            s.lat, s.lng, s.outreach_stage
     FROM outreach_trip_stops ts
     JOIN outreach_schools s ON s.id = ts.outreach_school_id
     WHERE ts.trip_id = ?
     ORDER BY ts.stop_order ASC`,
    [tripId]
  );
  const [parts] = await pool.execute(
    `SELECT * FROM outreach_trip_participants WHERE trip_id = ? ORDER BY id ASC`,
    [tripId]
  );
  return mapTripRow(row, stops || [], parts || []);
}

export async function createOutreachTrip(agencyId, payload, userId) {
  const schoolIds = Array.isArray(payload?.schoolIds) ? payload.schoolIds.map((id) => Number(id)).filter(Boolean) : [];
  if (!schoolIds.length) throw new Error('Add at least one school to the trip');
  const title = String(payload?.title || '').trim() || `Outreach trip (${schoolIds.length} stop${schoolIds.length === 1 ? '' : 's'})`;
  const [result] = await pool.execute(
    `INSERT INTO outreach_trips (
       agency_id, title, status, origin_label, origin_address, planned_date, notes, created_by_user_id
     ) VALUES (?, ?, 'planned', ?, ?, ?, ?, ?)`,
    [
      agencyId,
      title.slice(0, 255),
      WINDCHIME_ORIGIN.label,
      WINDCHIME_ORIGIN.address,
      payload?.planned_date || payload?.plannedDate || null,
      payload?.notes ? String(payload.notes) : null,
      userId || null
    ]
  );
  const tripId = result.insertId;
  let prev = WINDCHIME_ORIGIN;
  const allSchools = await listOutreachSchools(agencyId, {});
  const byId = new Map(allSchools.map((s) => [Number(s.id), s]));
  let order = 1;
  for (const sid of schoolIds) {
    const school = byId.get(Number(sid));
    const pt = schoolMapPoint(school);
    const miles = prev && pt ? haversineMiles(prev, pt) : null;
    const color = stopColorForOrder(order - 1);
    try {
      await pool.execute(
        `INSERT INTO outreach_trip_stops (trip_id, outreach_school_id, stop_order, miles_from_prev, stop_color)
         VALUES (?, ?, ?, ?, ?)`,
        [tripId, sid, order, miles, color]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      await pool.execute(
        `INSERT INTO outreach_trip_stops (trip_id, outreach_school_id, stop_order, miles_from_prev)
         VALUES (?, ?, ?, ?)`,
        [tripId, sid, order, miles]
      );
    }
    prev = pt || prev;
    order += 1;
  }
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  for (const p of participants) {
    const name = String(p.display_name || p.displayName || p.name || '').trim();
    if (!name) continue;
    await pool.execute(
      `INSERT INTO outreach_trip_participants (trip_id, user_id, display_name, start_time, end_time)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tripId,
        p.user_id || p.userId || null,
        name.slice(0, 255),
        mysqlDateTime(p.start_time || p.startTime),
        mysqlDateTime(p.end_time || p.endTime)
      ]
    );
  }
  const trip = await getOutreachTrip(agencyId, tripId);
  await syncOutreachTripCalendarEvents(agencyId, trip, userId);
  return trip;
}

async function replaceOutreachTripStops(agencyId, tripId, schoolIds) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.status === 'completed') throw new Error('Completed trips cannot be edited');

  const ids = (Array.isArray(schoolIds) ? schoolIds : []).map((id) => Number(id)).filter(Boolean);
  if (!ids.length) throw new Error('Add at least one school to the trip');

  const existingBySchool = new Map((trip.stops || []).map((s) => [Number(s.outreach_school_id), s]));
  const keepSchoolIds = new Set(ids);
  for (const stop of trip.stops || []) {
    if (!keepSchoolIds.has(Number(stop.outreach_school_id))) {
      await pool.execute(`DELETE FROM outreach_trip_stops WHERE id = ? AND trip_id = ?`, [stop.id, tripId]);
    }
  }

  const allSchools = await listOutreachSchools(agencyId, {});
  const byId = new Map(allSchools.map((s) => [Number(s.id), s]));
  let prev = WINDCHIME_ORIGIN;
  let order = 1;
  for (const sid of ids) {
    const school = byId.get(sid);
    if (!school) throw new Error('One or more schools were not found');
    const pt = schoolMapPoint(school);
    const miles = prev && pt ? haversineMiles(prev, pt) : null;
    const color = stopColorForOrder(order - 1);
    const existing = existingBySchool.get(sid);
    if (existing) {
      try {
        await pool.execute(
          `UPDATE outreach_trip_stops
           SET stop_order = ?, miles_from_prev = ?, stop_color = ?
           WHERE id = ? AND trip_id = ?`,
          [order, miles, color, existing.id, tripId]
        );
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        await pool.execute(
          `UPDATE outreach_trip_stops
           SET stop_order = ?, miles_from_prev = ?
           WHERE id = ? AND trip_id = ?`,
          [order, miles, existing.id, tripId]
        );
      }
    } else {
      try {
        await pool.execute(
          `INSERT INTO outreach_trip_stops (trip_id, outreach_school_id, stop_order, miles_from_prev, stop_color)
           VALUES (?, ?, ?, ?, ?)`,
          [tripId, sid, order, miles, color]
        );
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        await pool.execute(
          `INSERT INTO outreach_trip_stops (trip_id, outreach_school_id, stop_order, miles_from_prev)
           VALUES (?, ?, ?, ?)`,
          [tripId, sid, order, miles]
        );
      }
    }
    prev = pt || prev;
    order += 1;
  }
}

async function touchOutreachTripEdited(tripId, userId) {
  try {
    await pool.execute(
      `UPDATE outreach_trips SET updated_by_user_id = ? WHERE id = ?`,
      [userId || null, tripId]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

export async function updateOutreachTrip(agencyId, tripId, payload, userId) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.status === 'completed') throw new Error('Completed trips cannot be edited');

  const sets = [];
  const vals = [];
  if (payload?.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (title) {
      sets.push('title = ?');
      vals.push(title.slice(0, 255));
    }
  }
  if (payload?.planned_date !== undefined || payload?.plannedDate !== undefined) {
    sets.push('planned_date = ?');
    vals.push(payload.planned_date || payload.plannedDate || null);
  }
  if (payload?.notes !== undefined) {
    sets.push('notes = ?');
    vals.push(payload.notes ? String(payload.notes) : null);
  }
  if (sets.length) {
    sets.push('updated_by_user_id = ?');
    vals.push(userId || null);
    vals.push(tripId);
    try {
      await pool.execute(`UPDATE outreach_trips SET ${sets.join(', ')} WHERE id = ?`, vals);
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const fallbackSets = sets.filter((s) => !s.startsWith('updated_by_user_id'));
      const fallbackVals = vals.slice(0, -2).concat([tripId]);
      if (fallbackSets.length) {
        await pool.execute(`UPDATE outreach_trips SET ${fallbackSets.join(', ')} WHERE id = ?`, fallbackVals);
      }
    }
  }

  if (Array.isArray(payload?.schoolIds)) {
    await replaceOutreachTripStops(agencyId, tripId, payload.schoolIds);
    await touchOutreachTripEdited(tripId, userId);
  }

  if (Array.isArray(payload?.participants)) {
    await pool.execute(`DELETE FROM outreach_trip_participants WHERE trip_id = ?`, [tripId]);
    for (const p of payload.participants) {
      const name = String(p.display_name || p.displayName || p.name || '').trim();
      if (!name) continue;
      await pool.execute(
        `INSERT INTO outreach_trip_participants (trip_id, user_id, display_name, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)`,
        [
          tripId,
          p.user_id || p.userId || null,
          name.slice(0, 255),
          mysqlDateTime(p.start_time || p.startTime),
          mysqlDateTime(p.end_time || p.endTime)
        ]
      );
    }
    await touchOutreachTripEdited(tripId, userId);
  }

  const updated = await getOutreachTrip(agencyId, tripId);
  await syncOutreachTripCalendarEvents(agencyId, updated, userId);
  return updated;
}

export async function deleteOutreachTrip(agencyId, tripId, userId) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.status === 'completed') throw new Error('Completed trips cannot be deleted');

  await syncOutreachTripCalendarEvents(agencyId, { ...trip, status: 'cancelled' }, userId);
  await pool.execute(`DELETE FROM outreach_trips WHERE id = ? AND agency_id = ?`, [tripId, agencyId]);
  return { deleted: true, id: tripId };
}

/**
 * Create/update OUTREACH_TRIP provider_schedule_events for each participant with a user_id.
 */
export async function syncOutreachTripCalendarEvents(agencyId, trip, actorUserId = null) {
  if (!trip?.id) return;
  const plannedDate = trip.planned_date ? String(trip.planned_date).slice(0, 10) : null;
  const stopCount = (trip.stops || []).length;
  const title = String(trip.title || `Outreach trip: ${stopCount} stop${stopCount === 1 ? '' : 's'}`).slice(0, 200);
  const description = [
    `${stopCount} school stop${stopCount === 1 ? '' : 's'}`,
    ...(trip.stops || []).slice(0, 12).map((s, i) => `${i + 1}. ${s.school_name || s.name || 'School'}`),
    trip.notes ? `\n${trip.notes}` : '',
    `\nOpen in Outreach Hub`
  ].filter(Boolean).join('\n');

  // Cancel existing events if trip cancelled
  if (trip.status === 'cancelled') {
    try {
      await pool.execute(
        `UPDATE provider_schedule_events
         SET status = 'CANCELLED', updated_by_user_id = ?
         WHERE outreach_trip_id = ? AND agency_id = ? AND status = 'ACTIVE'`,
        [actorUserId || null, trip.id, agencyId]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') console.warn('[outreachHub] cancel calendar events', e?.message);
    }
    return;
  }

  if (!plannedDate) return;

  const participants = (trip.participants || []).filter((p) => Number(p.user_id || p.userId || 0) > 0);
  for (const p of participants) {
    const providerId = Number(p.user_id || p.userId);
    const startTime = p.start_time || p.startTime;
    const endTime = p.end_time || p.endTime;
    const allDay = !startTime;
    let startAt = null;
    let endAt = null;
    let startDate = plannedDate;
    let endDate = plannedDate;
    if (startTime) {
      startAt = mysqlDateTime(startTime);
      endAt = mysqlDateTime(endTime) || startAt;
      startDate = null;
      endDate = null;
    }
    try {
      const [existing] = await pool.execute(
        `SELECT id FROM provider_schedule_events
         WHERE outreach_trip_id = ? AND provider_id = ? AND agency_id = ? AND status = 'ACTIVE'
         LIMIT 1`,
        [trip.id, providerId, agencyId]
      );
      if (existing?.[0]?.id) {
        await pool.execute(
          `UPDATE provider_schedule_events
           SET title = ?, description = ?, all_day = ?, start_at = ?, end_at = ?,
               start_date = ?, end_date = ?, updated_by_user_id = ?, kind = 'OUTREACH_TRIP'
           WHERE id = ?`,
          [
            title,
            description.slice(0, 4000),
            allDay ? 1 : 0,
            startAt,
            endAt,
            startDate,
            endDate,
            actorUserId || null,
            existing[0].id
          ]
        );
      } else {
        await pool.execute(
          `INSERT INTO provider_schedule_events (
             agency_id, provider_id, kind, title, description, is_private, all_day,
             start_at, end_at, start_date, end_date, status,
             created_by_user_id, updated_by_user_id, outreach_trip_id
           ) VALUES (?, ?, 'OUTREACH_TRIP', ?, ?, 0, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
          [
            agencyId,
            providerId,
            title,
            description.slice(0, 4000),
            allDay ? 1 : 0,
            startAt,
            endAt,
            startDate,
            endDate,
            actorUserId || null,
            actorUserId || null,
            trip.id
          ]
        );
      }
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('[outreachHub] outreach_trip_id column missing on provider_schedule_events — run migration 1239');
      } else {
        console.warn('[outreachHub] calendar sync skipped', e?.message);
      }
    }
  }
}

export async function completeOutreachTrip(agencyId, tripId, payload, userId) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.status === 'completed') return trip;
  if (Array.isArray(payload?.participants)) {
    await pool.execute(`DELETE FROM outreach_trip_participants WHERE trip_id = ?`, [tripId]);
    for (const p of payload.participants) {
      const name = String(p.display_name || p.displayName || p.name || '').trim();
      if (!name) continue;
      await pool.execute(
        `INSERT INTO outreach_trip_participants (trip_id, user_id, display_name, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)`,
        [
          tripId,
          p.user_id || p.userId || null,
          name.slice(0, 255),
          mysqlDateTime(p.start_time || p.startTime),
          mysqlDateTime(p.end_time || p.endTime)
        ]
      );
    }
  }
  await pool.execute(
    `UPDATE outreach_trips SET status = 'completed', completed_at = NOW(), notes = COALESCE(?, notes) WHERE id = ?`,
    [payload?.notes ? String(payload.notes) : null, tripId]
  );
  const completed = await getOutreachTrip(agencyId, tripId);
  await syncOutreachTripCalendarEvents(agencyId, completed, userId);
  return completed;
}

export async function updateOutreachTripStopAttendance(agencyId, tripId, stopId, payload, userId) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  const stop = (trip.stops || []).find((s) => Number(s.id) === Number(stopId));
  if (!stop) throw new Error('Stop not found');
  const status = String(payload?.attendance_status || payload?.attendanceStatus || '').trim().toLowerCase();
  if (!ATTENDANCE_STATUSES.has(status)) {
    throw new Error('Attendance must be pending, attended, skipped, or time_short');
  }
  const notesRaw = payload?.attendance_notes ?? payload?.attendanceNotes;
  const notes = notesRaw ? String(notesRaw) : null;
  const prev = String(stop.attendance_status || 'pending');
  await pool.execute(
    `UPDATE outreach_trip_stops
     SET attendance_status = ?,
         attendance_notes = ?,
         attended_at = IF(? = 'attended', COALESCE(attended_at, NOW()), attended_at)
     WHERE id = ? AND trip_id = ?`,
    [status, notes, status, stopId, tripId]
  );
  if (status === 'attended' && prev !== 'attended') {
    const names = (trip.participants || [])
      .map((p) => p.display_name || p.displayName || p.name)
      .filter(Boolean)
      .join(', ');
    await logOutreachActivity(agencyId, stop.outreach_school_id, {
      contact_type: 'visit',
      summary: `Campus visit${names ? ` with ${names}` : ''} (trip: ${trip.title})`,
      notes: notes || trip.notes || `Trip stop ${stop.stop_order}`,
      trip_id: trip.id,
      trip_stop_id: stop.id
    }, userId);
  }
  return getOutreachTrip(agencyId, tripId);
}
