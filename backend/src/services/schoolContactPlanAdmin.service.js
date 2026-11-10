import pool from '../config/database.js';
import {DEFAULT_SCHOOL_CONTACT_TEMPLATE} from './schoolContactPlan.service.js';
import {isSchoolContactAgencyEnabled,isSchoolContactProviderEnabled} from './schoolContactRollout.js';
const fail = (message,status=403) => Object.assign(new Error(message),{status});
async function adminContext({agencyId,userId}) {
  const [[agency]]=await pool.execute('SELECT id,name,slug,is_active,is_archived,feature_flags FROM agencies WHERE id=?',[Number(agencyId)]);
  if(!isSchoolContactAgencyEnabled(agency)) throw fail('Family Welcome is not enabled for this agency.');
  const [[actor]]=await pool.execute(`SELECT u.id FROM users u WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    AND (u.role='super_admin' OR (u.role='admin' AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1)))`,[Number(userId),Number(agencyId)]);
  if(!actor) throw fail('An agency administrator is required.');
  return agency;
}
export async function listSchoolContactPlanProviders(input) {
  const agency=await adminContext(input);
  const [rows]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,p.status,p.required_by_admin,p.decided_at,p.welcome_seen_at,p.updated_at,
    (SELECT COUNT(*) FROM school_contact_workflows w WHERE w.agency_id=ua.agency_id AND w.provider_user_id=u.id) AS workflow_count,
    (SELECT COUNT(*) FROM school_contact_workflows w WHERE w.agency_id=ua.agency_id AND w.provider_user_id=u.id AND w.initial_sent_at IS NOT NULL) AS initial_sent_count,
    (SELECT COUNT(*) FROM school_contact_workflows w WHERE w.agency_id=ua.agency_id AND w.provider_user_id=u.id AND w.status='needs_review') AS needs_review_count,
    (SELECT COUNT(*) FROM school_contact_workflows w WHERE w.agency_id=ua.agency_id AND w.provider_user_id=u.id AND w.status='intake_followup_required') AS intake_followup_required
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    LEFT JOIN school_provider_contact_plans p ON p.agency_id=ua.agency_id AND p.provider_user_id=u.id
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND EXISTS(SELECT 1 FROM provider_school_assignments a JOIN organization_affiliations oa ON oa.organization_id=a.school_organization_id AND oa.agency_id=ua.agency_id AND oa.is_active=1
        WHERE a.provider_user_id=u.id AND a.is_active=1) ORDER BY u.last_name,u.first_name`,[agency.id]);
  const flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags):agency.feature_flags || {};
  return rows.filter(r=>isSchoolContactProviderEnabled(agency,r.id)).map(r=>({...r,status:r.status || 'unconfigured',required:!!r.required_by_admin || flags.schoolContactPlanRequired===true || (flags.schoolContactPlanRequiredProviderIds || []).map(Number).includes(Number(r.id))}));
}
export async function requireSchoolContactPlan(input,providerUserId,required) {
  await adminContext(input);
  if(typeof required!=='boolean') throw fail('Choose whether this provider must use a contact plan.',400);
  const providers=await listSchoolContactPlanProviders(input);
  if(!providers.some(p=>Number(p.id)===Number(providerUserId))) throw fail('Assigned provider not found.',404);
  // Requirement is not an opt-in and never enrolls old clients or replaces text.
  await pool.execute(`INSERT INTO school_provider_contact_plans(agency_id,provider_user_id,status,template,required_by_admin,required_by_user_id)
    VALUES (?,?,'unconfigured',?,?,?) ON DUPLICATE KEY UPDATE required_by_admin=VALUES(required_by_admin),required_by_user_id=VALUES(required_by_user_id)`,
  [Number(input.agencyId),Number(providerUserId),DEFAULT_SCHOOL_CONTACT_TEMPLATE,required?1:0,Number(input.userId)]);
  return {required};
}
