import crypto from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const defaults = { db: pool, users: User, submissions: IntakeSubmission };

async function account(user, deps) {
  if (!['client_guardian', 'client'].includes(user?.role)) throw fail('Sign in to your family account to enroll.');
  const saved = await deps.users.findById(user.id);
  if (!saved || !['client_guardian', 'client'].includes(saved.role) || !saved.email) throw fail('Family account required.');
  return saved;
}

export async function enrollmentOptions(user, deps = defaults) {
  await account(user, deps);
  // Only published general forms, within the signed-in family's agencies.
  // Personal renewal/ROI/invitation links are never enrollment entry points.
  const [rows] = await deps.db.execute(`
    SELECT DISTINCT il.id, il.language_code, il.scope_type, il.organization_id,
      a.id AS agency_id, a.name AS agency_name, org.name AS organization_name
    FROM user_agencies ua JOIN agencies a ON a.id = ua.agency_id
    JOIN intake_links il ON (
      il.id IN (SELECT published_intake_link_id FROM agency_office_intake_masters WHERE agency_id = a.id)
      OR (il.scope_type = 'school' AND il.inherits_school_master = 1 AND (
        EXISTS (SELECT 1 FROM agency_schools s WHERE s.agency_id = a.id AND s.school_organization_id = il.organization_id AND s.is_active = 1)
        OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.agency_id = a.id AND oa.organization_id = il.organization_id AND oa.is_active = 1))))
    JOIN agencies org ON org.id = il.organization_id
    WHERE ua.user_id = ? AND il.is_active = 1 AND il.form_type = 'intake'
      AND COALESCE(il.is_school_master, 0) = 0 AND COALESCE(il.is_office_master, 0) = 0
    ORDER BY a.name, il.scope_type, org.name, il.language_code, il.id`, [user.id]);
  return { options: rows.map(row => ({
    id: Number(row.id), agencyId: Number(row.agency_id), agencyName: row.agency_name,
    organizationName: row.organization_name, channel: row.scope_type === 'school' ? 'school' : 'office',
    language: String(row.language_code || 'en').startsWith('es') ? 'es' : 'en'
  })) };
}

export async function startGuardianEnrollment({ user, linkId, subject, ipAddress, userAgent }, deps = defaults) {
  if (!['self', 'dependent'].includes(subject)) throw fail('Choose yourself or a child.', 400);
  const owner = await account(user, deps);
  const { options } = await enrollmentOptions(user, deps);
  const option = options.find(item => item.id === Number(linkId));
  if (!option || (subject === 'self' && option.channel === 'school')) throw fail('Choose an available enrollment for your account.');
  const [links] = await deps.db.execute('SELECT id, public_key FROM intake_links WHERE id = ? AND is_active = 1', [option.id]);
  const link = links[0];
  if (!link) throw fail('This enrollment is no longer available.', 404);
  const sessionToken = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const guardian = { firstName: owner.first_name || '', lastName: owner.last_name || '',
    email: String(owner.email).trim().toLowerCase(), phone: owner.phone_number || '',
    relationship: subject === 'self' ? 'Self' : 'Parent' };
  const intakeData = { intakeForSelf: subject === 'self', guardian, clients: [], progressStep: 1,
    responses: { guardian: {}, clients: [], submission: { service_subject: subject } } };
  const submission = await deps.submissions.create({
    intakeLinkId: link.id, guardianUserId: owner.id, status: 'started', sessionToken,
    intakeData, portalEnrollment: { userId: owner.id, email: guardian.email, agencyId: option.agencyId },
    ipAddress, userAgent, retentionExpiresAt: expires
  });
  await deps.submissions.updateById(submission.id, { draft_expires_at: expires });
  return { path: `/intake/${encodeURIComponent(link.public_key)}?session=${sessionToken}`, submissionId: submission.id };
}
