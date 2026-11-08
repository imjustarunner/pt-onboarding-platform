import { loadGuardianRoiConsent, restrictSchoolRoiState } from './schoolRoiGuardianConsent.service.js';
import pool from '../config/database.js';
import { getContactPlanContext } from './schoolContactPlan.service.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const on = value => [true, 1, '1'].includes(value);
const cleanEmail = value => String(value || '').trim().toLowerCase();
const emailValid = value => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const name = row => [row.first_name, row.last_name].filter(Boolean).join(' ');
const localDate = (now, timezone) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
export function approvedSchoolContactStaff(rows, { expiresOn, timezone, now = new Date() }) {
  let today;
  try { today = localDate(now, timezone); } catch { return []; }
  const expiry = expiresOn instanceof Date ? expiresOn.toISOString().slice(0,10) : String(expiresOn || '').slice(0,10);
  if (!/^\d{4}-\d\d-\d\d$/.test(expiry) || expiry < today) return [];
  // A current school-wide ROI or administrator badge is not an individual
  // permission to discuss this client. Limited/packet grants are insufficient.
  return rows.filter(r => on(r.is_active) && ['roi','roi_docs'].includes(r.access_level) && emailValid(cleanEmail(r.email)))
    .map(r => ({ userId: Number(r.school_staff_user_id), name: name(r) || cleanEmail(r.email), email: cleanEmail(r.email), accessLevel: r.access_level }));
}

export async function loadSchoolContactStaff({ agencyId, providerUserId, workflowId, now = new Date() }, { database = pool } = {}) {
  const [[w]] = await database.execute(`SELECT w.id,w.agency_id,w.client_id,w.school_id,w.provider_user_id,w.parent_reply_at,w.external_reply_recorded_at,c.initials,c.roi_expires_at,a.timezone,a.slug,s.name AS school_name
    FROM school_contact_workflows w JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id
    JOIN agencies a ON a.id=w.agency_id JOIN agencies s ON s.id=w.school_id AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
    JOIN organization_affiliations oa ON oa.organization_id=w.school_id AND oa.agency_id=w.agency_id AND oa.is_active=1
    WHERE w.id=? AND w.agency_id=? AND w.provider_user_id=? AND c.status<>'ARCHIVED'
      AND EXISTS(SELECT 1 FROM client_provider_assignments cp WHERE cp.client_id=w.client_id AND cp.organization_id=w.school_id AND cp.provider_user_id=w.provider_user_id AND cp.is_active=1) LIMIT 1`,
  [Number(workflowId),Number(agencyId),Number(providerUserId)]);
  if (!w) throw fail('This school client is no longer assigned to you.', 404);
  const [rows] = await database.execute(`SELECT r.school_staff_user_id,r.access_level,r.is_active,u.first_name,u.last_name,u.email
    FROM client_school_staff_roi_access r JOIN users u ON u.id=r.school_staff_user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=r.school_organization_id AND ua.is_active=1
    WHERE r.client_id=? AND r.school_organization_id=? AND r.is_active=1 AND r.access_level IN ('roi','roi_docs')
      AND u.role='school_staff' AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
    ORDER BY u.last_name,u.first_name,u.id`, [w.client_id,w.school_id]);
  const consent = await loadGuardianRoiConsent({ clientId: w.client_id, schoolOrganizationId: w.school_id, db: database });
  for (const row of rows) row.access_level = restrictSchoolRoiState(row.access_level, consent.find(item => item.schoolStaffUserId === Number(row.school_staff_user_id)));
  const [steps] = await database.execute("SELECT step_key,status FROM school_contact_workflow_steps WHERE workflow_id=? AND status='sent'", [w.id]);
  const sent = new Set(steps.map(s=>s.step_key));
  const completedPhases = {first:sent.has('initial_email'),second:sent.has('second_contact') || sent.has('followup_sms'),third:sent.has('final_contact') || sent.has('followup_email')};
  const count=Object.values(completedPhases).filter(Boolean).length;
  return {workflow:w,attemptCount:count,completedPhases,hasGuardianReply:!!(w.parent_reply_at || w.external_reply_recorded_at),contacts:approvedSchoolContactStaff(rows,{expiresOn:w.roi_expires_at,timezone:w.timezone,now})};
}

export function schoolContactComposePath(workflow, staff) {
  return `/${encodeURIComponent(workflow.slug)}/email-compose?${new URLSearchParams({agencyId:String(workflow.agency_id),schoolContactWorkflowId:String(workflow.id),schoolStaffUserId:String(staff.userId)})}`;
}
export async function schoolContactStaffEmailSeed({ agencyId, userId, workflowId, staffUserId }) {
  const ctx = await getContactPlanContext({agencyId,userId});
  const state = await loadSchoolContactStaff({agencyId:ctx.agencyId,providerUserId:ctx.userId,workflowId});
  const contact = state.contacts.find(s => s.userId === Number(staffUserId));
  if (!contact) throw fail('This staff member does not have a current individual ROI permission to discuss this client. Review the release with support.');
  const code = String(state.workflow.initials || '').trim();
  if (!code) throw fail('The client initials need to be recorded before preparing this email.',409);
  const providerName = name(ctx.provider);
  const attempts = state.hasGuardianReply ? `I'm following up on the intake for ${code}.` : state.attemptCount === 3 ? "I've reached out three times and haven't heard back from the parent or guardian." : `I've reached out ${state.attemptCount} ${state.attemptCount === 1 ? 'time' : 'times'} and haven't heard back from the parent or guardian.`;
  return { agencyId:ctx.agencyId, clientId:Number(state.workflow.client_id), to:contact.email, subject:`Intake coordination for ${code}`,
    text:`Hi ${contact.name},\n\n${attempts} Do you have time this week or next week to help me fill in some gaps for ${code}?\n\nThanks!\n${providerName}`,
    schoolContact:{workflowId:Number(workflowId),staffUserId:contact.userId} };
}

export async function validateSchoolContactStaffDraft({ agencyId,userId,draft }) {
  if (!draft?._schoolContact) return;
  const seed = await schoolContactStaffEmailSeed({agencyId,userId,...draft._schoolContact});
  if (cleanEmail(draft.to) !== seed.to || String(draft.cc || '').trim() || String(draft.bcc || '').trim()
    || draft.clientIds?.length !== 1 || Number(draft.clientIds[0]) !== seed.clientId) {
    throw fail('Keep this ROI email addressed to the approved staff member and linked to this client. Start a separate email for a different purpose.',409);
  }
}
