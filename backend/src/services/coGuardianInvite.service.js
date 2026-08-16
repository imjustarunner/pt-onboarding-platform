import crypto from 'crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import EmailService from './email.service.js';
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
      noViewOtherGuardian: true,
      coGuardianInviteId: inviteId || prior.coGuardianInviteId || null
    };
  }
  return { ...NO_VIEW_GUARDIAN_PERMISSIONS, coGuardianInviteId: inviteId || null };
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
  const origin = String(process.env.FRONTEND_URL || process.env.APP_URL || 'https://plottwisthq.com').replace(/\/$/, '');
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
  otherGuardian,
  clientIds = [],
  source = 'office',
  publicKey = null,
  sendEmail = true
}) {
  const agency = await Agency.findById(agencyId);
  if (!agency) throw new Error('Organization not found');
  const person = normalizeOtherGuardian(otherGuardian);
  if (!person.email || !person.email.includes('@')) {
    throw new Error('The other guardian needs an email address so we can send their link.');
  }
  const ids = [...new Set((Array.isArray(clientIds) ? clientIds : []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) throw new Error('At least one dependent is required.');

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const [result] = await pool.execute(
    `INSERT INTO co_guardian_invites
      (agency_id, invited_by_user_id, invited_email, invited_first_name, invited_last_name, invited_phone,
       relationship_title, legal_authority, token_hash, expires_at, status, source, public_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
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
      publicKey ? String(publicKey).slice(0, 80) : null
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
    clientIds: ids,
    relationshipTitle: person.relationship || 'Guardian',
    inviteId,
    invitedByUserId
  });

  const inviteUrl = invitePublicUrl({ agency, token, publicKey });
  let emailed = false;
  if (sendEmail !== false && person.sendInvite !== false) {
    emailed = await emailCoGuardianInvite({
      agency,
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
    emailed,
    expiresAt: expiresAt.toISOString(),
    email: person.email
  };
}

async function silentlyLinkMatchingGuardian({
  email,
  clientIds,
  relationshipTitle,
  inviteId,
  invitedByUserId = null
}) {
  try {
    const user = await User.findByEmail(email);
    if (!user?.id) return;
    if (invitedByUserId && Number(user.id) === Number(invitedByUserId)) return;
    const role = String(user.role || '').toLowerCase();
    if (role !== 'client_guardian' && role !== 'guardian') return;
    const title = String(relationshipTitle || 'Guardian').trim() || 'Guardian';
    for (const clientId of clientIds) {
      const existing = await ClientGuardian.getLink({ clientId, guardianUserId: user.id });
      await ClientGuardian.upsertLink({
        clientId,
        guardianUserId: user.id,
        relationshipType: 'guardian',
        relationshipTitle: existing?.relationship_title || title,
        accessEnabled: true,
        permissionsJson: noViewPermissionsForInvite(inviteId, existing?.permissions_json)
      });
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

async function insertGuardianAccessTicket({ agencyId, subject, question, fallbackUserId = null }) {
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
  publicKey = null
} = {}) {
  const guardian = intakeData?.guardian && typeof intakeData.guardian === 'object'
    ? intakeData.guardian
    : {};
  const rights = String(guardian.other_guardian_has_legal_rights || '').trim().toLowerCase();
  if (rights !== 'yes' && rights !== 'shared') return null;
  const email = String(guardian.other_guardian_email || '').trim().toLowerCase();
  const phone = String(guardian.other_guardian_phone || '').trim();
  const sendInvite = String(guardian.other_guardian_send_intake_link || 'yes').trim().toLowerCase() !== 'no';
  if (email.includes('@')) {
    const created = await createCoGuardianInvite({
      agencyId,
      otherGuardian: {
        firstName: guardian.other_guardian_first_name,
        lastName: guardian.other_guardian_last_name,
        email,
        phone,
        relationship: guardian.other_guardian_relationship,
        legalAuthority: rights,
        sendInvite
      },
      clientIds,
      source,
      publicKey,
      sendEmail: sendInvite
    });
    return toPublicInviteResult(created);
  }
  if (String(phone).replace(/\D/g, '').length >= 7) {
    await insertGuardianAccessTicket({
      agencyId,
      subject: 'Other guardian listed without email — follow up for consent',
      question: [
        'A parent completed intake and said another guardian has medical decision-making rights, but did not provide an email.',
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
    return { pendingContact: true, reason: 'no_email' };
  }
  return null;
}

export async function resolveCoGuardianIntakeBinding(token) {
  const row = await loadInviteByToken(token);
  if (!row) return null;
  if (String(row.status) !== 'pending' && String(row.status) !== 'accepted') return null;
  const clients = await loadInviteClients(row.id);
  return {
    invite: row,
    clients,
    acceptedUserId: row.accepted_user_id ? Number(row.accepted_user_id) : null
  };
}

async function emailCoGuardianInvite({ agency, to, firstName, inviteUrl, clientId }) {
  const org = String(agency?.official_name || agency?.name || 'our care team').trim();
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
  const subject = `${org}: complete your guardian intake`;
  const text = [
    greeting,
    '',
    `Another parent or guardian invited you to complete your own intake for ${org}.`,
    'You will not see the other guardian’s answers. This link is only for your information, your contact details, and the dependent(s) connected to you.',
    '',
    inviteUrl,
    '',
    `This link expires in ${INVITE_DAYS} days.`,
    '',
    'This message may contain protected health information. If you received it in error, delete it.'
  ].join('\n');
  try {
    await EmailService.sendEmail({
      to,
      subject,
      text,
      agencyId: agency.id,
      clientId,
      source: 'co_guardian_invite',
      templateType: 'co_guardian_invite',
      linkUrl: inviteUrl
    });
    return true;
  } catch (err) {
    console.warn('Co-guardian invite email skipped:', err?.message || err);
    return false;
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
    `SELECT c.id, c.full_name, c.initials, c.date_of_birth
       FROM co_guardian_invite_clients ic
       JOIN clients c ON c.id = ic.client_id
      WHERE ic.invite_id = ?`,
    [Number(inviteId)]
  );
  return rows || [];
}

function firstNameOnly(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Dependent';
}

export async function getPublicCoGuardianInvite(token) {
  const row = await loadInviteByToken(token);
  if (!row) {
    const err = new Error('This invite link is not valid.');
    err.statusCode = 404;
    throw err;
  }
  if (String(row.status) !== 'pending' && String(row.status) !== 'accepted') {
    const err = new Error('This invite is no longer active.');
    err.statusCode = 410;
    throw err;
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() && String(row.status) === 'pending') {
    const err = new Error('This access token expired. Use Contact us or Access token expired? on the login page if you need a new token.');
    err.statusCode = 410;
    err.expiredToken = true;
    throw err;
  }
  const agency = await Agency.findById(row.agency_id);
  const clients = await loadInviteClients(row.id);
  return {
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
      firstName: firstNameOnly(c.full_name),
      initials: c.initials || null
    })),
    expiresAt: row.expires_at
  };
}

export async function acceptCoGuardianInvite({ token, contact = {}, answers = null }) {
  const row = await loadInviteByToken(token);
  if (!row) {
    const err = new Error('This invite link is not valid.');
    err.statusCode = 404;
    throw err;
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() && String(row.status) === 'pending') {
    const err = new Error('This access token expired. Use Contact us or Access token expired? on the login page if you need a new token.');
    err.statusCode = 410;
    err.expiredToken = true;
    throw err;
  }
  const firstName = String(contact.firstName || row.invited_first_name || '').trim() || 'Guardian';
  const lastName = String(contact.lastName || row.invited_last_name || '').trim();
  const email = String(contact.email || row.invited_email || '').trim().toLowerCase();
  const phone = String(contact.phone || row.invited_phone || '').trim() || null;
  if (!email || !email.includes('@')) {
    throw new Error('Email is required. You can keep the invited address or change it — it becomes your username.');
  }

  let user = await User.findByEmail(email);
  let password = null;
  let created = false;
  if (user?.id) {
    const role = String(user.role || '').toLowerCase();
    if (role !== 'client_guardian' && role !== 'guardian') {
      const err = new Error('This email cannot be used for the parent/guardian portal. Enter a different email.');
      err.statusCode = 400;
      throw err;
    }
    await pool.execute(
      `UPDATE users SET first_name = ?, last_name = ?, phone_number = COALESCE(?, phone_number) WHERE id = ?`,
      [firstName, lastName, phone, user.id]
    );
  } else {
    password = await User.generateTemporaryPassword();
    user = await User.create({
      email,
      role: 'client_guardian',
      firstName,
      lastName,
      phoneNumber: phone,
      status: 'active'
    });
    await User.changePassword(user.id, password);
    created = true;
  }

  const clients = await loadInviteClients(row.id);
  for (const client of clients) {
    const existing = await ClientGuardian.getLink({ clientId: client.id, guardianUserId: user.id });
    await ClientGuardian.upsertLink({
      clientId: client.id,
      guardianUserId: user.id,
      relationshipType: 'guardian',
      relationshipTitle: String(contact.relationship || row.relationship_title || existing?.relationship_title || 'Guardian').trim() || 'Guardian',
      accessEnabled: true,
      permissionsJson: noViewPermissionsForInvite(row.id, existing?.permissions_json)
    });
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
  const slug = String(agency?.portal_url || agency?.slug || '').trim();
  return {
    accepted: true,
    created,
    portalAccess: {
      email,
      password,
      existingAccount: !created,
      portalPath: slug ? `/${encodeURIComponent(slug)}/login` : '/login'
    },
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
  const org = String(agency?.official_name || agency?.name || 'Care team').trim();
  const origin = String(process.env.FRONTEND_URL || process.env.APP_URL || 'https://plottwisthq.com').replace(/\/$/, '');
  const path = String(portalPath || '/login').startsWith('http')
    ? String(portalPath)
    : `${origin}${String(portalPath || '/login').startsWith('/') ? '' : '/'}${portalPath || '/login'}`;
  const lines = [
    `Your ${org} parent/guardian portal username is: ${username || email}`,
    '',
    `Sign in: ${path}`,
    '',
    'You can keep this email as your username or change it after you sign in.',
    temporaryPassword
      ? `Temporary password: ${temporaryPassword}`
      : 'If you already chose a password, use that. If your access token expired or never arrived, use “Access token expired?” on the login page — that notifies the care team. They can send a new token or a temporary password. It is not Forgot password.',
    '',
    'You can skip portal setup for now, but an account may still be needed for medical records.'
  ];
  await EmailService.sendEmail({
    to: email,
    subject: `${org}: your parent/guardian portal login`,
    text: lines.join('\n'),
    agencyId: agency.id,
    clientId,
    source: 'guardian_portal_login_info',
    templateType: 'guardian_portal_login_info'
  });
  return { ok: true };
}
