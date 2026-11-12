import pool from '../config/database.js';
import { readProviderServices } from './providerServiceOfferings.service.js';
import { normalizeLearningProfile, hourlyRate, validateLearningCatalog } from './learningCatalog.js';
import { STAFF_ROLES } from '../utils/staffEligibility.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const parse = (value, fallback) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const fields = ['subjectAreas', 'gradeLevels', 'bio', 'acceptingNewStudents'];
export function descriptiveTutoringProfile(body = {}) {
  if (Object.keys(body).some(key => ![...fields, 'agencyId'].includes(key))) throw fail(400, 'Only subjects, grades, public bio and accepting-new-students can be edited here. Rates and approvals are managed by your agency.');
  for (const key of ['subjectAreas', 'gradeLevels']) if (!Array.isArray(body[key]) || body[key].length > 30 || body[key].some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw fail(400, `Choose valid ${key === 'subjectAreas' ? 'subjects' : 'grades'}.`);
  if (typeof body.bio !== 'string' || body.bio.length > 4000 || typeof body.acceptingNewStudents !== 'boolean') throw fail(400, 'Enter a public bio of up to 4,000 characters and choose whether you are accepting students.');
  return { subjectAreas: [...new Set(body.subjectAreas.map(value => value.trim()))], gradeLevels: [...new Set(body.gradeLevels.map(value => value.trim()))], bio: body.bio.trim(), acceptingNewStudents: body.acceptingNewStudents };
}

export function createTutoringWorkspaceService({ db = pool, services = readProviderServices } = {}) {
  async function context(user, agencyId) {
    if (!user?.id || !STAFF_ROLES.includes(String(user.role))) throw fail(403, 'Sign in with your own staff account.');
    const id = Number(agencyId);
    if (!Number.isSafeInteger(id) || id <= 0) throw fail(400, 'Choose an agency.');
    const [[agency]] = await db.execute(`SELECT a.id,a.name,a.slug,a.organization_type,a.feature_flags FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [user.id, id]);
    if (!agency) throw fail(403, 'This agency is not available to your account.');
    const offered = await services(user.id, id, db);
    const selected = offered.services.filter(service => service.offered).map(service => service.serviceType);
    const canTutor = offered.careEligibility.canProvideCare && selected.includes('tutoring');
    const canClinical = offered.careEligibility.canProvideCare && selected.includes('counseling');
    const manager = ['admin', 'super_admin'].includes(user.role);
    const flags=parse(agency.feature_flags,{});
    const learningTenant=flags.qaSandbox?.program==='tutoring'||agency.organization_type==='learning';
    const [[childcareGrant]]=await db.execute('SELECT enabled,manage_schedule FROM childcare_service_grants WHERE agency_id=? AND user_id=?',[id,user.id]);
    const canChildcare=Number(childcareGrant?.enabled)===1||Number(childcareGrant?.manage_schedule)===1;
    return { agencyId: id, agency:{id:agency.id,name:agency.name,slug:agency.slug}, canTutor, canClinical, canChildcare, canManage: manager, learningOnly: !manager && !canClinical && (canTutor||canChildcare||learningTenant) };
  }
  async function profile(user, agencyId) {
    const access = await context(user, agencyId);
    if (!access.canTutor) throw fail(403, 'Tutoring must be enabled for you in this agency before editing a tutoring profile.');
    const [[row]] = await db.execute(`SELECT subject_areas_json,grade_levels_json,bio,accepting_new_students,learning_settings_json FROM provider_tutoring_profiles WHERE user_id=? AND agency_id=?`, [user.id, access.agencyId]);
    const learning = normalizeLearningProfile(parse(row?.learning_settings_json, {}));
    const [[catalogRow]] = await db.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=?', [access.agencyId]);
    const catalog = validateLearningCatalog(parse(catalogRow?.catalog_json, { rates: [], packages: [] }));
    return { ...access, profile: { subjectAreas: parse(row?.subject_areas_json, []), gradeLevels: parse(row?.grade_levels_json, []), bio: row?.bio || '', acceptingNewStudents: row ? !!row.accepting_new_students : true, learningLevel: learning.tierId || null, hourlyRates: Object.fromEntries(['virtual', 'in-person'].map(format => [format, hourlyRate(catalog, learning, 'tutoring', format)])) } };
  }
  async function save(user, agencyId, body) {
    const values = descriptiveTutoringProfile(body);
    const access = await context(user, agencyId);
    if (!access.canTutor) throw fail(403, 'Tutoring is not enabled for you in this agency.');
    // The update deliberately omits every pricing, employment and approval column.
    await db.execute(`INSERT INTO provider_tutoring_profiles (user_id,agency_id,subject_areas_json,grade_levels_json,bio,accepting_new_students) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE subject_areas_json=VALUES(subject_areas_json),grade_levels_json=VALUES(grade_levels_json),bio=VALUES(bio),accepting_new_students=VALUES(accepting_new_students),updated_at=CURRENT_TIMESTAMP`, [user.id, access.agencyId, JSON.stringify(values.subjectAreas), JSON.stringify(values.gradeLevels), values.bio, values.acceptingNewStudents ? 1 : 0]);
    await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['tutoring_profile_updated',user.id,access.agencyId,JSON.stringify({targetUserId:user.id,fields})]);
    return profile(user, access.agencyId);
  }
  async function students(user, agencyId) {
    const access = await context(user, agencyId);
    if (!access.canTutor) throw fail(403, 'Tutoring is not enabled for you in this agency.');
    const [rows] = await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.identifier_code FROM clients c WHERE UPPER(COALESCE(c.status,''))<>'ARCHIVED' AND (EXISTS(SELECT 1 FROM client_service_enrollments e WHERE e.client_id=c.id AND e.agency_id=? AND e.provider_user_id=? AND e.service_kind='tutoring' AND e.is_active=1) OR EXISTS(SELECT 1 FROM student_subjects s WHERE s.client_id=c.id AND s.agency_id=? AND s.primary_tutor_user_id=? AND s.status NOT IN ('completed','discharged','archived'))) ORDER BY c.full_name,c.id`, [access.agencyId, user.id, access.agencyId, user.id]);
    return { agencyId: access.agencyId, students: rows.map(row => ({ id: row.id, displayName: row.full_name || row.initials || row.identifier_code || `Student ${row.id}` })) };
  }
  return { context, profile, save, students };
}
export const tutoringWorkspace = createTutoringWorkspaceService();
