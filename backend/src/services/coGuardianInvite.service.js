import { requestingGuardianContext } from './coGuardianRequestOrigin.service.js';
import { validateQaIntakeGuardian, markQaIntakeGuardian } from './qaIntakeIdentity.service.js';
import crypto from 'crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import { matchesIntakeSession } from '../middleware/intakeBillingSession.middleware.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { sendEnrollmentPortalEmail } from './enrollmentPortalEmail.service.js';
import { deliverCoGuardianInvite } from './coGuardianDelivery.service.js';
import { buildPublicPortalBaseUrl, buildPublicPortalLoginUrl } from '../utils/publicPortalUrl.js';
import { SUPPORT_TICKET_SOURCE_KEYS, normalizeSupportTicketSourceKey } from '../constants/supportTicketSources.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';

const TOKEN_BYTES = 32;
const INVITE_DAYS = 21;

export const NO_VIEW_GUARDIAN_PERMISSIONS = Object.freeze({
  isolatedIntake: true,
  noView: true,
  noViewOtherGuardian: true,
  canViewDocs: false,
  canSignDocs: false,
  canViewLinks: false,
  canViewProgramMaterials: false,
  canViewProgress: false,
  canMessage: false
});

function noViewPermissionsForInvite(inviteId, existing = null) {
  const prior = existing && typeof existing === 'object' ? existing : null;
  if (prior) {
    return {
      ...prior,
      isolatedIntake: true,
      hideOtherGuardianAnswers: true,
      coGuardianInviteId: inviteId || prior.coGuardianInviteId || null
    };
  }
  return { ...NO_VIEW_GUARDIAN_PERMISSIONS, coGuardianInviteRestricted: true, coGuardianInviteId: inviteId || null };
}

export function completedCoGuardianPermissions(inviteId, existing) {
  const p = noViewPermissionsForInvite(inviteId, existing);
  // Only release the restriction this invitation created. Never override a
  // care-team restriction on an existing guardian relationship.
  if (!existing || (existing.coGuardianInviteRestricted === true && Number(existing.coGuardianInviteId) === Number(inviteId))) {
    return { ...p, noView: false, noViewOtherGuardian: false, hideOtherGuardianAnswers: true,
      coGuardianInviteRestricted: false, canViewDocs: true, canSignDocs: true, canMessage: true };
  }
  return p;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function normalizeOtherGuardian(raw = {}) {
  const firstName = String(raw.firstName || raw.invitedFirstName || '').trim()
    || splitName(raw.name || raw.fullName).firstName;
  const lastName = String(raw.lastName || raw.invitedLastName || '').trim()
    || splitName(raw.name || raw.fullName).lastName;
  const email = String(raw.email || raw.invitedEmail || '').trim().toLowerCase();
  const phone = String(raw.phone || raw.invitedPhone || '').trim();
  const relationship = String(raw.relationship || raw.relationshipTitle || '').trim();
  const legalAuthority = String(raw.legalAuthority || raw.legal_authority || '').trim().toLowerCase();
  const sendInvite = raw.sendInvite === true || raw.sendInvite === 'yes' || String(raw.sendInvite || '').toLowerCase() === 'true';
  return {
    firstName,
    lastName,
    email,
    phone,
    relationship,
    legalAuthority,
    sendInvite,
    hasLegalRights: legalAuthority === 'yes' || legalAuthority === 'shared' || raw.hasLegalRights === true
  };
}

export function invitePublicUrl({ agency, token, serviceType = 'counseling', publicKey = null }) {
  // Enrollment and join routes live at the host root, including dedicated agency hosts.
  const origin = new URL(buildPublicPortalBaseUrl(agency)).origin;
  const pk = String(publicKey || '').trim();
  if (pk) {
    return `${origin}/intake/${encodeURIComponent(pk)}?coGuardian=${encodeURIComponent(token)}`;
  }
  const slug = String(agency?.portal_url || agency?.slug || '').trim();
  const svc = String(serviceType || 'counseling').trim() || 'counseling';
  return `${origin}/join/${encodeURIComponent(slug)}/${encodeURIComponent(svc)}/co-guardian/${encodeURIComponent(token)}`;
}

export function toPublicInviteResult(result) {
  if (!result) return null;
  const {
    token,
    inviteUrl,
    existingAccount,
    matchedUserId,
    matched,
    userId,
    ...rest
  } = result;
  return rest;
}

export async function createCoGuardianInvite({
  agencyId,
  invitedByUserId = null,
  requestingSubmissionId = null,
  otherGuardian,
  clientIds = [],
  source = 'office',
  publicKey = null,
  sendEmail = true,
  enablePortalOnMatch = true,
  enrollmentChannel = null
}) {
  const agency = await Agency.findById(agencyId);
  if (!agency) throw new Error('Organization not found');
  const person = normalizeOtherGuardian(otherGuardian);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
    throw new Error('The other guardian needs an email address so we can send their link.');
  }
  await validateQaIntakeGuardian({ agencyId, email: person.email });
  const ids = [...new Set((Array.isArray(clientIds) ? clientIds : []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) throw new Error('At least one dependent is required.');

  const [scopedClients] = await pool.execute(
    `SELECT id FROM clients WHERE agency_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    [Number(agencyId), ...ids]
  );
  if (scopedClients.length !== ids.length) throw new Error('Dependent not found in this organization.');

  if (!publicKey && source === 'office') {
    const { findFullIntakePublicKey } = await import('./adaptiveIntake.service.js');
    const packet = await findFullIntakePublicKey(agencyId);
    if (!packet?.publicKey) throw new Error('Publish the full enrollment packet before inviting another guardian.');
    publicKey = packet.publicKey;
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const [result] = await pool.execute(
    `INSERT INTO co_guardian_invites
      (agency_id, invited_by_user_id, invited_email, invited_first_name, invited_last_name, invited_phone,
       relationship_title, legal_authority, token_hash, expires_at, status, source, public_key, requesting_submission_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      Number(agencyId),
      invitedByUserId ? Number(invitedByUserId) : null,
      person.email,
      person.firstName || null,
      person.lastName || null,
      person.phone || null,
      person.relationship || null,
      person.legalAuthority || (person.hasLegalRights ? 'yes' : null),
      tokenHash,
      expiresAt,
      String(source || 'office').slice(0, 40),
      publicKey ? String(publicKey).slice(0, 80) : null,
      requestingSubmissionId ? Number(requestingSubmissionId) : null
    ]
  );
  const inviteId = Number(result.insertId);
  for (const clientId of ids) {
    await pool.execute(
      `INSERT INTO co_guardian_invite_clients (invite_id, client_id) VALUES (?, ?)`,
      [inviteId, clientId]
    );
  }

  await silentlyLinkMatchingGuardian({
    email: person.email,
    firstName: person.firstName, lastName: person.lastName, agencyId,
    clientIds: ids,
    relationshipTitle: person.relationship || 'Guardian',
    inviteId,
    invitedByUserId,
    enablePortal: enablePortalOnMatch !== false
  });

  const inviteUrl = invitePublicUrl({ agency, token, publicKey, serviceType: enrollmentChannel || 'counseling' });
  let delivery = { sent: false, queued: false, deliveryStatus: 'not_requested' };
  // Requested enrollment invitations must not depend on the separate automatic
  // portal/password provisioning flag. Tenant transport controls still apply.
  if (sendEmail !== false && person.sendInvite !== false) {
    delivery = await deliverCoGuardianInvite({
      inviteId, agency, enrollmentChannel, school: source === 'school',
      to: person.email,
      firstName: person.firstName,
      inviteUrl,
      clientId: ids[0]
    });
  }
  return {
    inviteId,
    token,
    inviteUrl,
    emailed: delivery.sent,
    queued: !!delivery.queued,
    deliveryStatus: delivery.deliveryStatus,
    communicationId: delivery.communicationId || null,
    expiresAt: expiresAt.toISOString(),
    email: person.email
  };
}

async function silentlyLinkMatchingGuardian({
  email, firstName, lastName, agencyId,
  clientIds,
  relationshipTitle,
  inviteId,
  invitedByUserId = null,
  enablePortal = true
}) {
  try {
    let user = await User.findByEmail(email);
    if (!user) {
      try { user = await User.create({email,firstName:firstName||'Guardian',lastName:lastName||'',passwordHash:null,role:'client_guardian',status:'PENDING_SETUP'}); }
      catch(error){if(error.code!=='ER_DUP_ENTRY')throw error;user=await User.findByEmail(email);}
    }
    if (!user?.id) return;
    if (invitedByUserId && Number(user.id) === Number(invitedByUserId)) return;
    const role = String(user.role || '').toLowerCase();
    if (!['client_guardian','guardian','client'].includes(role)) return;
    await User.assignToAgency(user.id,Number(agencyId));
    await markQaIntakeGuardian({ agencyId, userId: user.id, email });
    const title = String(relationshipTitle || 'Guardian').trim() || 'Guardian';
    for (const clientId of clientIds) {
      const existing = await ClientGuardian.getLink({ clientId, guardianUserId: user.id });
      await ClientGuardian.upsertLink({
        clientId,
        guardianUserId: user.id,
        relationshipType: 'guardian',
        relationshipTitle: existing?.relationship_title || title,
        accessEnabled: existing ? Number(existing.access_enabled)===1 : true,
        permissionsJson: noViewPermissionsForInvite(inviteId, existing?.permissions_json)
      });
      if (enablePortal === false) continue;
      try {
        await pool.execute(
          `UPDATE clients SET guardian_portal_enabled = 1 WHERE id = ? AND (guardian_portal_enabled IS NULL OR guardian_portal_enabled = 0)`,
          [clientId]
        );
      } catch {
        /* optional */
      }
    }
  } catch (err) {
    console.warn('[coGuardianInvite] silent match link skipped', err?.message || err);
  }
}

export async function insertGuardianAccessTicket({ agencyId, subject, question, fallbackUserId = null }) {
  const sourceKey = normalizeSupportTicketSourceKey(SUPPORT_TICKET_SOURCE_KEYS.GUARDIAN_ACCESS_TOKEN);
  const qEnc = prepareEncryptedTicketText(question);
  try {
    await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
         subject, question, status, source_channel,
         question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open', 'public_web', ?, ?, ?, ?)`,
      [
        agencyId,
        sourceKey,
        agencyId,
        subject,
        qEnc.plain,
        qEnc.ciphertext,
        qEnc.iv,
        qEnc.authTag,
        qEnc.keyId
      ]
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('question_ciphertext') || msg.includes('source_channel')) {
      await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id, subject, question, status)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open')`,
        [agencyId, sourceKey, agencyId, subject, question]
      );
      return;
    }
    if (!msg.includes('created_by_source_key')) throw e;
    const fallbackCreator = Number(fallbackUserId || 0) > 0 ? Number(fallbackUserId) : null;
    await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
       VALUES (?, NULL, ?, ?, ?, ?, 'open')`,
      [agencyId, fallbackCreator, agencyId, `[${sourceKey}] ${subject}`, question]
    );
  }
}

export async function fileGuardianAccessHelpTicket({ email, user = null, orgSlug = null, req = null }) {
  const requested = String(email || user?.email || '').trim().toLowerCase();
  if (!requested || !requested.includes('@')) return false;
  let agency = null;
  if (orgSlug) {
    agency = (await Agency.findByPortalUrl(orgSlug)) || (await Agency.findBySlug(orgSlug));
  }
  const [inviteRows] = await pool.execute(
    `SELECT * FROM co_guardian_invites
      WHERE invited_email = ?
      ORDER BY id DESC
      LIMIT 5`,
    [requested]
  );
  const latestInvite = inviteRows?.[0] || null;
  if (!agency?.id && latestInvite?.agency_id) {
    agency = await Agency.findById(latestInvite.agency_id);
  }
  if (!agency?.id) return false;
  const expiredInvites = (inviteRows || []).filter((row) => {
    const status = String(row.status || '');
    const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
    return status === 'expired' || (status === 'pending' && expired);
  });
  if (latestInvite && String(latestInvite.status) === 'pending' && latestInvite.expires_at
      && new Date(latestInvite.expires_at).getTime() < Date.now()) {
    await pool.execute(
      `UPDATE co_guardian_invites SET status = 'expired' WHERE id = ? AND status = 'pending'`,
      [latestInvite.id]
    );
  }
  const subject = 'Parent/guardian needs a new access token or temporary password';
  const question = [
    'A parent or guardian could not use their access token (invite link expired, never arrived, or they waited too long).',
    'This is not the staff Forgot password flow.',
    'Please send a new access token manually, or issue a temporary password if they already have a guardian account.',
    '',
    user?.id ? `User ID: ${user.id}` : 'No guardian user matched yet (token-only).',
    `Email: ${requested}`,
    user ? `Name: ${[user.first_name, user.last_name].filter(Boolean).join(' ') || '(unknown)'}` : '',
    `Role: ${user?.role || 'unknown'}`,
    `Organization: ${agency.name || agency.slug || agency.id}`,
    expiredInvites.length
      ? `Related invite IDs: ${expiredInvites.map((row) => row.id).join(', ')}`
      : latestInvite ? `Latest invite ID: ${latestInvite.id} (${latestInvite.status})` : 'No invite rows found.',
    req ? `IP: ${req.ip || req.get?.('x-forwarded-for') || '(unknown)'}` : '',
    req ? `User-Agent: ${req.get?.('user-agent') || '(unknown)'}` : ''
  ].filter(Boolean).join('\n');
  await insertGuardianAccessTicket({
    agencyId: agency.id,
    subject,
    question,
    fallbackUserId: user?.id || null
  });
  return true;
}

export async function maybeCreateFromIntakeGuardian({
  agencyId,
  intakeData = {},
  clientIds = [],
  source = 'office',
  publicKey = null,
  submissionId = null,
  invitedByUserId = null,
  enrollmentChannel = null
} = {}) {
  const guardian = intakeData?.guardian && typeof intakeData.guardian === 'object'
    ? intakeData.guardian
    : {};
  const rights = String(guardian.other_guardian_has_legal_rights || '').trim().toLowerCase();
  if (rights !== 'yes' && rights !== 'shared') return null;
  const email = String(guardian.other_guardian_email || '').trim().toLowerCase();
  const phone = String(guardian.other_guardian_phone || '').trim();
  const isSchool = String(source || '').toLowerCase() === 'school';
  const sendInviteFlag = String(guardian.other_guardian_send_intake_link ?? 'yes')
    .trim()
    .toLowerCase();
  const sendEmail = !['no', 'false', '0'].includes(sendInviteFlag);
  let inviteResult = null;
  if (email.includes('@')) {
    const created = await createCoGuardianInvite({
      agencyId, invitedByUserId, enrollmentChannel, requestingSubmissionId: submissionId,
      otherGuardian: {
        firstName: guardian.other_guardian_first_name,
        lastName: guardian.other_guardian_last_name,
        email,
        phone,
        relationship: guardian.other_guardian_relationship,
        legalAuthority: rights,
        sendInvite: sendEmail
      },
      clientIds,
      source,
      publicKey,
      sendEmail,
      enablePortalOnMatch: !isSchool
    });
    inviteResult = {
      ...toPublicInviteResult(created),
      queued: !!created.queued
    };
  } else if (String(phone).replace(/\D/g, '').length >= 7) {
    await insertGuardianAccessTicket({
      agencyId,
      subject: isSchool
        ? 'Secondary guardian listed without email — school follow-up'
        : 'Other guardian listed without email — follow up for consent',
      question: [
        isSchool
          ? 'A school intake listed another guardian with medical decision-making rights, but did not provide an email.'
          : 'A parent completed intake and said another guardian has medical decision-making rights, but did not provide an email.',
        'Care start may be delayed until we collect that person’s informed consent.',
        `Name: ${[guardian.other_guardian_first_name, guardian.other_guardian_last_name].filter(Boolean).join(' ') || '(not given)'}`,
        `Phone: ${phone}`,
        `Relationship: ${guardian.other_guardian_relationship || '(not given)'}`,
        `Legal authority: ${rights}`,
        `Source: ${source}`,
        `Public key: ${publicKey || '(none)'}`,
        `Dependent client IDs: ${(clientIds || []).join(', ')}`
      ].join('\n')
    });
    inviteResult = { pendingContact: true, reason: 'no_email', queued: true };
  } else if (isSchool) {
    // Court docs / incomplete contact still need agency follow-up for school secondary guardians.
    inviteResult = { pendingContact: true, reason: 'docs_or_incomplete', queued: true };
  }

  if (isSchool && inviteResult) {
    try {
      const { maybeCreateSecondaryGuardianFollowUpTask } = await import('./secondaryGuardianFollowUp.service.js');
      await maybeCreateSecondaryGuardianFollowUpTask({
        agencyId,
        clientIds,
        submissionId,
        publicKey,
        guardian,
        invite: inviteResult,
        source: 'school'
      });
    } catch (err) {
      console.warn('[coGuardianInvite] secondary guardian follow-up task skipped', err?.message || err);
    }
  }

  return inviteResult;
}

export function assertActiveCoGuardianInvite(row, { agencyId, publicKey } = {}) {
  const fail = (message, statusCode = 410) => { const error = new Error(message); error.statusCode = statusCode; error.status = statusCode; throw error; };
  if (!row) fail('This invite link is not valid.', 404);
  if (!['pending', 'accepted'].includes(String(row.status))) fail('This invite is no longer active.');
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now() || !Number.isFinite(new Date(row.expires_at).getTime())) fail('This invitation expired. Please contact the care team for a new invitation.');
  if ((agencyId && Number(row.agency_id) !== Number(agencyId)) || (publicKey && row.public_key && String(row.public_key) !== String(publicKey))) fail('This invitation belongs to a different enrollment packet.', 403);
  return row;
}

export async function resolveCoGuardianIntakeBinding(token, scope = {}) {
  const row = assertActiveCoGuardianInvite(await loadInviteByToken(token), scope);
  const clients = await loadInviteClients(row.id);
  return {
    invite: row,
    clients,
    acceptedUserId: row.accepted_user_id ? Number(row.accepted_user_id) : null
  };
}

// A return-link session already authorizes this exact saved enrollment. Recover
// only its server-bound invitation; never trust an invite ID from a request or
// editable intake answers. This also supports return emails without coGuardian.
export async function resolveCoGuardianResumeBinding(submission, sessionToken, scope = {}) {
  if (!submission?.co_guardian_invite_id) return null;
  if (!matchesIntakeSession(sessionToken, submission.session_token)) {
    throw Object.assign(new Error('A valid intake session is required'), { status: 403, statusCode: 403 });
  }
  const expired = [submission.draft_expires_at, submission.retention_expires_at]
    .some(value => value && new Date(value).getTime() <= Date.now());
  if (expired) throw Object.assign(new Error('This enrollment return link has expired.'), { status: 410, statusCode: 410 });
  const [rows] = await pool.execute('SELECT * FROM co_guardian_invites WHERE id = ? LIMIT 1', [Number(submission.co_guardian_invite_id)]);
  const invite = assertActiveCoGuardianInvite(rows?.[0], scope);
  const binding = { invite, clients: await loadInviteClients(invite.id), acceptedUserId: invite.accepted_user_id ? Number(invite.accepted_user_id) : null };
  assertCoGuardianSubmissionBinding(submission, binding);
  return binding;
}

export function assertCoGuardianSubmissionBinding(submission, binding) {
  let data = submission?.intake_data || {};
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const attribution = data?.guardianSubmission?.kind === 'additional_guardian' ? data.guardianSubmission : null;
  const durableId = Number(submission?.co_guardian_invite_id || 0);
  const fail = () => { throw Object.assign(new Error('Open this enrollment from its original guardian invitation to continue.'), { status: 403, statusCode: 403 }); };
  if ((durableId || attribution) && !binding) fail();
  if (!binding) return;
  if (durableId && durableId !== Number(binding.invite?.id)) fail();
  if (attribution && Number(attribution.inviteId) !== Number(binding.invite?.id)) fail();
  const acceptedUserId = Number(binding.acceptedUserId || binding.invite?.accepted_user_id || 0);
  if (attribution && Number(attribution.guardianUserId || submission?.guardian_user_id || 0) !== acceptedUserId) fail();
  if (acceptedUserId && submission?.guardian_user_id && Number(submission.guardian_user_id) !== acceptedUserId) fail();
}

export async function emailCoGuardianInvite({ inviteId, agency, to, firstName, inviteUrl, clientId, enrollmentChannel = null, school = false, reminder = false }) {
  const org = String(agency?.official_name || agency?.name || 'our care team').trim();
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
  const subject = `${org}: ${reminder ? 'reminder to complete' : 'complete'} your guardian enrollment`;
  const requester = await requestingGuardianContext({ inviteId, agencyId: agency.id, clientId });
  const requesterLabel = requester?.name
    ? `${requester.name}${requester.email ? ` (${requester.email})` : ''}` : null;
  const childReference = requester?.clientInitials ? ` for the child with initials ${requester.clientInitials}` : '';
  const text = [
    greeting,
    requesterLabel ? `${requesterLabel} provided your information as another guardian${childReference} for enrollment with ${org}.` : `${org} has invited you to complete your own guardian enrollment${childReference}.`,
    reminder ? `This is a reminder to complete your own guardian enrollment for ${org}.` : `You have been invited to complete your own guardian enrollment for ${org}.`,
    'Review and sign your own required agreements, and share your observations and expectations for your dependent. Your care team can review your submission separately; it will not replace your child’s identifying information.',
    'Use the email address that received this invitation for your own portal account. You will not see the other guardian’s private enrollment answers. Shared appointments, messages, plans, and billing information are available according to the access your agency authorizes.',
    school
      ? 'After submitting, you may optionally request a secure email to create your portal password, or wait for an invitation from your care team. Portal setup is not required for enrollment. If you already have an account, keep using your existing login.'
      : 'After submitting, use the portal setup option to receive a secure email and choose your password. If you already have an account, keep using your existing login.',
    inviteUrl,
    `This link expires in ${INVITE_DAYS} days.`,
    'This invitation is for you. Please do not share your personal enrollment link.'
  ].join('\n\n');
  try {
    return await sendEnrollmentPortalEmail({
      to,
      subject,
      text,
      agencyId: agency.id,
      clientId,
      enrollmentChannel, schoolEnrollment: school,
      source: 'co_guardian_invite',
      templateType: 'co_guardian_invite',
      linkUrl: inviteUrl,
      linkLabel: 'Complete your enrollment'
    });
  } catch (err) {
    console.warn('Co-guardian invite email skipped:', err?.message || err);
    return { sent: false, queued: false, deliveryStatus: 'failed', communicationId: err?.communicationId || null };
  }
}

async function loadInviteByToken(token) {
  const hash = hashToken(token);
  const [rows] = await pool.execute(
    `SELECT * FROM co_guardian_invites WHERE token_hash = ? LIMIT 1`,
    [hash]
  );
  return rows?.[0] || null;
}

async function loadInviteClients(inviteId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.full_name, c.initials, c.date_of_birth,
       (c.billing_insurance_payload IS NOT NULL OR NULLIF(c.primary_insurer_name, '') IS NOT NULL) AS insurance_on_file
       FROM co_guardian_invite_clients ic
       JOIN co_guardian_invites i ON i.id = ic.invite_id
       JOIN clients c ON c.id = ic.client_id AND c.agency_id = i.agency_id
      WHERE ic.invite_id = ? ORDER BY c.id`,
    [Number(inviteId)]
  );
  return rows || [];
}

function firstNameOnly(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Dependent';
}

export async function getPublicCoGuardianInvite(token) {
  const row = await loadInviteByToken(token);
  assertActiveCoGuardianInvite(row);
  return presentCoGuardianInvite(row);
}

export async function presentCoGuardianInvite(row) {
  const agency = await Agency.findById(row.agency_id);
  const clients = await loadInviteClients(row.id);
  const { readClientInsurance } = await import('./clientInsurance.service.js');
  const { hasMedicaidCoverage } = await import('../utils/insurancePaymentPolicy.js');
  let paymentCollectionAvailable = true;
  for (const client of clients) {
    if (hasMedicaidCoverage(await readClientInsurance(client.id, row.agency_id))) paymentCollectionAvailable = false;
  }
  return {
    paymentCollectionAvailable,
    status: row.status,
    source: row.source,
    publicKey: row.public_key || null,
    agency: {
      id: agency?.id || row.agency_id,
      name: String(agency?.official_name || agency?.name || '').trim(),
      slug: String(agency?.portal_url || agency?.slug || '').trim()
    },
    contact: {
      firstName: row.invited_first_name || '',
      lastName: row.invited_last_name || '',
      email: row.invited_email || '',
      phone: row.invited_phone || '',
      relationship: row.relationship_title || ''
    },
    dependents: clients.map((c) => ({
      id: c.id,
      ...splitName(c.full_name),
      dateOfBirth: c.date_of_birth instanceof Date ? c.date_of_birth.toISOString().slice(0, 10) : String(c.date_of_birth || '').slice(0, 10),
      initials: c.initials || null,
      insuranceOnFile: !!c.insurance_on_file
    })),
    expiresAt: row.expires_at
  };
}

export async function acceptCoGuardianInvite({ token, resume = null, contact = {}, answers = null, createPortal = null, enrollmentCompleted = false }) {
  let row;
  if (token) {
    row = await loadInviteByToken(token);
  } else if (resume?.sessionToken && resume?.submissionId) {
    // Recheck the capability and durable association at activation, rather than
    // accepting a caller-supplied invitation or trusting an earlier lookup.
    const submission = await IntakeSubmission.findBySessionToken(resume.sessionToken);
    if (Number(submission?.id) !== Number(resume.submissionId)) {
      throw Object.assign(new Error('A valid intake session is required'), { status: 403, statusCode: 403 });
    }
    row = (await resolveCoGuardianResumeBinding(submission, resume.sessionToken, resume))?.invite;
  }

  assertActiveCoGuardianInvite(row);
  if (row.public_key && !enrollmentCompleted) {
    throw Object.assign(new Error('Complete and sign your enrollment packet before activating guardian access.'), {status:409,statusCode:409});
  }
  const firstName = String(contact.firstName || row.invited_first_name || '').trim() || 'Guardian';
  const lastName = String(contact.lastName || row.invited_last_name || '').trim();
  const email = String(contact.email || row.invited_email || '').trim().toLowerCase();
  if (email !== String(row.invited_email || '').trim().toLowerCase()) {
    throw Object.assign(new Error('Please use the invited email address, or ask the care team for a corrected invitation.'), { statusCode: 400, status: 400 });
  }
  const phone = String(contact.phone || row.invited_phone || '').trim() || null;
  if (!email || !email.includes('@')) {
    throw new Error('Email is required to complete this intake.');
  }

  const clients = await loadInviteClients(row.id);

  let user = await User.findByEmail(email);
  let password = null;
  let created = false;
  if (user?.id) {
    const role = String(user.role || '').toLowerCase();
    if (!['client_guardian','guardian','client'].includes(role)) {
      const err = new Error('This email cannot be used for the parent/guardian portal. Enter a different email.');
      err.statusCode = 400;
      throw err;
    }
    await pool.execute(
      `UPDATE users SET first_name = ?, last_name = ?, phone_number = COALESCE(?, phone_number) WHERE id = ?`,
      [firstName, lastName, phone, user.id]
    );
  } else {
    password = null; // Password setup happens only through the later portal invitation.
    user = await User.create({
      email,
      role: 'client_guardian',
      firstName,
      lastName,
      phoneNumber: phone,
      status: 'PENDING_SETUP'
    });
    if (password) await User.changePassword(user.id, password);
    created = true;
  }

  for (const client of clients) {
    const existing = await ClientGuardian.getLink({ clientId: client.id, guardianUserId: user.id });
    await ClientGuardian.upsertLink({
      clientId: client.id,
      guardianUserId: user.id,
      relationshipType: 'guardian',
      relationshipTitle: String(contact.relationship || row.relationship_title || existing?.relationship_title || 'Guardian').trim() || 'Guardian',
      accessEnabled: existing ? Number(existing.access_enabled) === 1 : true,
      permissionsJson: completedCoGuardianPermissions(row.id, existing?.permissions_json)
    });
  }

  if (['yes', 'shared'].includes(String(row.legal_authority || '').toLowerCase())) {
    for (const client of clients) await pool.execute(
      `INSERT INTO guardian_portal_policies (agency_id,client_id,shared_billing,source_invite_id) VALUES (?,?,1,?)
       ON DUPLICATE KEY UPDATE shared_billing=1,source_invite_id=VALUES(source_invite_id)`,
      [row.agency_id,client.id,row.id]
    );
  }

  try {
    await pool.execute(
      `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [user.id, row.agency_id]
    );
  } catch {
    /* affiliation table shape may vary */
  }

  const responseJson = answers && typeof answers === 'object' ? JSON.stringify(answers) : row.response_json;
  await pool.execute(
    `UPDATE co_guardian_invites
        SET status = 'accepted',
            accepted_user_id = ?,
            accepted_at = NOW(),
            invited_email = ?,
            invited_first_name = ?,
            invited_last_name = ?,
            invited_phone = ?,
            response_json = ?
      WHERE id = ?`,
    [user.id, email, firstName, lastName, phone, responseJson, row.id]
  );

  const agency = await Agency.findById(row.agency_id);
  return {
    accepted: true,
    created,
    acceptedUserId: user.id,
    portalAccess: process.env.GUARDIAN_PORTAL_INVITATIONS_ENABLED === 'true' ? {
      email,
      password,
      existingAccount: !created,
      portalPath: buildPublicPortalLoginUrl(agency)
    } : null,
    dependents: clients.map((c) => ({
      id: c.id,
      firstName: firstNameOnly(c.full_name)
    })),
    publicKey: row.public_key || null,
    source: row.source
  };
}

export { emailSummaryPdfCopy } from './intakeSummaryPdfEmail.service.js';

export async function emailPortalLoginInfo({
  to,
  agency,
  username,
  temporaryPassword = null,
  portalPath = '/login',
  clientId = null
}) {
  const email = String(to || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
  const {clientEmailContext,sendClientPortalEmail}=await import('./clientPortalEmail.service.js');
  const {buildClientEnrollmentEmail}=await import('./clientPortalEmailContent.js');
  const {clientPortalInviteUrl}=await import('./clientPortalContext.service.js');
  const guardian=await User.findByEmail(email);
  if(!clientId && guardian?.role==='client_guardian') {
    const [[linked]]=await pool.execute(`SELECT c.id FROM clients c JOIN client_guardians cg ON cg.client_id=c.id
      WHERE cg.guardian_user_id=? AND c.agency_id=? AND cg.access_enabled=1 AND c.guardian_portal_enabled=1
      AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED') ORDER BY c.id LIMIT 1`,[guardian.id,agency.id]);
    clientId=linked?.id || null;
  }
  const context=await clientEmailContext({agencyId:agency.id,clientId});
  const canSetup=!!clientId && guardian?.role==='client_guardian';
  const existingAccount=!!guardian?.password_hash || !canSetup;
  let token=null;
  if(!existingAccount){
    const [[saved]]=await pool.execute("SELECT passwordless_token AS token FROM users WHERE id=? AND passwordless_token_purpose='setup' AND passwordless_token_expires_at>NOW()",[guardian.id]);
    token=saved?.token||(await User.generatePasswordlessToken(guardian.id,48,'setup')).token;
  }
  const url=clientPortalInviteUrl({portal:context.portal,token,existingAccount});
  const content=canSetup?buildClientEnrollmentEmail({username:guardian?.email || guardian?.username,firstName:guardian?.first_name,agencyName:agency.name,
    clients:[context.client],learning:context.learning,existingAccount,url}):{
      subject:`${agency.name}: sign in to your portal`,text:`Sign in to your ${context.clinical?'AuricWell':'family'} portal to view information shared with your account.\n\n${url}`,
      html:(await import('./clientPortalEmailContent.js')).portalActionHtml('Sign in to your portal',url),linkUrl:url};
  if(temporaryPassword){content.text+=`\n\nTemporary password: ${temporaryPassword}`;const {escapePortalHtml}=await import('./portalEmailBranding.service.js');content.html+=`<p>Temporary password: <strong>${escapePortalHtml(temporaryPassword)}</strong></p>`;}
  const result=await sendClientPortalEmail({agencyId:agency.id,clientId,context,to:email,...content,
    userId:guardian?.id||null,source:'guardian_portal_login_info',templateType:'guardian_portal_login_info'});
  const sent=!!result?.id&&!result.queued&&!result.skipped&&!result.blocked&&!result.redirected;
  const delivery={...result,sent};
  return { ok: delivery.sent, ...delivery };
}
