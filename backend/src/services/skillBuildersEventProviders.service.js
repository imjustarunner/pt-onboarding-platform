import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { getLeaveInfoForUserIds } from './leaveOfAbsence.service.js';

function missingSchemaError(e) {
  const msg = String(e?.message || '');
  return (
    msg.includes("doesn't exist") ||
    msg.includes('ER_NO_SUCH_TABLE') ||
    msg.includes('Unknown column') ||
    msg.includes('ER_BAD_FIELD_ERROR')
  );
}

/**
 * Supervisors for many supervisees at once (same agency as the skills group).
 * @returns {Map<number, Array<{ id: number, firstName: string, lastName: string, email: string | null, credential: string | null, profilePhotoUrl: string | null, isPrimary: boolean }>>}
 */
async function loadSupervisorsMapForAgency(agencyId, superviseeIds) {
  const aid = Number(agencyId);
  const ids = [...new Set((superviseeIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!Number.isFinite(aid) || aid <= 0 || !ids.length) return new Map();

  const ph = ids.map(() => '?').join(',');
  let rows = [];
  try {
    const [r] = await pool.execute(
      `SELECT sa.supervisee_id, sa.supervisor_id, sa.is_primary,
              u.first_name, u.last_name, u.email, u.profile_photo_path
       FROM supervisor_assignments sa
       JOIN users u ON u.id = sa.supervisor_id
       WHERE sa.agency_id = ? AND sa.supervisee_id IN (${ph})
       ORDER BY sa.supervisee_id ASC, sa.is_primary DESC, sa.created_at DESC, sa.id DESC`,
      [aid, ...ids]
    );
    rows = r || [];
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown column') && !msg.includes('ER_BAD_FIELD_ERROR')) throw e;
    const [r] = await pool.execute(
      `SELECT sa.supervisee_id, sa.supervisor_id,
              u.first_name, u.last_name, u.email, u.profile_photo_path
       FROM supervisor_assignments sa
       JOIN users u ON u.id = sa.supervisor_id
       WHERE sa.agency_id = ? AND sa.supervisee_id IN (${ph})
       ORDER BY sa.supervisee_id ASC, sa.created_at DESC, sa.id DESC`,
      [aid, ...ids]
    );
    rows = (r || []).map((x) => ({ ...x, is_primary: 0 }));
  }

  const supIds = [...new Set((rows || []).map((x) => Number(x.supervisor_id)).filter((n) => n > 0))];
  /** @type {Map<number, string>} */
  const credByUserId = new Map();
  if (supIds.length) {
    try {
      const ph2 = supIds.map(() => '?').join(',');
      const [crows] = await pool.execute(
        `SELECT uiv.user_id, uiv.value
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
         WHERE uiv.user_id IN (${ph2})
           AND uifd.field_key = 'provider_credential'
         ORDER BY uiv.updated_at DESC, uiv.id DESC`,
        supIds
      );
      for (const crow of crows || []) {
        const uid = Number(crow.user_id);
        if (!credByUserId.has(uid)) credByUserId.set(uid, crow.value != null ? String(crow.value) : '');
      }
    } catch (e) {
      if (!missingSchemaError(e)) throw e;
    }
  }

  /** @type {Map<number, Array<{ id: number, firstName: string, lastName: string, email: string | null, credential: string | null, profilePhotoUrl: string | null, isPrimary: boolean }>>} */
  const map = new Map();
  for (const row of rows || []) {
    const superviseeId = Number(row.supervisee_id);
    const supId = Number(row.supervisor_id);
    const credRaw = credByUserId.get(supId);
    const credential =
      credRaw != null && String(credRaw).trim() ? String(credRaw).trim() : null;
    const obj = {
      id: supId,
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      email: row.email != null && String(row.email).trim() ? String(row.email).trim() : null,
      credential,
      profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
      isPrimary: row.is_primary === 1 || row.is_primary === true
    };
    if (!map.has(superviseeId)) map.set(superviseeId, []);
    map.get(superviseeId).push(obj);
  }
  return map;
}

/**
 * Roster providers for a skills group with school-portal-style profile fields (photo, blurb, etc.).
 * No soft schedule / availability slots — display-only for Skill Builders event + guardian views.
 */
export async function fetchSkillBuildersGroupProvidersForPortal(skillsGroupId) {
  const sgId = Number(skillsGroupId);
  if (!Number.isFinite(sgId) || sgId <= 0) return [];

  const [sgMeta] = await pool.execute(`SELECT agency_id FROM skills_groups WHERE id = ? LIMIT 1`, [sgId]);
  const groupAgencyId = sgMeta?.[0]?.agency_id != null ? Number(sgMeta[0].agency_id) : null;

  let rows;
  try {
    const [r] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email,
              u.profile_photo_path,
              u.title, u.credential, u.service_focus, u.languages_spoken,
              u.provider_school_info_blurb
       FROM skills_group_providers sgp
       JOIN users u ON u.id = sgp.provider_user_id
       WHERE sgp.skills_group_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [sgId]
    );
    rows = r || [];
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown column') && !msg.includes('ER_BAD_FIELD_ERROR')) throw e;
    try {
      const [r] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email,
                u.profile_photo_path,
                u.title, u.credential, u.service_focus, u.languages_spoken
         FROM skills_group_providers sgp
         JOIN users u ON u.id = sgp.provider_user_id
         WHERE sgp.skills_group_id = ?
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [sgId]
      );
      rows = (r || []).map((x) => ({ ...x, provider_school_info_blurb: null }));
    } catch (e2) {
      const msg2 = String(e2?.message || '');
      if (!msg2.includes('Unknown column') && !msg2.includes('ER_BAD_FIELD_ERROR')) throw e2;
      const [r] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email,
                u.title, u.credential, u.service_focus, u.languages_spoken
         FROM skills_group_providers sgp
         JOIN users u ON u.id = sgp.provider_user_id
         WHERE sgp.skills_group_id = ?
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [sgId]
      );
      rows = (r || []).map((x) => ({ ...x, profile_photo_path: null, provider_school_info_blurb: null }));
    }
  }

  const ids = (rows || []).map((x) => Number(x.id)).filter((n) => n > 0);
  let leaveMap = new Map();
  try {
    leaveMap = await getLeaveInfoForUserIds(ids);
  } catch {
    leaveMap = new Map();
  }

  let supervisorMap = new Map();
  try {
    if (groupAgencyId) {
      supervisorMap = await loadSupervisorsMapForAgency(groupAgencyId, ids);
    }
  } catch (e) {
    if (!missingSchemaError(e)) throw e;
    supervisorMap = new Map();
  }

  return (rows || []).map((u) => {
    const id = Number(u.id);
    const leave = leaveMap.get(id) || {};
    return {
      id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email || null,
      profilePhotoUrl: publicUploadsUrlFromStoredPath(u.profile_photo_path || null),
      title: u.title != null && String(u.title).trim() ? String(u.title).trim() : null,
      credential: u.credential != null && String(u.credential).trim() ? String(u.credential).trim() : null,
      serviceFocus: u.service_focus != null && String(u.service_focus).trim() ? String(u.service_focus).trim() : null,
      languagesSpoken: u.languages_spoken != null && String(u.languages_spoken).trim() ? String(u.languages_spoken).trim() : null,
      schoolInfoBlurb:
        u.provider_school_info_blurb != null && String(u.provider_school_info_blurb).trim()
          ? String(u.provider_school_info_blurb).trim()
          : null,
      isOnLeave: !!leave.isOnLeave,
      leaveLabel: leave.leaveLabel || null,
      supervisors: supervisorMap.get(id) || []
    };
  });
}
