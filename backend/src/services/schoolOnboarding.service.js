import crypto from 'crypto';
import pool from '../config/database.js';
import config from '../config/config.js';
import SchoolOnboardingInvite from '../models/SchoolOnboardingInvite.model.js';
import SchoolOnboardingQrLink from '../models/SchoolOnboardingQrLink.model.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import User from '../models/User.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import EmailService from './email.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { validatePasswordStrength } from '../utils/passwordValidation.js';
import { bootstrapDigitalIntakeFormsForSchool } from './schoolOnboardingIntakeBootstrap.service.js';

async function notifySchoolPortalOnboardingCompleted(invite) {
  if (!invite?.agency_id || !invite?.id) return;
  try {
    const Notification = (await import('../models/Notification.model.js')).default;
    const schoolName = String(invite.school_org_name || invite.school_name || 'School').trim();
    await Notification.create({
      type: 'school_portal_onboarding_completed',
      severity: 'info',
      title: 'School portal onboarding complete',
      message: `${schoolName} completed school portal onboarding.`,
      audienceJson: {
        admin: true,
        support: true,
        staff: true,
        provider: false
      },
      userId: null,
      agencyId: invite.agency_id,
      relatedEntityType: 'school_onboarding_invite',
      relatedEntityId: invite.id,
      actorUserId: invite.primary_user_id || null,
      actorSource: 'School Portal'
    });
  } catch {
    // best effort
  }
}

const STEP_KEYS = [
  'school_information',
  'school_staff',
  'preferred_days',
  'welcome_materials',
  'explore_demo',
  'review_submit'
];

const REQUIRED_BEFORE_SUBMIT = [
  'school_information',
  'school_staff',
  'preferred_days',
  'welcome_materials',
  'explore_demo'
];

const WELCOME_MATERIAL_KEYS = new Set(['trifolds', 'stress_balls', 'pens', 'other']);

function buildSchoolLoginPath(agencySlug, schoolSlug) {
  const school = String(schoolSlug || '').trim().toLowerCase();
  const agency = String(agencySlug || '').trim().toLowerCase();
  if (!school) return '/login';
  if (agency && agency !== school) return `/${agency}/${school}/login`;
  return `/${school}/login`;
}

function summarizeWelcomeMaterials(payload) {
  const body = payload?.welcome_materials;
  if (!body || typeof body !== 'object') return null;
  const materials = Array.isArray(body.materials)
    ? body.materials.map((m) => String(m || '').trim()).filter((m) => WELCOME_MATERIAL_KEYS.has(m))
    : [];
  const materialsOther = String(body.materialsOther || '').trim();
  const requestPaperPackets =
    body.requestPaperPackets === true ? true : body.requestPaperPackets === false ? false : null;
  if (requestPaperPackets == null && !materials.length && !materialsOther) return null;
  return {
    materials,
    materialsOther: materialsOther || null,
    requestPaperPackets
  };
}

const SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS = 24 * 7;

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `school-${crypto.randomBytes(4).toString('hex')}`;
}

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function frontendBase() {
  return String(config.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

export function buildOnboardingLink(token) {
  return `${frontendBase()}/school-onboarding/${token}`;
}

export function buildQrStartLink(token) {
  return `${frontendBase()}/school-onboarding/start/${token}`;
}

function parseAccessRole(accessRole) {
  const role = String(accessRole || 'standard').trim().toLowerCase();
  if (role === 'school_admin') return { isSchoolAdmin: true, isScheduler: false };
  if (role === 'scheduler') return { isSchoolAdmin: false, isScheduler: true };
  if (role === 'school_admin_scheduler') return { isSchoolAdmin: true, isScheduler: true };
  // standard = ROI-eligible (appears in Smart School ROI assignment lists)
  return { isSchoolAdmin: false, isScheduler: false };
}

async function upsertSchoolContactRoleFlags({ orgId, email, fullName = null, isSchoolAdmin, isScheduler, isPrimary = false }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return;
  try {
    const [existingRows] = await pool.execute(
      `SELECT id FROM school_contacts
       WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [orgId, normalized]
    );
    if (existingRows?.length) {
      await pool.execute(
        `UPDATE school_contacts
         SET full_name = COALESCE(?, full_name),
             is_school_admin = ?,
             is_scheduler = ?,
             is_primary = IF(?, 1, is_primary),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          fullName || null,
          isSchoolAdmin ? 1 : 0,
          isScheduler ? 1 : 0,
          isPrimary ? 1 : 0,
          existingRows[0].id
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, is_primary, is_school_admin, is_scheduler)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
        [
          orgId,
          fullName || null,
          normalized,
          isPrimary ? 1 : 0,
          isSchoolAdmin ? 1 : 0,
          isScheduler ? 1 : 0
        ]
      );
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

export function isInviteUsable(invite) {
  if (!invite) return { ok: false, code: 'not_found', message: 'Invite not found' };
  if (invite.status === 'revoked') return { ok: false, code: 'revoked', message: 'This invite has been revoked' };
  if (invite.status === 'expired') return { ok: false, code: 'expired', message: 'This invite has expired' };
  if (invite.status === 'submitted') return { ok: true, submitted: true };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 'expired', message: 'This invite has expired' };
  }
  return { ok: true, submitted: false };
}

async function uniqueSchoolSlug(baseSlug) {
  let slug = baseSlug;
  for (let i = 0; i < 20; i += 1) {
    const [rows] = await pool.execute(
      `SELECT id FROM agencies WHERE slug = ? OR portal_url = ? LIMIT 1`,
      [slug, slug]
    );
    if (!rows?.length) return slug;
    slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

async function setSchoolDraftFlag(schoolId, isDraft) {
  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [schoolId]
  );
  const flags = parseFlags(rows?.[0]?.feature_flags);
  if (isDraft) flags.schoolOnboardingDraft = true;
  else delete flags.schoolOnboardingDraft;
  await pool.execute(
    `UPDATE agencies SET feature_flags = ?, is_active = ? WHERE id = ?`,
    [JSON.stringify(flags), isDraft ? 0 : 1, schoolId]
  );
}

function resolveSchoolGroupEmailDomain(slug, portalUrl) {
  const base = String(slug || portalUrl || 'itsco')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return base ? `${base}.health` : 'itsco.health';
}

function resolveSchoolOnboardingSupportEmail(slug, portalUrl, fallback = null) {
  const base = String(slug || portalUrl || 'itsco')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (base) return `support@${base}.health`;
  return fallback || null;
}

const SCHOOL_ONBOARDING_SUPPORT_PHONE = '719-657-7444 Ext 0';
const SCHOOL_ONBOARDING_SUPPORT_PHONE_TEL = '+17196577444,0';

function formatUsPhoneNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(raw || '').trim();
}

function formatPhoneExtension(ext) {
  const value = String(ext ?? '').trim();
  if (!value) return '';
  if (/^ext\.?\s*/i.test(value)) return value.replace(/^ext\.?\s*/i, 'Ext ');
  return `Ext ${value}`;
}

function resolveSchoolOnboardingSupportPhone(phoneNumber, phoneExtension, slug, portalUrl) {
  const base = String(slug || portalUrl || 'itsco')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  const isTollFree = digits === '8334448726' || digits === '18334448726';
  if (base === 'itsco' || isTollFree || !digits) {
    return {
      display: SCHOOL_ONBOARDING_SUPPORT_PHONE,
      tel: SCHOOL_ONBOARDING_SUPPORT_PHONE_TEL,
    };
  }
  const formatted = formatUsPhoneNumber(phoneNumber);
  if (!formatted) {
    return {
      display: SCHOOL_ONBOARDING_SUPPORT_PHONE,
      tel: SCHOOL_ONBOARDING_SUPPORT_PHONE_TEL,
    };
  }
  const ext = formatPhoneExtension(phoneExtension);
  const extDigits = String(phoneExtension || '').replace(/\D/g, '');
  return {
    display: ext ? `${formatted} ${ext}` : formatted,
    tel: extDigits ? `+1${digits},${extDigits}` : `+1${digits}`,
  };
}

async function upsertSchoolProfile(schoolId, updates = {}) {
  const {
    districtName = null,
    schoolNumber = null,
    itscoEmail = null,
    schoolDaysTimes = null,
    schoolAddress = null,
    academicYear = null,
    gradeLevels = null,
    primaryContactName = null,
    primaryContactEmail = null,
    primaryContactRole = null,
    secondaryContactText = null
  } = updates;

  const daysTimesParts = [];
  if (schoolDaysTimes) daysTimesParts.push(String(schoolDaysTimes));
  if (academicYear) daysTimesParts.push(`Academic year: ${academicYear}`);
  if (gradeLevels) daysTimesParts.push(`Grades: ${gradeLevels}`);
  const combinedDays = daysTimesParts.length ? daysTimesParts.join('\n') : schoolDaysTimes;

  await pool.execute(
    `INSERT INTO school_profiles
      (school_organization_id, district_name, school_number, itsco_email, school_days_times, school_address,
       primary_contact_name, primary_contact_email, primary_contact_role, secondary_contact_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       district_name = COALESCE(VALUES(district_name), district_name),
       school_number = COALESCE(VALUES(school_number), school_number),
       itsco_email = COALESCE(VALUES(itsco_email), itsco_email),
       school_days_times = COALESCE(VALUES(school_days_times), school_days_times),
       school_address = COALESCE(VALUES(school_address), school_address),
       primary_contact_name = COALESCE(VALUES(primary_contact_name), primary_contact_name),
       primary_contact_email = COALESCE(VALUES(primary_contact_email), primary_contact_email),
       primary_contact_role = COALESCE(VALUES(primary_contact_role), primary_contact_role),
       secondary_contact_text = COALESCE(VALUES(secondary_contact_text), secondary_contact_text)`,
    [
      schoolId,
      districtName,
      schoolNumber,
      itscoEmail,
      combinedDays,
      schoolAddress,
      primaryContactName,
      primaryContactEmail,
      primaryContactRole,
      secondaryContactText
    ]
  );
}

async function getSchoolProfile(schoolId) {
  const [rows] = await pool.execute(
    `SELECT * FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
    [schoolId]
  );
  return rows?.[0] || null;
}

function parseName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { firstName: 'School', lastName: 'Staff' };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Staff' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export async function sendInviteEmail(invite, { agency, invitedByName } = {}) {
  const agencyRow = agency || (await Agency.findById(invite.agency_id));
  const link = buildOnboardingLink(invite.token);
  const contactName = `${invite.contact_first_name || ''} ${invite.contact_last_name || ''}`.trim();
  const to = String(invite.contact_email || '').trim().toLowerCase();
  if (!to) return { sent: false, reason: 'missing_email' };

  let subject = `Welcome to ${agencyRow?.name || 'your portal'} — set up ${invite.school_name}`;
  let body =
    `Hi ${contactName},\n\n` +
    `${invitedByName || 'Our team'} invited you to set up the school portal for ${invite.school_name}.\n\n` +
    `Continue here:\n${link}\n\n` +
    `Your username will be your email: ${to}\n`;

  try {
    const template = await EmailTemplateService.getTemplateForAgency(invite.agency_id, 'school_onboarding_invite');
    if (template?.body) {
      const params = {
        CONTACT_NAME: contactName,
        SCHOOL_NAME: invite.school_name,
        AGENCY_NAME: agencyRow?.name || '',
        ONBOARDING_LINK: link,
        USERNAME: to,
        INVITED_BY_NAME: invitedByName || 'Our team',
        PEOPLE_OPS_EMAIL: agencyRow?.onboarding_team_email || agencyRow?.email || 'support',
        FIRST_NAME: invite.contact_first_name || '',
        LAST_NAME: invite.contact_last_name || ''
      };
      const rendered = EmailTemplateService.renderTemplate(template, params);
      subject = rendered.subject || subject;
      body = rendered.body || body;
    }
  } catch (e) {
    console.warn('[schoolOnboarding] template render failed:', e?.message || e);
  }

  try {
    const identity = await resolvePreferredSenderIdentityForAgency({
      agencyId: invite.agency_id,
      preferredKeys: ['system', 'default', 'notifications', 'login_recovery']
    });
    if (identity?.id) {
      await sendEmailFromIdentity({
        senderIdentityId: identity.id,
        to,
        subject,
        text: body,
        html: null,
        source: 'auto'
      });
    } else {
      await EmailService.sendEmail({
        to,
        subject,
        text: body,
        html: null,
        fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
        source: 'auto',
        agencyId: invite.agency_id
      });
    }
    return { sent: true, link };
  } catch (e) {
    console.error('[schoolOnboarding] email send failed:', e);
    return { sent: false, reason: e?.message || 'send_failed', link };
  }
}

export async function createInvite({
  agencyId,
  contactFirstName,
  contactLastName,
  contactEmail,
  schoolName,
  invitedByUserId,
  sendEmail = false,
  source = 'invite',
  qrLinkId = null
}) {
  const email = String(contactEmail || '').trim().toLowerCase();
  const firstName = String(contactFirstName || '').trim();
  const lastName = String(contactLastName || '').trim();
  const name = String(schoolName || '').trim();
  if (!email || !email.includes('@')) throw Object.assign(new Error('Valid contact email is required'), { status: 400 });
  if (!firstName || !lastName) throw Object.assign(new Error('Contact first and last name are required'), { status: 400 });
  if (!name) throw Object.assign(new Error('School name is required'), { status: 400 });

  const agency = await Agency.findById(agencyId);
  if (!agency) throw Object.assign(new Error('Agency not found'), { status: 404 });

  const existingUser = await User.findByEmail(email);
  if (existingUser?.id) {
    throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
  }

  const slug = await uniqueSchoolSlug(slugify(name));
  let schoolId = null;
  let user = null;
  try {
    const [schoolResult] = await pool.execute(
      `INSERT INTO agencies (name, slug, portal_url, logo_url, color_palette, terminology_settings, is_active, organization_type, feature_flags)
       VALUES (?, ?, ?, NULL, NULL, NULL, FALSE, 'school', ?)`,
      [name, slug, slug, JSON.stringify({ schoolOnboardingDraft: true })]
    );
    schoolId = schoolResult.insertId;

    try {
      await AgencySchool.upsert({ agencyId, schoolOrganizationId: schoolId, isActive: true });
    } catch {
      // fallback to organization_affiliations
    }
    try {
      await pool.execute(
        `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
         VALUES (?, ?, TRUE)
         ON DUPLICATE KEY UPDATE is_active = TRUE`,
        [agencyId, schoolId]
      );
    } catch {
      // ignore if table/columns differ
    }

    await upsertSchoolProfile(schoolId, {
      primaryContactName: `${firstName} ${lastName}`,
      primaryContactEmail: email,
      primaryContactRole: 'Primary Contact'
    });

    user = await User.create({
      email,
      passwordHash: null,
      firstName,
      lastName,
      role: 'school_staff',
      status: 'PENDING_SETUP',
      personalEmail: email
    });
    try {
      await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [email, email, user.id]);
    } catch {
      // ignore
    }
    try {
      await User.setWorkEmail?.(user.id, email);
    } catch {
      // ignore
    }
    await User.assignToAgency(user.id, schoolId);
    try {
      await User.assignToAgency(user.id, agencyId);
    } catch {
      // ignore
    }

    // Primary contact is School Admin + ROI-eligible (not scheduler)
    await upsertSchoolContactRoleFlags({
      orgId: schoolId,
      email,
      fullName: `${firstName} ${lastName}`,
      isSchoolAdmin: true,
      isScheduler: false,
      isPrimary: true
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 21);

    const invite = await SchoolOnboardingInvite.create({
      agencyId,
      schoolOrganizationId: schoolId,
      primaryUserId: user.id,
      contactFirstName: firstName,
      contactLastName: lastName,
      contactEmail: email,
      schoolName: name,
      invitedByUserId: invitedByUserId || null,
      expiresAt,
      status: 'invited',
      source: source === 'qr' ? 'qr' : 'invite',
      qrLinkId: qrLinkId || null,
      stepProgress: SchoolOnboardingInvite.defaultStepProgress(),
      stepPayload: {}
    });

    let invitedByName = 'Our team';
    if (invitedByUserId) {
      const inviter = await User.findById(invitedByUserId);
      invitedByName = `${inviter?.first_name || ''} ${inviter?.last_name || ''}`.trim() || invitedByName;
    }

    let emailResult = { sent: false };
    if (sendEmail) {
      emailResult = await sendInviteEmail(invite, { agency, invitedByName });
    }

    // Seed EN/ES digital intake forms from the agency's most recent school forms
    let intakeBootstrap = null;
    try {
      intakeBootstrap = await bootstrapDigitalIntakeFormsForSchool({
        agencyId,
        schoolOrganizationId: schoolId,
        schoolName: name,
        createdByUserId: invitedByUserId || null
      });
    } catch (e) {
      console.warn('[schoolOnboarding] intake bootstrap failed:', e?.message || e);
      intakeBootstrap = { errors: [e?.message || 'intake bootstrap failed'] };
    }

    return {
      invite,
      link: buildOnboardingLink(invite.token),
      emailSent: !!emailResult.sent,
      school: { id: schoolId, slug, name },
      intakeBootstrap
    };
  } catch (err) {
    // Best-effort cleanup if draft school/user was partially created
    try {
      if (user?.id) await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    } catch {
      // ignore
    }
    try {
      if (schoolId) await pool.execute('DELETE FROM agencies WHERE id = ?', [schoolId]);
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function listInvites(agencyId) {
  const rows = await SchoolOnboardingInvite.listForAgency(agencyId);
  return rows.map((r) => serializeInvite(r, { admin: true }));
}

export async function resendInvite(inviteId, agencyId, invitedByUserId) {
  const invite = await SchoolOnboardingInvite.findById(inviteId);
  if (!invite || invite.agency_id !== agencyId) {
    throw Object.assign(new Error('Invite not found'), { status: 404 });
  }
  if (invite.status === 'revoked' || invite.status === 'submitted') {
    throw Object.assign(new Error('Cannot resend a revoked or submitted invite'), { status: 400 });
  }
  const token = SchoolOnboardingInvite.generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 21);
  const updated = await SchoolOnboardingInvite.update(invite.id, {
    token,
    expiresAt,
    status: invite.status === 'expired' ? 'invited' : invite.status
  });
  const inviter = invitedByUserId ? await User.findById(invitedByUserId) : null;
  const invitedByName = `${inviter?.first_name || ''} ${inviter?.last_name || ''}`.trim() || 'Our team';
  const agency = await Agency.findById(agencyId);
  const emailResult = await sendInviteEmail(updated, { agency, invitedByName });
  return {
    invite: serializeInvite(updated, { admin: true }),
    link: buildOnboardingLink(updated.token),
    emailSent: !!emailResult.sent
  };
}

export async function sendInviteEmailOnly(inviteId, agencyId, invitedByUserId) {
  const invite = await SchoolOnboardingInvite.findById(inviteId);
  if (!invite || invite.agency_id !== agencyId) {
    throw Object.assign(new Error('Invite not found'), { status: 404 });
  }
  if (invite.status === 'revoked' || invite.status === 'submitted') {
    throw Object.assign(new Error('Cannot email a revoked or submitted invite'), { status: 400 });
  }
  const inviter = invitedByUserId ? await User.findById(invitedByUserId) : null;
  const invitedByName = `${inviter?.first_name || ''} ${inviter?.last_name || ''}`.trim() || 'Our team';
  const agency = await Agency.findById(agencyId);
  const emailResult = await sendInviteEmail(invite, { agency, invitedByName });
  return {
    invite: serializeInvite(invite, { admin: true }),
    link: buildOnboardingLink(invite.token),
    emailSent: !!emailResult.sent
  };
}

export async function revokeInvite(inviteId, agencyId) {
  const invite = await SchoolOnboardingInvite.findById(inviteId);
  if (!invite || invite.agency_id !== agencyId) {
    throw Object.assign(new Error('Invite not found'), { status: 404 });
  }
  const updated = await SchoolOnboardingInvite.update(invite.id, { status: 'revoked' });
  return serializeInvite(updated, { admin: true });
}

function completedCount(progress) {
  return STEP_KEYS.filter((k) => progress?.[k] === 'complete').length;
}

function hasExplicitStepCompletion(body) {
  return !!String(body?.completedAt || '').trim();
}

function stampStepPayload(stepKey, body, markComplete) {
  const next = body && typeof body === 'object' ? { ...body } : {};
  if (markComplete && stepKey !== 'review_submit') {
    next.completedAt = new Date().toISOString();
  }
  return next;
}

function isStepEffectivelyComplete(stepKey, progress, payload) {
  if (progress?.[stepKey] !== 'complete') return false;
  const body = payload?.[stepKey];
  switch (stepKey) {
    case 'school_information': {
      if (!body || typeof body !== 'object' || !hasExplicitStepCompletion(body)) return false;
      const schoolName = String(body.schoolName || '').trim();
      const itscoEmail = String(body.itscoEmail || '').trim();
      return !!schoolName && !!itscoEmail && itscoEmail.includes('@');
    }
    case 'school_staff': {
      if (!body || typeof body !== 'object' || !hasExplicitStepCompletion(body)) return false;
      return true;
    }
    case 'preferred_days': {
      if (!body || typeof body !== 'object' || !hasExplicitStepCompletion(body)) return false;
      const preferredDays = Array.isArray(body.preferredDays) ? body.preferredDays : [];
      const notes = String(body.notes || '').trim();
      return preferredDays.length > 0 || !!notes;
    }
    case 'welcome_materials': {
      if (!body || typeof body !== 'object' || !hasExplicitStepCompletion(body)) return false;
      return body.requestPaperPackets === true || body.requestPaperPackets === false;
    }
    case 'explore_demo':
      return (
        hasExplicitStepCompletion(body) ||
        body?.completed === true ||
        body?.skipped === true
      );
    case 'review_submit':
      return progress?.review_submit === 'complete';
    default:
      return progress?.[stepKey] === 'complete';
  }
}

function effectiveStepProgress(invite) {
  const raw = invite?.step_progress || SchoolOnboardingInvite.defaultStepProgress();
  const payload = invite?.step_payload || {};
  const out = { ...raw };
  for (const stepKey of STEP_KEYS) {
    if (out[stepKey] === 'complete' && !isStepEffectivelyComplete(stepKey, raw, payload)) {
      out[stepKey] = payload?.[stepKey] ? 'in_progress' : 'not_started';
    }
  }
  return out;
}

async function reconcileStepProgress(invite) {
  if (!invite?.id) return invite;
  const raw = invite.step_progress || SchoolOnboardingInvite.defaultStepProgress();
  const effective = effectiveStepProgress(invite);
  const changed = STEP_KEYS.some((key) => raw[key] !== effective[key]);
  if (!changed) return invite;
  return SchoolOnboardingInvite.update(invite.id, { stepProgress: effective });
}

export function serializeInvite(invite, { admin = false, publicView = false } = {}) {
  if (!invite) return null;
  const progress = effectiveStepProgress(invite);
  const payload = invite.step_payload || {};
  const base = {
    id: invite.id,
    status: invite.status,
    source: invite.source || 'invite',
    schoolName: invite.school_name,
    schoolOrganizationId: invite.school_organization_id,
    schoolSlug: invite.school_slug || invite.school_portal_url,
    contactFirstName: invite.contact_first_name,
    contactLastName: invite.contact_last_name,
    contactEmail: invite.contact_email,
    stepProgress: progress,
    completedSteps: completedCount(progress),
    totalSteps: STEP_KEYS.length,
    expiresAt: invite.expires_at,
    submittedAt: invite.submitted_at,
    passwordSet: !!invite.password_set_at,
    createdAt: invite.created_at,
    lastViewedAt: invite.last_viewed_at
  };

  if (admin) {
    return {
      ...base,
      token: invite.token,
      link: buildOnboardingLink(invite.token),
      invitedByName: `${invite.invited_by_first_name || ''} ${invite.invited_by_last_name || ''}`.trim() || null,
      agencyId: invite.agency_id,
      materialsRequest: summarizeWelcomeMaterials(payload),
      stepPayload: {
        welcome_materials: payload?.welcome_materials || null
      }
    };
  }

  if (publicView) {
    const palette = parseFlags(invite.agency_color_palette);
    return {
      ...base,
      stepPayload: payload,
      username: invite.primary_user_username || invite.contact_email,
      invitedByName: `${invite.invited_by_first_name || ''} ${invite.invited_by_last_name || ''}`.trim() || null,
      agency: {
        id: invite.agency_id,
        name: invite.agency_name,
        slug: invite.agency_slug || invite.agency_portal_url,
        logoUrl: invite.agency_logo_url || invite.agency_logo_path || null,
        colorPalette: palette,
        ...(() => {
          const phoneInfo = resolveSchoolOnboardingSupportPhone(
            invite.agency_phone,
            invite.agency_phone_extension,
            invite.agency_slug,
            invite.agency_portal_url
          );
          return { phone: phoneInfo.display, supportPhoneTel: phoneInfo.tel };
        })(),
        supportEmail: resolveSchoolOnboardingSupportEmail(
          invite.agency_slug,
          invite.agency_portal_url,
          invite.agency_onboarding_team_email
        ),
        schoolGroupEmailDomain: resolveSchoolGroupEmailDomain(invite.agency_slug, invite.agency_portal_url)
      },
      staffTempPasswordExpiresHours: SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS,
      school: {
        id: invite.school_organization_id,
        name: invite.school_org_name || invite.school_name,
        slug: invite.school_slug || invite.school_portal_url
      }
    };
  }

  return base;
}

export async function getPublicInvite(token) {
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok && usable.code === 'not_found') {
    throw Object.assign(new Error(usable.message), { status: 404 });
  }
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'revoked' ? 403 : 410, code: usable.code });
  }
  await SchoolOnboardingInvite.touchViewed(invite.id);
  if (invite.status === 'invited') {
    await SchoolOnboardingInvite.update(invite.id, { status: 'in_progress' });
  }
  const fresh = await reconcileStepProgress(await SchoolOnboardingInvite.findByToken(token));
  const profile = await getSchoolProfile(fresh.school_organization_id);
  const serialized = serializeInvite(fresh, { publicView: true });
  serialized.schoolProfile = profile;
  serialized.submitted = !!usable.submitted;
  return serialized;
}

export async function setPassword(token, password, identity = {}) {
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'not_found' ? 404 : 410 });
  }
  if (usable.submitted) {
    throw Object.assign(new Error('Onboarding already submitted. Please log in.'), { status: 400 });
  }
  if (identity?.identityConfirmed !== true) {
    throw Object.assign(new Error('Please confirm your identity before setting your password'), { status: 400 });
  }
  const firstName = String(identity.contactFirstName || '').trim();
  const lastName = String(identity.contactLastName || '').trim();
  const email = String(identity.contactEmail || '').trim().toLowerCase();
  const schoolName = String(identity.schoolName || '').trim();
  if (!firstName || !lastName || !email || !schoolName) {
    throw Object.assign(new Error('Please confirm your name, email, and school before setting your password'), {
      status: 400
    });
  }
  if (email !== String(invite.contact_email || '').trim().toLowerCase()) {
    throw Object.assign(new Error('Email must match the address on this onboarding link'), { status: 400 });
  }
  if (invite.source === 'qr') {
    await SchoolOnboardingInvite.update(invite.id, {
      contactFirstName: firstName,
      contactLastName: lastName,
      schoolName
    });
    if (schoolName !== invite.school_name) {
      await pool.execute(`UPDATE agencies SET name = ? WHERE id = ?`, [schoolName, invite.school_organization_id]);
    }
    try {
      await User.update(invite.primary_user_id, { firstName, lastName });
    } catch {
      // ignore
    }
  } else {
    const inviteFirst = String(invite.contact_first_name || '').trim().toLowerCase();
    const inviteLast = String(invite.contact_last_name || '').trim().toLowerCase();
    if (firstName.toLowerCase() !== inviteFirst || lastName.toLowerCase() !== inviteLast) {
      throw Object.assign(new Error('Name does not match this invitation'), { status: 400 });
    }
    const inviteSchool = String(invite.school_name || '').trim().toLowerCase();
    if (schoolName.toLowerCase() !== inviteSchool) {
      throw Object.assign(new Error('School name does not match this invitation'), { status: 400 });
    }
  }
  if (!password || password.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }
  const user = await User.findById(invite.primary_user_id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  if (user.password_hash) {
    throw Object.assign(new Error('Password already set'), { status: 400 });
  }
  const username = user.username || user.email || invite.contact_email;
  const pwCheck = await validatePasswordStrength(password, { accountId: username });
  if (!pwCheck.valid) {
    throw Object.assign(new Error(pwCheck.message), { status: 400 });
  }
  await User.changePassword(user.id, password);
  // Keep PENDING_SETUP / in-progress until final submit; do not jump to PREHIRE.
  await SchoolOnboardingInvite.update(invite.id, {
    passwordSetAt: new Date(),
    status: 'in_progress'
  });
  const updatedUser = await User.findById(user.id);
  const agencies = await User.getAgencies(user.id);
  return {
    ok: true,
    username,
    user: updatedUser,
    agencies
  };
}

export async function saveStep(token, stepKey, payload = {}, markComplete = true) {
  if (!STEP_KEYS.includes(stepKey)) {
    throw Object.assign(new Error('Invalid step'), { status: 400 });
  }
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'not_found' ? 404 : 410 });
  }
  if (usable.submitted) {
    throw Object.assign(new Error('Onboarding already submitted'), { status: 400 });
  }

  const progress = { ...(invite.step_progress || SchoolOnboardingInvite.defaultStepProgress()) };
  const stepPayload = { ...(invite.step_payload || {}) };
  const body = payload && typeof payload === 'object' ? payload : {};

  if (stepKey === 'school_information') {
    const schoolName = String(body.schoolName || (markComplete ? invite.school_name : '')).trim();
    const itscoEmail = String(body.itscoEmail || '').trim().toLowerCase();
    if (markComplete && !schoolName) {
      throw Object.assign(new Error('School name is required before continuing'), { status: 400 });
    }
    if (markComplete && !itscoEmail) {
      throw Object.assign(new Error('Preferred school group email is required before continuing'), {
        status: 400
      });
    }
    if (itscoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(itscoEmail)) {
      throw Object.assign(new Error('Please enter a valid school group email'), { status: 400 });
    }
    if (schoolName && schoolName !== invite.school_name) {
      await pool.execute(`UPDATE agencies SET name = ? WHERE id = ?`, [schoolName, invite.school_organization_id]);
      await SchoolOnboardingInvite.update(invite.id, { schoolName });
    }
    const contactName = String(body.primaryContactName || '').trim();
    const contactEmail = String(body.primaryContactEmail || '').trim();
    await upsertSchoolProfile(invite.school_organization_id, {
      districtName: body.districtName || null,
      schoolNumber: body.schoolNumber || null,
      itscoEmail: itscoEmail || null,
      schoolAddress: body.schoolAddress || null,
      academicYear: body.academicYear || null,
      gradeLevels: body.gradeLevels || null,
      primaryContactName: markComplete
        ? contactName || `${invite.contact_first_name} ${invite.contact_last_name}`
        : contactName || null,
      primaryContactEmail: markComplete ? contactEmail || invite.contact_email : contactEmail || null,
      primaryContactRole: body.primaryContactRole || 'Primary Contact',
      secondaryContactText: body.secondaryContactText || null,
      schoolDaysTimes: body.schoolDaysTimes || null
    });
    const filledBody = Object.fromEntries(
      Object.entries({ ...body, ...(itscoEmail ? { itscoEmail } : {}) }).filter(
        ([, value]) => String(value ?? '').trim() !== ''
      )
    );
    const mergedBody = markComplete
      ? filledBody
      : { ...(stepPayload.school_information || {}), ...filledBody };
    if (!markComplete && mergedBody.completedAt) delete mergedBody.completedAt;
    stepPayload.school_information = stampStepPayload('school_information', mergedBody, markComplete);
  } else if (stepKey === 'school_staff') {
    const staff = Array.isArray(body.staff) ? body.staff : [];
    const sharedTempPassword = String(body.sharedTempPassword || body.temporaryPassword || '').trim();
    if (staff.length && (!sharedTempPassword || sharedTempPassword.length < 6)) {
      throw Object.assign(
        new Error('A shared temporary password (at least 6 characters) is required for school staff accounts'),
        { status: 400 }
      );
    }
    if (sharedTempPassword) {
      const pwCheck = await validatePasswordStrength(sharedTempPassword, { accountId: 'school-staff' });
      if (!pwCheck.valid) {
        throw Object.assign(new Error(pwCheck.message || 'Temporary password is not strong enough'), { status: 400 });
      }
    }

    const created = [];
    for (const row of staff) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      const isPrimary = email === String(invite.contact_email).toLowerCase();
      const { firstName, lastName } = parseName(row.fullName || row.name);
      const flags = parseAccessRole(row.accessRole || row.role || 'standard');
      let user = await User.findByEmail(email);
      if (!user) {
        user = await User.create({
          email,
          passwordHash: null,
          firstName,
          lastName,
          role: 'school_staff',
          status: isPrimary ? (invite.primary_user_status || 'PENDING_SETUP') : 'PENDING_SETUP',
          personalEmail: email
        });
      } else if (String(user.role || '').toLowerCase() !== 'school_staff' && !isPrimary) {
        throw Object.assign(
          new Error(`A user already exists with email ${email} (role: ${user.role}). Cannot add as school staff.`),
          { status: 409 }
        );
      }
      try {
        await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [email, email, user.id]);
      } catch {
        // ignore
      }
      try {
        await User.setWorkEmail?.(user.id, email);
      } catch {
        // ignore
      }
      await User.assignToAgency(user.id, invite.school_organization_id);

      // Shared temp password for every staff account (including re-saves)
      if (sharedTempPassword && !isPrimary) {
        await User.setTemporaryPassword(user.id, sharedTempPassword, SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS);
      }

      await upsertSchoolContactRoleFlags({
        orgId: invite.school_organization_id,
        email,
        fullName: `${user.first_name || firstName} ${user.last_name || lastName}`.trim(),
        isSchoolAdmin: isPrimary ? true : flags.isSchoolAdmin,
        isScheduler: flags.isScheduler,
        isPrimary
      });

      created.push({
        userId: user.id,
        email,
        fullName: `${user.first_name || firstName} ${user.last_name || lastName}`.trim(),
        accessRole: row.accessRole || (flags.isSchoolAdmin && flags.isScheduler
          ? 'school_admin_scheduler'
          : flags.isSchoolAdmin
            ? 'school_admin'
            : flags.isScheduler
              ? 'scheduler'
              : 'standard'),
        isSchoolAdmin: isPrimary ? true : flags.isSchoolAdmin,
        isScheduler: isPrimary ? false : flags.isScheduler,
        roiEligible: isPrimary ? true : !flags.isScheduler
      });
    }

    // Ensure primary remains School Admin + ROI-eligible unless explicitly also listed as scheduler
    await upsertSchoolContactRoleFlags({
      orgId: invite.school_organization_id,
      email: invite.contact_email,
      fullName: `${invite.contact_first_name} ${invite.contact_last_name}`,
      isSchoolAdmin: true,
      isScheduler: false,
      isPrimary: true
    });

    const staffExpiresAt = sharedTempPassword
      ? new Date(Date.now() + SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
      : null;
    stepPayload.school_staff = stampStepPayload(
      'school_staff',
      {
        staff: created,
        sharedTempPasswordSet: !!sharedTempPassword,
        sharedTempPasswordExpiresAt: staffExpiresAt,
        sharedTempPasswordExpiresHours: SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS
      },
      markComplete
    );
  } else if (stepKey === 'preferred_days') {
    const preferredDays = Array.isArray(body.preferredDays) ? body.preferredDays : [];
    const notes = String(body.notes || '').trim();
    if (markComplete && preferredDays.length === 0 && !notes) {
      throw Object.assign(
        new Error('Select at least one preferred day or add scheduling notes before continuing'),
        { status: 400 }
      );
    }
    const daysLabel = preferredDays.length ? preferredDays.join(', ') : null;
    await upsertSchoolProfile(invite.school_organization_id, {
      schoolDaysTimes: [daysLabel, notes].filter(Boolean).join('\n') || null
    });
    stepPayload.preferred_days = stampStepPayload(
      'preferred_days',
      { preferredDays, notes },
      markComplete
    );
  } else if (stepKey === 'welcome_materials') {
    const materials = Array.isArray(body.materials)
      ? [...new Set(body.materials.map((m) => String(m || '').trim()).filter((m) => WELCOME_MATERIAL_KEYS.has(m)))]
      : [];
    const materialsOther = String(body.materialsOther || '').trim().slice(0, 500);
    const requestPaperPackets =
      body.requestPaperPackets === true ? true : body.requestPaperPackets === false ? false : null;
    if (markComplete && requestPaperPackets == null) {
      throw Object.assign(
        new Error('Please tell us whether you want paper referral packets printed'),
        { status: 400 }
      );
    }
    stepPayload.welcome_materials = stampStepPayload(
      'welcome_materials',
      {
        welcomePackageAcknowledged: true,
        materials,
        materialsOther: materials.includes('other') ? materialsOther : '',
        requestPaperPackets
      },
      markComplete
    );
  } else if (stepKey === 'explore_demo') {
    stepPayload.explore_demo = stampStepPayload(
      'explore_demo',
      { viewedAt: new Date().toISOString(), ...(body || {}) },
      markComplete
    );
  } else if (stepKey === 'review_submit') {
    // handled by submitOnboarding
    stepPayload.review_submit = body;
  }

  if (markComplete && stepKey !== 'review_submit') {
    progress[stepKey] = 'complete';
  } else if (!markComplete && progress[stepKey] !== 'complete') {
    progress[stepKey] = 'in_progress';
  }

  const updated = await SchoolOnboardingInvite.update(invite.id, {
    stepProgress: progress,
    stepPayload,
    status: 'in_progress'
  });
  const reconciled = await reconcileStepProgress(updated);
  return serializeInvite(reconciled, { publicView: true });
}

export async function resolveDemoSchool(token) {
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'not_found' ? 404 : 410 });
  }
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type
     FROM agencies
     WHERE slug = 'hogwarts' AND organization_type = 'school'
     LIMIT 1`
  );
  const hogwarts = rows?.[0];
  if (!hogwarts) {
    throw Object.assign(new Error('Demo school (Hogwarts) is not available in this environment'), { status: 404 });
  }

  return {
    id: hogwarts.id,
    name: hogwarts.name || 'Hogwarts',
    slug: hogwarts.portal_url || hogwarts.slug || 'hogwarts',
    viewOnly: true,
    publicShell: true
  };
}

function demoDisplayName(firstName, lastName, fallback = 'Demo User') {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  const name = `${first} ${last}`.trim();
  return name || fallback;
}

function demoInitials(firstName, lastName) {
  const f = String(firstName || '').trim().charAt(0);
  const l = String(lastName || '').trim().charAt(0);
  const out = `${f}${l}`.toUpperCase();
  return out || 'DU';
}

/**
 * Public, sanitized Hogwarts snapshot for school-onboarding demo shell.
 * No auth/permissions required beyond a valid invite token.
 * Returns display copies only (no emails, phones, or real account handles).
 */
export async function getDemoSnapshot(token) {
  const demo = await resolveDemoSchool(token);
  const schoolId = demo.id;
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const [providerRows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
     FROM provider_school_assignments psa
     INNER JOIN users u ON u.id = psa.provider_user_id
     WHERE psa.school_organization_id = ?
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT 40`,
    [schoolId]
  );

  const [dayRows] = await pool.execute(
    `SELECT weekday, provider_user_id
     FROM school_day_provider_assignments
     WHERE school_organization_id = ?
       AND is_active = 1
       AND weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
    [schoolId]
  );

  const [clientRows] = await pool.execute(
    `SELECT initials, identifier_code, status
     FROM clients
     WHERE organization_id = ?
     ORDER BY initials ASC
     LIMIT 60`,
    [schoolId]
  );

  let staffRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT u.first_name, u.last_name
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) = 'school_staff'
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT 40`,
      [schoolId]
    );
    staffRows = rows || [];
  } catch {
    staffRows = [];
  }

  const providerById = new Map();
  const providers = (providerRows || []).map((r, idx) => {
    const item = {
      demoId: `provider-${idx + 1}`,
      displayName: demoDisplayName(r.first_name, r.last_name, `Provider ${idx + 1}`),
      initials: demoInitials(r.first_name, r.last_name),
      roleLabel: String(r.role || 'provider').replace(/_/g, ' ')
    };
    providerById.set(Number(r.id), item);
    return item;
  });

  const days = weekdays.map((weekday) => {
    const ids = (dayRows || [])
      .filter((d) => String(d.weekday) === weekday)
      .map((d) => Number(d.provider_user_id));
    const dayProviders = ids
      .map((id) => providerById.get(id))
      .filter(Boolean);
    return {
      weekday,
      providerCount: dayProviders.length,
      providers: dayProviders
    };
  });

  const clients = (clientRows || []).map((r, idx) => ({
    demoId: `client-${idx + 1}`,
    initials: String(r.initials || '').trim().toUpperCase() || 'XXXXXX',
    code: String(r.identifier_code || '').trim() || null,
    status: String(r.status || 'ACTIVE').toUpperCase()
  }));

  const staff = (staffRows || []).map((r, idx) => ({
    demoId: `staff-${idx + 1}`,
    displayName: demoDisplayName(r.first_name, r.last_name, `Staff ${idx + 1}`),
    initials: demoInitials(r.first_name, r.last_name),
    badges: idx === 0 ? ['School Admin'] : []
  }));

  return {
    school: {
      name: demo.name,
      slug: demo.slug,
      tagline: 'Demo school portal — browse freely. Nothing here is live.'
    },
    stats: {
      providers: providers.length,
      clients: clients.length,
      staff: staff.length,
      activeDays: days.filter((d) => d.providerCount > 0).length
    },
    providers,
    days,
    clients,
    staff,
    viewOnly: true
  };
}

export async function submitOnboarding(token) {
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'not_found' ? 404 : 410 });
  }
  if (usable.submitted) {
    const schoolSlug = invite.school_slug || invite.school_portal_url;
    const agencySlug = invite.agency_slug || invite.agency_portal_url;
    const serialized = serializeInvite(invite, { publicView: true });
    if (serialized) serialized.submitted = true;
    return {
      alreadySubmitted: true,
      loginPath: buildSchoolLoginPath(agencySlug, schoolSlug),
      invite: serialized
    };
  }

  if (!invite.password_set_at) {
    throw Object.assign(new Error('Please create your login password before submitting'), { status: 400 });
  }

  const progress = effectiveStepProgress(invite);
  const missing = REQUIRED_BEFORE_SUBMIT.filter((k) => progress[k] !== 'complete');
  if (missing.length) {
    throw Object.assign(new Error(`Please complete: ${missing.join(', ').replace(/_/g, ' ')}`), { status: 400 });
  }

  progress.review_submit = 'complete';
  await SchoolOnboardingInvite.update(invite.id, {
    stepProgress: progress,
    status: 'submitted',
    submittedAt: new Date()
  });

  await setSchoolDraftFlag(invite.school_organization_id, false);
  await User.updateStatus(invite.primary_user_id, 'ACTIVE_EMPLOYEE', invite.primary_user_id);
  try {
    await User.update(invite.primary_user_id, { isActive: true });
  } catch {
    // ignore
  }

  // Activate other school staff created during onboarding (they log in with shared temp password)
  try {
    const staffPayload = invite.step_payload?.school_staff?.staff || [];
    for (const row of staffPayload) {
      const uid = Number(row?.userId || 0);
      if (!uid || uid === invite.primary_user_id) continue;
      try {
        await User.updateStatus(uid, 'ACTIVE_EMPLOYEE', invite.primary_user_id);
        await User.update(uid, { isActive: true });
      } catch {
        // ignore per-user failures
      }
    }
  } catch {
    // ignore
  }

  // Remove temporary Hogwarts demo assignment if present
  try {
    const [hRows] = await pool.execute(
      `SELECT id FROM agencies WHERE slug = 'hogwarts' AND organization_type = 'school' LIMIT 1`
    );
    const hogwartsId = hRows?.[0]?.id;
    if (hogwartsId && hogwartsId !== invite.school_organization_id) {
      await pool.execute(
        `DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?`,
        [invite.primary_user_id, hogwartsId]
      );
    }
  } catch {
    // ignore
  }

  const fresh = await SchoolOnboardingInvite.findById(invite.id);
  await notifySchoolPortalOnboardingCompleted(fresh);
  const schoolSlug = fresh.school_slug || fresh.school_portal_url;
  const agencySlug = fresh.agency_slug || fresh.agency_portal_url;
  const serialized = serializeInvite(fresh, { publicView: true });
  if (serialized) serialized.submitted = true;
  return {
    alreadySubmitted: false,
    loginPath: buildSchoolLoginPath(agencySlug, schoolSlug),
    invite: serialized
  };
}

function parseFlagsSafe(raw) {
  return parseFlags(raw);
}

export async function getOrCreateQrLink(agencyId, createdByUserId = null) {
  const agency = await Agency.findById(agencyId);
  if (!agency) throw Object.assign(new Error('Agency not found'), { status: 404 });
  const link = await SchoolOnboardingQrLink.ensureActive({
    agencyId,
    createdByUserId,
    label: `${agency.name || 'Agency'} school onboarding QR`
  });
  return {
    id: link.id,
    token: link.token,
    label: link.label,
    isActive: !!link.is_active,
    url: buildQrStartLink(link.token),
    createdAt: link.created_at
  };
}

export async function rotateQrLink(agencyId, createdByUserId = null) {
  const agency = await Agency.findById(agencyId);
  if (!agency) throw Object.assign(new Error('Agency not found'), { status: 404 });
  const link = await SchoolOnboardingQrLink.rotate({
    agencyId,
    createdByUserId,
    label: `${agency.name || 'Agency'} school onboarding QR`
  });
  return {
    id: link.id,
    token: link.token,
    label: link.label,
    isActive: !!link.is_active,
    url: buildQrStartLink(link.token),
    createdAt: link.created_at
  };
}

export async function revokeQrLink(agencyId) {
  await SchoolOnboardingQrLink.revoke(agencyId);
  return { revoked: true };
}

export async function getPublicQrLink(token) {
  const link = await SchoolOnboardingQrLink.findByToken(token);
  if (!link || !link.is_active) {
    throw Object.assign(new Error('This QR onboarding link is not active'), { status: 410 });
  }
  const palette = parseFlagsSafe(link.agency_color_palette);
  return {
    token: link.token,
    label: link.label,
    agency: {
      id: link.agency_id,
      name: link.agency_name,
      slug: link.agency_slug || link.agency_portal_url,
      logoUrl: link.agency_logo_url || link.agency_logo_path || null,
      colorPalette: palette,
      ...(() => {
        const phoneInfo = resolveSchoolOnboardingSupportPhone(
          link.agency_phone,
          link.agency_phone_extension,
          link.agency_slug,
          link.agency_portal_url
        );
        return { phone: phoneInfo.display, supportPhoneTel: phoneInfo.tel };
      })(),
      supportEmail: resolveSchoolOnboardingSupportEmail(
        link.agency_slug,
        link.agency_portal_url,
        link.agency_onboarding_team_email
      )
    }
  };
}

export async function startFromQr(token, body = {}) {
  const link = await SchoolOnboardingQrLink.findByToken(token);
  if (!link || !link.is_active) {
    throw Object.assign(new Error('This QR onboarding link is not active'), { status: 410 });
  }

  const result = await createInvite({
    agencyId: link.agency_id,
    contactFirstName: body.contactFirstName,
    contactLastName: body.contactLastName,
    contactEmail: body.contactEmail,
    schoolName: body.schoolName,
    invitedByUserId: null,
    sendEmail: false,
    source: 'qr',
    qrLinkId: link.id
  });

  return {
    inviteToken: result.invite.token,
    link: buildOnboardingLink(result.invite.token),
    school: result.school
  };
}

export { STEP_KEYS };
