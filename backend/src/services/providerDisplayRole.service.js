import pool from '../config/database.js';
export const DISPLAY_ROLE_OPTIONS = ['Counselor','Provider','Therapist','Social Worker'];
export function resolveProviderDisplayRole(user = {}) {
  const current = String(user.display_label || user.agency_position || user.title || '').trim();
  const credential = String(user.credential || '').trim();
  const unlicensedMasters = /unlicensed\s*master/i.test(`${credential} ${current} ${user.title || ''}`);
  const facilitator = String(user.role).toLowerCase() === 'facilitator' || /^facilitator$/i.test(current);
  const fullyLicensed = /\b(LCSW|LMFT|LAC|LPSY|LP)\b|\bLPC\b(?!-A|[- ]ASSOCIATE)/i.test(credential);
  const prelicensed = !fullyLicensed && (user.supervision_is_prelicensed === 1 || user.supervision_is_prelicensed === true || /\b(LPCC|SWC|LSW|MFTC|LMFTC|LPC-A)\b|pre.?licensed|candidate/i.test(credential));
  return { currentLabel: current, label: unlicensedMasters ? 'Unlicensed Masters' : facilitator ? 'Facilitator' : current,
    fixed: unlicensedMasters || facilitator, options: DISPLAY_ROLE_OPTIONS,
    candidate: !unlicensedMasters && !facilitator && prelicensed };
}
export async function getProviderDisplayRole(userId, agencyId) {
  const [[row]] = await pool.execute(`SELECT u.title,u.credential,u.role,ua.agency_position,ua.supervision_is_prelicensed,
    JSON_UNQUOTE(JSON_EXTRACT(p.public_details_json,?)) AS display_label
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id=?`, [`$.agencyDisplayLabels."${Number(agencyId)}"`,agencyId,userId]);
  return resolveProviderDisplayRole(row);
}
