import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import {
  COLORADO_OUTREACH_SCHOOLS
} from '../data/coloradoOutreachSchools.js';
import {
  WINDCHIME_ORIGIN,
  scoreNameMatch,
  canAutoPartnerDistrict,
  haversineMiles,
  schoolMapPoint
} from '../utils/outreachHubPure.js';

export { WINDCHIME_ORIGIN, scoreNameMatch, canAutoPartnerDistrict, haversineMiles, schoolMapPoint };

const STAGES = new Set([
  'not_started',
  'contacted',
  'follow_up_needed',
  'meeting_scheduled',
  'partnered',
  'on_hold'
]);

const CONTACT_TYPES = new Set(['email', 'letter', 'phone', 'visit']);

export function isValidOutreachStage(v) {
  return STAGES.has(String(v || '').trim().toLowerCase());
}

export function isValidContactType(v) {
  return CONTACT_TYPES.has(String(v || '').trim().toLowerCase());
}

function pickLinkedOrg(entry, orgs) {
  if (!canAutoPartnerDistrict(entry.district)) return null;
  let best = null;
  let bestScore = 0;
  for (const org of orgs) {
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

export async function ensureOutreachDirectory(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return { inserted: 0, updated: 0 };
  const expected = COLORADO_OUTREACH_SCHOOLS.length;
  try {
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS n FROM outreach_schools WHERE agency_id = ?',
      [id]
    );
    const existing = Number(countRows?.[0]?.n || 0);
    if (existing >= expected) {
      try {
        await pool.execute(
          `UPDATE outreach_schools
           SET outreach_stage = 'not_started', linked_organization_id = NULL
           WHERE agency_id = ?
             AND district_name LIKE '%Aurora%'
             AND outreach_stage = 'partnered'`,
          [id]
        );
      } catch {
        /* ignore */
      }
      return { inserted: 0, updated: 0, skipped: true };
    }
  } catch {
    /* table may not exist yet */
  }
  const affiliated = await loadAffiliatedSchools(id);
  let inserted = 0;
  let updated = 0;
  for (const entry of COLORADO_OUTREACH_SCHOOLS) {
    const linked = pickLinkedOrg(entry, affiliated);
    const stage = linked ? 'partnered' : 'not_started';
    const address = `${entry.name}, ${entry.city}, CO`;
    const [result] = await pool.execute(
      `INSERT INTO outreach_schools (
         agency_id, directory_key, linked_organization_id, name, district_name,
         city, region, school_level, address, outreach_stage
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         linked_organization_id = IF(VALUES(linked_organization_id) IS NULL, linked_organization_id, VALUES(linked_organization_id)),
         name = VALUES(name),
         district_name = VALUES(district_name),
         city = VALUES(city),
         region = VALUES(region),
         school_level = VALUES(school_level),
         address = COALESCE(NULLIF(address, ''), VALUES(address)),
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
        stage
      ]
    );
    if (result?.insertId) inserted += 1;
    else if (result?.affectedRows > 0) updated += 1;
  }
  try {
    await pool.execute(
      `UPDATE outreach_schools
       SET outreach_stage = 'not_started', linked_organization_id = NULL
       WHERE agency_id = ?
         AND district_name LIKE '%Aurora%'
         AND outreach_stage = 'partnered'`,
      [id]
    );
  } catch {
    /* ignore if table missing on first boot */
  }
  return { inserted, updated };
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
    email_count: Number(counts.email || row.email_count || 0),
    letter_count: Number(counts.letter || row.letter_count || 0),
    phone_count: Number(counts.phone || row.phone_count || 0),
    visit_count: Number(counts.visit || row.visit_count || 0)
  };
}

export async function listOutreachSchools(agencyId, filters = {}) {
  await ensureOutreachDirectory(agencyId);
  void backfillOutreachSchoolGeocodes(agencyId, { limit: 20 }).catch(() => {});
  const where = ['s.agency_id = ?'];
  const params = [agencyId];
  const district = String(filters.district || '').trim();
  const stage = String(filters.stage || '').trim().toLowerCase();
  const level = String(filters.level || '').trim().toLowerCase();
  const q = String(filters.q || '').trim();
  if (district) {
    where.push('s.district_name = ?');
    params.push(district);
  }
  if (stage && isValidOutreachStage(stage)) {
    where.push('s.outreach_stage = ?');
    params.push(stage);
  }
  if (level) {
    where.push('s.school_level = ?');
    params.push(level);
  }
  if (q) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.district_name LIKE ? OR COALESCE(s.address, \'\') LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
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
}

async function queryOutreachSchoolRows(agencyId, filters = {}) {
  const where = ['s.agency_id = ?'];
  const params = [agencyId];
  const district = String(filters.district || '').trim();
  const stage = String(filters.stage || '').trim().toLowerCase();
  const level = String(filters.level || '').trim().toLowerCase();
  const q = String(filters.q || '').trim();
  if (district) {
    where.push('s.district_name = ?');
    params.push(district);
  }
  if (stage && isValidOutreachStage(stage)) {
    where.push('s.outreach_stage = ?');
    params.push(stage);
  }
  if (level) {
    where.push('s.school_level = ?');
    params.push(level);
  }
  if (q) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.district_name LIKE ? OR COALESCE(s.address, \'\') LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT s.* FROM outreach_schools s WHERE ${where.join(' AND ')} ORDER BY s.district_name ASC, s.name ASC`,
    params
  );
  return (rows || []).map((r) => mapSchoolRow(r));
}

function isPlaceholderOutreachAddress(row) {
  const name = String(row?.name || '').trim();
  const city = String(row?.city || '').trim();
  const address = String(row?.address || '').trim();
  if (!address) return true;
  const placeholder = `${name}, ${city}, CO`;
  if (address === placeholder) return true;
  return !/\d/.test(address);
}

/** Geocode schools missing coordinates or still on placeholder addresses (batched). */
export async function backfillOutreachSchoolGeocodes(agencyId, { limit = 50 } = {}) {
  const id = Number(agencyId || 0);
  if (!id) return { geocoded: 0, remaining: 0 };
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await pool.execute(
    `SELECT id, name, city, district_name, address, lat, lng
     FROM outreach_schools
     WHERE agency_id = ?
       AND (
         lat IS NULL OR lng IS NULL
         OR address IS NULL OR address = ''
         OR address LIKE '%, CO'
       )
     ORDER BY (lat IS NULL OR lng IS NULL) DESC, id ASC
     LIMIT ${cap}`,
    [id]
  );
  if (!rows?.length) {
    const [rem] = await pool.execute(
      `SELECT COUNT(*) AS n FROM outreach_schools
       WHERE agency_id = ? AND (lat IS NULL OR lng IS NULL)`,
      [id]
    );
    return { geocoded: 0, remaining: Number(rem?.[0]?.n || 0) };
  }

  let geocoded = 0;
  let geocodeBlocked = false;
  try {
    const { geocodeAddressWithGoogle } = await import('./googleGeocode.service.js');
    for (const row of rows) {
      if (geocodeBlocked) break;
      const name = String(row.name || '').trim();
      const city = String(row.city || '').trim();
      if (!name || !city) continue;
      const query = isPlaceholderOutreachAddress(row)
        ? `${name}, ${city}, Colorado`
        : String(row.address || `${name}, ${city}, Colorado`).trim();
      try {
        const geo = await geocodeAddressWithGoogle({
          addressText: query,
          state: 'CO',
          countryCode: 'US'
        });
        const formatted = geo?.formattedAddress ? String(geo.formattedAddress).slice(0, 255) : null;
        await pool.execute(
          `UPDATE outreach_schools
           SET lat = ?, lng = ?, address = COALESCE(?, address)
           WHERE id = ? AND agency_id = ?`,
          [geo.latitude, geo.longitude, formatted, row.id, id]
        );
        geocoded += 1;
      } catch (e) {
        const msg = String(e?.message || '');
        if (e?.code === 'MAPS_KEY_MISSING' || msg.includes('REQUEST_DENIED')) {
          geocodeBlocked = true;
          console.warn('[outreachHub] Google Geocoding unavailable — trip distances use city centers until Geocoding API is enabled');
        } else {
          console.warn('[outreachHub] geocode skipped', row.id, e?.message);
        }
      }
    }
  } catch (e) {
    if (e?.code !== 'MAPS_KEY_MISSING') {
      console.warn('[outreachHub] geocode batch failed', e?.message);
    }
  }

  const [rem] = await pool.execute(
    `SELECT COUNT(*) AS n FROM outreach_schools
     WHERE agency_id = ? AND (lat IS NULL OR lng IS NULL)`,
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
  const [acts] = await pool.execute(
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
  let notes = [];
  let contacts = [];
  try {
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
    notes = noteRows || [];
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
  return { ...school, activities: acts || [], notes, contacts };
}

export async function updateOutreachSchool(agencyId, schoolId, patch = {}) {
  const fields = [];
  const params = [];
  if (patch.outreach_stage != null) {
    const stage = String(patch.outreach_stage).trim().toLowerCase();
    if (!isValidOutreachStage(stage)) throw new Error('Invalid outreach stage');
    fields.push('outreach_stage = ?');
    params.push(stage);
  }
  if (patch.next_follow_up_at !== undefined) {
    fields.push('next_follow_up_at = ?');
    params.push(patch.next_follow_up_at || null);
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?');
    params.push(patch.notes == null ? null : String(patch.notes));
  }
  if (patch.address !== undefined) {
    fields.push('address = ?');
    params.push(patch.address ? String(patch.address).slice(0, 255) : null);
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
  const [result] = await pool.execute(
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
  await pool.execute(
    `UPDATE outreach_schools
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, '1970-01-01'), ?)
     WHERE id = ?`,
    [mysqlAt, schoolId]
  );
  const current = await getOutreachSchool(agencyId, schoolId);
  if (current && current.outreach_stage === 'not_started') {
    await pool.execute(
      `UPDATE outreach_schools SET outreach_stage = 'contacted' WHERE id = ? AND outreach_stage = 'not_started'`,
      [schoolId]
    );
  }
  return getOutreachSchool(agencyId, schoolId).then((school) => ({
    activityId: result.insertId,
    school
  }));
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
    by_stage: byStage,
    by_district: (districtRows || []).map((r) => ({ district: r.district_name, count: Number(r.n || 0) })),
    by_contact_type: byType
  };
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

export async function addOutreachSchoolNote(agencyId, schoolId, body, userId) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Note text is required');
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) throw new Error('School not found');
  await pool.execute(
    `INSERT INTO outreach_school_notes (outreach_school_id, agency_id, body, created_by_user_id)
     VALUES (?, ?, ?, ?)`,
    [schoolId, agencyId, text.slice(0, 8000), userId || null]
  );
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

export async function rankSchoolsFromOrigin(agencyId, { originSchoolId = null, excludeIds = [] } = {}) {
  const schools = await queryOutreachSchoolRows(agencyId, {});
  const origin = originSchoolId
    ? schoolMapPoint(schools.find((s) => Number(s.id) === Number(originSchoolId)))
    : { lat: WINDCHIME_ORIGIN.lat, lng: WINDCHIME_ORIGIN.lng, approx: false };
  const skip = new Set((excludeIds || []).map((id) => Number(id)));
  if (originSchoolId) skip.add(Number(originSchoolId));
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

export async function previewTripStops(agencyId, { originSchoolId = null, excludeIds = [], useDriving = false } = {}) {
  const geo = await backfillOutreachSchoolGeocodes(agencyId, { limit: 25 });
  const ranked = await rankSchoolsFromOrigin(agencyId, { originSchoolId, excludeIds });
  if (!useDriving) {
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

function mapTripRow(row, stops = [], participants = []) {
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
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    stops,
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
    `SELECT * FROM outreach_trips WHERE agency_id = ? AND id = ? LIMIT 1`,
    [agencyId, tripId]
  );
  const row = rows?.[0];
  if (!row) return null;
  const [stops] = await pool.execute(
    `SELECT ts.*, s.name AS school_name, s.city, s.district_name, s.address, s.school_level
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
    await pool.execute(
      `INSERT INTO outreach_trip_stops (trip_id, outreach_school_id, stop_order, miles_from_prev)
       VALUES (?, ?, ?, ?)`,
      [tripId, sid, order, miles]
    );
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
  return getOutreachTrip(agencyId, tripId);
}

export async function completeOutreachTrip(agencyId, tripId, payload, userId) {
  const trip = await getOutreachTrip(agencyId, tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.status === 'completed') return trip;
  const participants = Array.isArray(payload?.participants) ? payload.participants : trip.participants;
  const names = participants.map((p) => p.display_name || p.displayName || p.name).filter(Boolean).join(', ');
  for (const stop of trip.stops || []) {
    await logOutreachActivity(agencyId, stop.outreach_school_id, {
      contact_type: 'visit',
      activity_at: payload?.completed_at || new Date().toISOString(),
      summary: `Campus visit${names ? ` with ${names}` : ''}`,
      notes: payload?.notes || trip.notes || `Trip stop ${stop.stop_order}`
    }, userId);
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
  }
  await pool.execute(
    `UPDATE outreach_trips SET status = 'completed', completed_at = NOW(), notes = COALESCE(?, notes) WHERE id = ?`,
    [payload?.notes ? String(payload.notes) : null, tripId]
  );
  return getOutreachTrip(agencyId, tripId);
}
