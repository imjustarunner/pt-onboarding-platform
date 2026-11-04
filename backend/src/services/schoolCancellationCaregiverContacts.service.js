import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';

const normalizedEmail=value=>String(value || '').trim().toLowerCase();
const validEmail=value=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
function restricted(link) {
  const permissions=ClientGuardian.parsePermissions(link.permissions_json) || {};
  return permissions.canReceiveNotifications === false || permissions.revoked === true || permissions.relationshipRevoked === true
    || permissions.noContact === true || permissions.no_contact === true || permissions.contactRestricted === true
    || !!link.revoked_at || ['revoked','removed','no_contact'].includes(String(link.relationship_status || '').toLowerCase());
}
function minor(client,now) {
  if (client.date_of_birth instanceof Date && !Number.isFinite(+client.date_of_birth)) return false;
  const birth=client.date_of_birth instanceof Date ? client.date_of_birth.toISOString().slice(0,10) : String(client.date_of_birth || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false;
  const today=now.toISOString().slice(0,10), years=Number(today.slice(0,4))-Number(birth.slice(0,4))-(today.slice(5)<birth.slice(5)?1:0);
  return years >= 0 && years < 18;
}

/** Submitted, client-bound school enrollment authorizes logistics contact, never portal access. */
export function createSchoolCancellationCaregiverContacts(overrides={}) {
  const d={database:pool,submission:id=>IntakeSubmission.findById(id),now:()=>new Date(),...overrides};
  return async function contacts({client,agencyId,links=[]}) {
    if (!Number(client.is_school_client) || !minor(client,d.now())) return [];
    const [bindings]=await d.database.execute(`SELECT s.id,s.client_id,s.guardian_user_id,s.status,s.submitted_at,s.consent_given_at,c.id AS bound_client_id,c.agency_id AS owning_agency_id
      FROM clients c JOIN intake_submissions s ON s.client_id=c.id OR EXISTS (SELECT 1 FROM intake_submission_clients sc WHERE sc.intake_submission_id=s.id AND sc.client_id=c.id)
      JOIN intake_links il ON il.id=s.intake_link_id
      JOIN agencies school ON school.id=il.organization_id AND school.organization_type='school'
      JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.agency_id=? AND oa.is_active=1
      WHERE c.id=? AND c.agency_id=? AND il.scope_type='school' AND s.status='submitted' AND s.submitted_at IS NOT NULL AND s.consent_given_at IS NOT NULL
        AND s.co_guardian_invite_id IS NULL
      ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1`,[agencyId,client.id,agencyId]);
    for (const binding of bindings) {
      if (Number(binding.bound_client_id)!==Number(client.id) || Number(binding.owning_agency_id)!==Number(agencyId)) continue;
      const submission=await d.submission(binding.id);
      if (!submission || Number(submission.id)!==Number(binding.id) || submission.status !== 'submitted' || !submission.submitted_at || !submission.consent_given_at || submission.co_guardian_invite_id) continue;
      const email=normalizedEmail(submission.signer_email);
      if (!validEmail(email)) continue;
      const related=links.filter(link=>(submission.guardian_user_id && Number(link.guardian_user_id)===Number(submission.guardian_user_id)) || normalizedEmail(link.email)===email);
      if (related.some(restricted)) continue;
      const linked=related[0];
      const recipientEmail=normalizedEmail(linked?.email || email);
      if (!validEmail(recipientEmail)) continue;
      return [{key:`enrollment:${binding.id}`,role:'guardian',userId:linked ? Number(linked.guardian_user_id) : null,
        name:[linked?.first_name,linked?.last_name].filter(Boolean).join(' ') || submission.signer_name || 'Enrollment caregiver',
        email:recipientEmail,phone:'',operationalOnly:true,intakeSubmissionId:Number(binding.id),source:'submitted_school_enrollment'}];
    }
    return [];
  };
}

export const schoolCancellationCaregiverContacts=createSchoolCancellationCaregiverContacts();
