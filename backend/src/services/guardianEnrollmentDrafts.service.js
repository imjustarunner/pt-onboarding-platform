import pool from '../config/database.js';
import User from '../models/User.model.js';
import { decryptIntakeSubmissionRow } from './intakeResponsesEncryption.service.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const normalizedEmail = value => String(value || '').trim().toLowerCase();
export function enrollmentDraftTasks(data = {}, { channel = '' } = {}) {
  const submission = data.responses?.submission || {};
  const insurance = submission.insuranceInfo || {};
  const tasks = [];
  if (channel !== 'tutoring' && !insurance.isSelfPay && !insurance.useInsuranceOnFile) {
    if (!insurance.primary?.insurerName) tasks.push('Review insurance information');
    if (!insurance.authorizationSignature && !insurance.authorizationSignatureData) tasks.push('Sign the insurance authorization');
  }
  if (!submission.communicationPreferences?.signatureAccepted) tasks.push('Complete communication choices');
  tasks.push('Review the current agreements and submit your enrollment');
  return tasks;
}

export function ownedEnrollmentDraft(row, user, agencyId) {
  const data = typeof row.intake_data === 'string' ? JSON.parse(row.intake_data) : row.intake_data;
  const owner = data?.portalEnrollment;
  if (Number(row.guardian_user_id) !== Number(user.id) || Number(owner?.userId) !== Number(user.id)
    || Number(owner?.agencyId) !== Number(agencyId) || normalizedEmail(owner?.email) !== normalizedEmail(user.email)) return null;
  return { row, data };
}

export async function listGuardianEnrollmentDrafts({ userId, agencyId, submissionId = null }, deps = {}) {
  const db = deps.db || pool;
  const user = await (deps.users || User).findById(userId);
  if (!user || !['client_guardian', 'client'].includes(user.role)) throw fail('Sign in to your family account.');
  const [membership] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1', [userId, agencyId]);
  if (!membership.length) throw fail('This enrollment is not available for your account.');
  const [rows] = await db.execute(`SELECT s.*,il.public_key,il.master_channel,il.title AS form_title,a.name AS organization_name,a.feature_flags AS enrollment_feature_flags
    FROM intake_submissions s JOIN intake_links il ON il.id=s.intake_link_id AND il.is_active=1
    JOIN agencies a ON a.id=il.organization_id
    WHERE s.guardian_user_id=? AND s.co_guardian_invite_id IS NULL AND s.status IN ('started','consented')
      ${submissionId ? 'AND s.id=?' : ''} ORDER BY s.updated_at DESC LIMIT 25`, submissionId ? [userId, submissionId] : [userId]);
  return rows.filter(row => {
    let flags=row.enrollment_feature_flags || {};
    if(typeof flags==='string') {try {flags=JSON.parse(flags);}catch {flags={};}}
    // Preserve old misrouted drafts, but do not offer a clinical office form
    // as a continuation in an explicitly learning-only organization.
    return !(flags.clinicalChartEnabled===false && flags.standardsLearningEnabled===true) || row.master_channel==='tutoring';
  }).map(row => ownedEnrollmentDraft(decryptIntakeSubmissionRow(row), user, agencyId)).filter(Boolean);
}

export function enrollmentDraftSummary({ row, data }) {
  return { id: Number(row.id), organizationName: row.organization_name, tasks: enrollmentDraftTasks(data, {channel:row.master_channel}),
    children: (data.clients || []).map(child => ({ name: child.fullName || [child.firstName, child.lastName].filter(Boolean).join(' ') })),
    expired: !row.draft_expires_at || new Date(row.draft_expires_at).getTime() <= Date.now() };
}

export async function openGuardianEnrollmentDraft(input, deps = {}) {
  const matches = await listGuardianEnrollmentDrafts(input, deps);
  const entry = matches.find(item => Number(item.row.id) === Number(input.submissionId));
  if (!entry) throw fail('Saved enrollment not found for your account.', 404);
  if (enrollmentDraftSummary(entry).expired) throw fail('Your saved enrollment needs a renewed link. Contact your care team.', 410);
  if (!entry.row.session_token) throw fail('Contact your care team to restore this enrollment.', 409);
  return `/intake/${encodeURIComponent(entry.row.public_key)}?session=${encodeURIComponent(entry.row.session_token)}`;
}
