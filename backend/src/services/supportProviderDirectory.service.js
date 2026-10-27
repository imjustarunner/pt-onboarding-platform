import User from '../models/User.model.js';
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
const fail = (message, status) => Object.assign(new Error(message), { status });

// Scheduling needs provider names and photos, never personnel or credential data.
export async function listProvidersForSupport({ user, agencyId: requestedAgencyId }) {
  if (!user?.id) throw fail('Not authenticated', 401);
  if (!['support', 'provider_plus'].includes(String(user.role || '').toLowerCase())) {
    throw fail('Support scheduling access required', 403);
  }
  const agencyId = requestedAgencyId == null || requestedAgencyId === '' ? null : Number(requestedAgencyId);
  if (agencyId !== null && (!Number.isSafeInteger(agencyId) || agencyId < 1)) throw fail('Invalid agency', 400);
  const agencies = await User.getAgencies(user.id);
  const agencyIds = [...new Set((agencies || []).map(a => Number(a.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (agencyId !== null && !agencyIds.includes(agencyId)) throw fail('Agency access denied', 403);
  if (!agencyIds.length) return [];
  const effectiveAgencyIds = agencyId === null ? agencyIds : [agencyId];
  const placeholders = effectiveAgencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id AS supervisee_id,
         u.first_name AS supervisee_first_name,
         u.last_name AS supervisee_last_name,
         u.profile_photo_path AS supervisee_profile_photo_path,
         a.name AS agency_name
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND COALESCE(ua.is_active, 1) = 1 AND ua.agency_id IN (${placeholders})
       JOIN agencies a ON a.id = ua.agency_id
       WHERE (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
         AND (
           LOWER(COALESCE(u.role, '')) IN ('provider', 'supervisor', 'clinician')
           OR (u.has_provider_access = TRUE)
         )
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      effectiveAgencyIds
    );

    return (rows || []).map((r) => ({
      supervisee_id: Number(r.supervisee_id),
      supervisee_first_name: r.supervisee_first_name || '',
      supervisee_last_name: r.supervisee_last_name || '',
      agency_name: r.agency_name || '',
      supervisee_profile_photo_url: r.supervisee_profile_photo_path
        ? publicUploadsUrlFromStoredPath(r.supervisee_profile_photo_path)
        : null
    }));

}
