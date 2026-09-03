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
import { validatePasswordStrength, checkPasswordBasics } from '../utils/passwordValidation.js';
import { ensureDigitalIntakeFormsForSchool } from './schoolOnboardingIntakeBootstrap.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { normalizeGroupSubscription } from './schoolGroupSubscription.service.js';

const AGENCY_HELPER_ROLES = new Set([
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant'
]);

function isAgencyHelperActor(invite, actor) {
  if (!actor?.userId) return false;
  if (invite?.primary_user_id && Number(actor.userId) === Number(invite.primary_user_id)) return false;
  const role = String(actor.role || '').trim().toLowerCase();
  if (!AGENCY_HELPER_ROLES.has(role)) return false;
  // School staff completing their own invite are not helpers
  if (role === 'school_staff') return false;
  const contactEmail = String(invite?.contact_email || invite?.contactEmail || '')
    .trim()
    .toLowerCase();
  const actorEmail = String(actor.email || '').trim().toLowerCase();
  if (contactEmail && actorEmail && contactEmail === actorEmail) return false;
  return true;
}

function applyAssistanceStamp(stepBody, actor, { draft = true } = {}) {
  if (!actor?.userId) return stepBody;
  const stamp = {
    userId: Number(actor.userId),
    name: String(actor.name || '').trim() || 'Agency staff',
    email: String(actor.email || '').trim().toLowerCase() || null,
    role: String(actor.role || '').trim().toLowerCase() || null,
    at: new Date().toISOString(),
    action: draft ? 'saved_draft' : 'completed'
  };
  const history = Array.isArray(stepBody?.assistedByHistory) ? [...stepBody.assistedByHistory] : [];
  history.push(stamp);
  return {
    ...stepBody,
    assistedBy: stamp,
    assistedByHistory: history.slice(-25)
  };
}

function buildSchoolPortalUrls(invite) {
  const schoolSlug = String(invite?.school_slug || invite?.school_portal_url || '').trim().toLowerCase();
  const agencySlug = String(invite?.agency_slug || invite?.agency_portal_url || '').trim().toLowerCase();
  const schoolAgency = {
    slug: schoolSlug,
    portal_url: schoolSlug,
    organization_type: 'school',
    parent_slug: agencySlug || null,
    parent_portal_url: agencySlug || null,
    affiliated_agency_slug: agencySlug || null
  };
  const portalUrl = schoolSlug ? buildPublicAppUrl(schoolAgency, '') : null;
  const loginUrl = schoolSlug ? buildPublicAppUrl(schoolAgency, 'login') : null;
  const portalDashboardUrl = schoolSlug ? buildPublicAppUrl(schoolAgency, 'dashboard') : null;
  return {
    portalUrl,
    loginUrl,
    portalDashboardUrl,
    loginPath: buildSchoolLoginPath(agencySlug, schoolSlug),
    portalDashboardPath: schoolSlug ? `/${schoolSlug}/dashboard` : '/dashboard'
  };
}

/**
 * Lightweight onboarding phase for school portal splash gating.
 * Incomplete = latest invite exists and is not submitted/revoked.
 */
export async function getSchoolOnboardingPhase(schoolOrganizationId) {
  const invite = await SchoolOnboardingInvite.findLatestForSchoolOrganization(schoolOrganizationId);
  if (!invite) {
    return {
      hasInvite: false,
      inProgress: false,
      completed: false,
      inviteId: null,
      inviteToken: null,
      onboardingLink: null,
      status: null,
      schoolName: null,
      completedSteps: 0,
      totalSteps: STEP_KEYS.length
    };
  }
  const progress = effectiveStepProgress(invite);
  const status = String(invite.status || '').toLowerCase();
  const completed = status === 'submitted';
  const inProgress = !completed && status !== 'revoked';
  return {
    hasInvite: true,
    inProgress,
    completed,
    inviteId: invite.id,
    inviteToken: inProgress ? invite.token : null,
    onboardingLink: inProgress ? buildOnboardingLink(invite.token) : null,
    status,
    schoolName: invite.school_name || invite.school_org_name || null,
    completedSteps: completedCount(progress),
    totalSteps: STEP_KEYS.length
  };
}

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

async function upsertSchoolContactRoleFlags({
  orgId,
  email,
  fullName = null,
  roleTitle = null,
  isSchoolAdmin,
  isScheduler,
  isPrimary = false,
  groupEmailSubscription = undefined
}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return;
  const title =
    roleTitle != null && String(roleTitle).trim() !== ''
      ? String(roleTitle).trim().slice(0, 255)
      : null;
  const subscription = groupEmailSubscription !== undefined
    ? normalizeGroupSubscription(groupEmailSubscription)
    : undefined;
  try {
    const [existingRows] = await pool.execute(
      `SELECT id FROM school_contacts
       WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [orgId, normalized]
    );
    if (existingRows?.length) {
      if (subscription !== undefined) {
        await pool.execute(
          `UPDATE school_contacts
           SET full_name = COALESCE(?, full_name),
               role_title = COALESCE(?, role_title),
               is_school_admin = ?,
               is_scheduler = ?,
               is_primary = IF(?, 1, is_primary),
               email_delivery_preference = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            fullName || null,
            title,
            isSchoolAdmin ? 1 : 0,
            isScheduler ? 1 : 0,
            isPrimary ? 1 : 0,
            subscription,
            existingRows[0].id
          ]
        );
      } else {
        await pool.execute(
          `UPDATE school_contacts
           SET full_name = COALESCE(?, full_name),
               role_title = COALESCE(?, role_title),
               is_school_admin = ?,
               is_scheduler = ?,
               is_primary = IF(?, 1, is_primary),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            fullName || null,
            title,
            isSchoolAdmin ? 1 : 0,
            isScheduler ? 1 : 0,
            isPrimary ? 1 : 0,
            existingRows[0].id
          ]
        );
      }
    } else {
      await pool.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, is_primary, is_school_admin, is_scheduler, email_delivery_preference)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          orgId,
          fullName || null,
          normalized,
          title,
          isPrimary ? 1 : 0,
          isSchoolAdmin ? 1 : 0,
          isScheduler ? 1 : 0,
          subscription !== undefined ? subscription : 'all_mail'
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

async function ensureSchoolDigitalIntakeForms(invite, { createdByUserId = null } = {}) {
  if (!invite?.school_organization_id || !invite?.agency_id) return null;
  try {
    return await ensureDigitalIntakeFormsForSchool({
      agencyId: invite.agency_id,
      schoolOrganizationId: invite.school_organization_id,
      schoolName: invite.school_name || invite.school_org_name,
      createdByUserId,
      onlyIfMissing: true,
      reuseSourcePublicKey: true
    });
  } catch (e) {
    console.warn('[schoolOnboarding] intake ensure failed:', e?.message || e);
    return { errors: [e?.message || 'intake ensure failed'] };
  }
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
  const configured = String(fallback || '').trim();
  if (configured) return configured;
  const base = String(slug || portalUrl || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (base === 'itsco') return 'support@itsco.health';
  return null;
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

/**
 * Link outreach directory school → onboarding org, mark partnered, copy address when present.
 * Does NOT mark onboarding steps complete — profile seeding only.
 */
export async function syncOutreachPartnerFromOnboarding(invite, { outreachSchoolId = null } = {}) {
  if (!invite?.agency_id || !invite?.school_organization_id) return null;
  const agencyId = Number(invite.agency_id);
  const schoolOrgId = Number(invite.school_organization_id);
  let oid = Number(outreachSchoolId || invite.outreach_school_id || 0) || null;

  if (!oid) {
    try {
      const [rows] = await pool.execute(
        `SELECT id FROM outreach_schools
         WHERE agency_id = ?
           AND LOWER(TRIM(name)) = LOWER(TRIM(?))
         LIMIT 1`,
        [agencyId, invite.school_name]
      );
      oid = rows?.[0]?.id || null;
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      return null;
    }
  }
  if (!oid) return null;

  let outreach = null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, address, district_name, city, region
       FROM outreach_schools WHERE id = ? AND agency_id = ? LIMIT 1`,
      [oid, agencyId]
    );
    outreach = rows?.[0] || null;
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    return null;
  }
  if (!outreach) return null;

  try {
    await pool.execute(
      `UPDATE outreach_schools
       SET linked_organization_id = ?,
           outreach_stage = 'partnered'
       WHERE id = ? AND agency_id = ?`,
      [schoolOrgId, oid, agencyId]
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  if (String(outreach.address || '').trim()) {
    await upsertSchoolProfile(schoolOrgId, {
      schoolAddress: outreach.address,
      districtName: outreach.district_name || null
    });
  }

  if (!invite.outreach_school_id) {
    try {
      await SchoolOnboardingInvite.update(invite.id, { outreachSchoolId: oid });
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
  }

  return { outreachSchoolId: oid, partnered: true, addressCopied: !!String(outreach.address || '').trim() };
}

async function provisionSchoolGroupForInvite(invite, { groupEmail, schoolName, staffEmails = null } = {}) {
  const email = String(groupEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  try {
    const { provisionSchoolGoogleGroup } = await import('./schoolGroupProvisioning.service.js');
    return await provisionSchoolGoogleGroup({
      agencyId: invite.agency_id,
      schoolOrganizationId: invite.school_organization_id,
      groupEmail: email,
      schoolName: schoolName || invite.school_name,
      contactFirstName: invite.contact_first_name,
      contactLastName: invite.contact_last_name,
      contactEmail: invite.contact_email,
      staffEmails
    });
  } catch (e) {
    console.warn('[schoolOnboarding] google group provision failed:', e?.message || e);
    return { ok: false, reason: e?.message || 'failed' };
  }
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
    if (invite?.id) {
      await SchoolOnboardingInvite.update(invite.id, { inviteEmailSentAt: new Date() });
    }
    return { sent: true, link };
  } catch (e) {
    console.error('[schoolOnboarding] email send failed:', e);
    return { sent: false, reason: e?.message || 'send_failed', link };
  }
}

async function listSchoolMembershipsForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.slug, a.organization_type
       FROM user_agencies ua
       JOIN agencies a ON a.id = ua.agency_id
       WHERE ua.user_id = ?
         AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'program', 'learning')
       ORDER BY a.name ASC`,
      [uid]
    );
    return (rows || []).map((r) => ({
      id: Number(r.id),
      name: r.name || null,
      slug: r.slug || null
    }));
  } catch {
    return [];
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
  qrLinkId = null,
  priorSchoolDecision = null,
  resetPassword = false,
  confirmExistingSchoolStaff = false
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
  let reusedExistingUser = false;
  let temporaryPassword = null;
  let temporaryPasswordExpiresAt = null;

  if (existingUser?.id) {
    const role = String(existingUser.role || '').toLowerCase();
    if (role !== 'school_staff') {
      throw Object.assign(
        new Error(`A user with this email already exists (role: ${existingUser.role}).`),
        { status: 409, code: 'EMAIL_EXISTS_OTHER_ROLE' }
      );
    }
    const currentSchools = await listSchoolMembershipsForUser(existingUser.id);
    const decision = String(priorSchoolDecision || '').trim().toLowerCase();
    if (
      !confirmExistingSchoolStaff ||
      !['stay_at_both', 'leave_prior'].includes(decision)
    ) {
      throw Object.assign(
        new Error(
          'This email is already a school staff account. Confirm whether you are only at the new school or at both, and optionally reset your password.'
        ),
        {
          status: 409,
          code: 'SCHOOL_STAFF_ALREADY_AFFILIATED',
          details: {
            userId: existingUser.id,
            currentSchools,
            allowedDecisions: ['stay_at_both', 'leave_prior']
          }
        }
      );
    }
    reusedExistingUser = true;
  }

  const slug = await uniqueSchoolSlug(slugify(name));
  let schoolId = null;
  let user = null;
  let createdNewUser = false;
  try {
    // Nested school under the inviting tenant — never a standalone agency tenant.
    // is_active stays false until submit; slug lookup still resolves school/program/learning drafts.
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

    if (reusedExistingUser) {
      user = await User.findById(existingUser.id);
      // Optionally leave prior school memberships before joining the new school.
      if (String(priorSchoolDecision || '').toLowerCase() === 'leave_prior') {
        const priorSchools = await listSchoolMembershipsForUser(user.id);
        let ClientSchoolStaffRoiAccess = null;
        try {
          ClientSchoolStaffRoiAccess = (await import('../models/ClientSchoolStaffRoiAccess.model.js')).default;
        } catch {
          ClientSchoolStaffRoiAccess = null;
        }
        for (const school of priorSchools) {
          try {
            if (ClientSchoolStaffRoiAccess) {
              await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
                schoolStaffUserId: user.id,
                schoolOrganizationId: school.id,
                actorUserId: invitedByUserId || null
              });
            }
          } catch {
            // best-effort
          }
          try {
            await User.removeFromAgency(user.id, school.id);
          } catch {
            // best-effort
          }
        }
      }

      await User.assignToAgency(user.id, schoolId);
      try {
        await User.assignToAgency(user.id, agencyId);
      } catch {
        // ignore
      }

      if (resetPassword === true) {
        temporaryPassword = await User.generateTemporaryPassword();
        const pwResult = await User.setTemporaryPassword(user.id, temporaryPassword, 24 * 7);
        temporaryPasswordExpiresAt = pwResult?.expiresAt || null;
        try {
          await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE', invitedByUserId || null);
        } catch {
          // ignore
        }
      }
    } else {
      user = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        role: 'school_staff',
        status: 'PENDING_SETUP',
        personalEmail: email
      });
      createdNewUser = true;
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

    // Returning school_staff who already have credentials (or just received a reset)
    // should not be forced through a brand-new password step.
    let passwordAlreadyUsable = false;
    if (reusedExistingUser) {
      const refreshed = await User.findById(user.id);
      passwordAlreadyUsable = !!(refreshed?.password_hash || temporaryPassword);
    }

    let invite = await SchoolOnboardingInvite.create({
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
    if (passwordAlreadyUsable && invite?.id) {
      invite = await SchoolOnboardingInvite.update(invite.id, { passwordSetAt: new Date() });
    }

    try {
      await syncOutreachPartnerFromOnboarding(invite);
      invite = (await SchoolOnboardingInvite.findById(invite.id)) || invite;
    } catch (e) {
      console.warn('[schoolOnboarding] outreach partner sync on create failed:', e?.message || e);
    }

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
      intakeBootstrap = await ensureDigitalIntakeFormsForSchool({
        agencyId,
        schoolOrganizationId: schoolId,
        schoolName: name,
        createdByUserId: invitedByUserId || null,
        onlyIfMissing: false,
        reuseSourcePublicKey: true
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
      intakeBootstrap,
      reusedExistingUser,
      temporaryPassword: temporaryPassword || undefined,
      temporaryPasswordExpiresAt: temporaryPasswordExpiresAt || undefined
    };
  } catch (err) {
    // Best-effort cleanup if draft school/user was partially created.
    // Never delete a pre-existing school_staff user we reused.
    try {
      if (createdNewUser && user?.id) await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
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
  const intakeBootstrap = await ensureSchoolDigitalIntakeForms(updated, {
    createdByUserId: invitedByUserId || null
  });
  const fresh = await SchoolOnboardingInvite.findById(updated.id);
  return {
    invite: serializeInvite(fresh, { admin: true }),
    link: buildOnboardingLink(updated.token),
    emailSent: !!emailResult.sent,
    intakeBootstrap
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
  const intakeBootstrap = await ensureSchoolDigitalIntakeForms(invite, {
    createdByUserId: invitedByUserId || null
  });
  const fresh = await SchoolOnboardingInvite.findById(invite.id);
  return {
    invite: serializeInvite(fresh, { admin: true }),
    link: buildOnboardingLink(invite.token),
    emailSent: !!emailResult.sent,
    intakeBootstrap
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

const INVITE_STEP_LABELS = {
  school_information: 'School information',
  school_staff: 'School staff',
  preferred_days: 'Preferred days',
  welcome_materials: 'Welcome materials',
  explore_demo: 'Explore demo',
  review_submit: 'Review & submit'
};

function recipientHasSavedProgress(progress, payload) {
  if (completedCount(progress) > 0) return true;
  return STEP_KEYS.some((key) => progress?.[key] === 'in_progress' && payload?.[key]);
}

function hasRecipientStartedOnboarding(invite, progress) {
  if (invite?.recipient_started_at) return true;
  if (invite?.password_set_at) return true;
  if (invite?.submitted_at) return true;
  return completedCount(progress) > 0;
}

function resolveInviteDisplayStatus(invite, progress) {
  const raw = String(invite?.status || '').toLowerCase();
  if (raw === 'submitted') return { key: 'submitted', label: 'Submitted' };
  if (raw === 'revoked') return { key: 'revoked', label: 'Revoked' };
  if (raw === 'expired') return { key: 'expired', label: 'Expired' };
  if (hasRecipientStartedOnboarding(invite, progress)) {
    return { key: 'in_progress', label: 'In progress' };
  }
  if (invite?.invite_email_sent_at) {
    return { key: 'sent', label: 'Sent' };
  }
  return { key: 'created', label: 'Created' };
}

function buildInviteActivity(invite, progress, payload) {
  const events = [];
  const add = (at, label, detail = null) => {
    if (!at) return;
    const when = new Date(at);
    if (!Number.isFinite(when.getTime())) return;
    events.push({
      at: when.toISOString(),
      label,
      detail: detail ? String(detail).trim() : null
    });
  };

  const invitedBy =
    `${invite?.invited_by_first_name || ''} ${invite?.invited_by_last_name || ''}`.trim() || null;
  add(invite?.created_at, 'Invite created', invitedBy ? `By ${invitedBy}` : null);
  add(invite?.invite_email_sent_at, 'Invite email sent', invite?.contact_email || null);

  const started = hasRecipientStartedOnboarding(invite, progress);
  if (invite?.last_viewed_at) {
    add(
      invite.last_viewed_at,
      'Link opened',
      started ? null : 'Contact opened the link but has not saved any steps yet'
    );
  }

  for (const stepKey of STEP_KEYS) {
    const body = payload?.[stepKey];
    if (body?.completedAt) {
      const assist = body?.assistedBy;
      add(
        body.completedAt,
        `${INVITE_STEP_LABELS[stepKey] || stepKey} completed`,
        assist?.name ? `Last staff assist: ${assist.name}` : null
      );
    } else if (progress?.[stepKey] === 'in_progress' && body) {
      add(body.updatedAt || body.startedAt || body?.assistedBy?.at || null, `${INVITE_STEP_LABELS[stepKey] || stepKey} started`);
    }
    if (body?.assistedBy?.at && !body?.completedAt) {
      add(
        body.assistedBy.at,
        `${INVITE_STEP_LABELS[stepKey] || stepKey} draft saved by staff`,
        body.assistedBy.name || null
      );
    }
  }

  add(invite?.password_set_at, 'Login password set');
  add(invite?.submitted_at, 'Onboarding submitted');
  if (String(invite?.status || '').toLowerCase() === 'revoked') {
    add(invite?.updated_at, 'Invite revoked');
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
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
  const display = resolveInviteDisplayStatus(invite, progress);
  const base = {
    id: invite.id,
    status: invite.status,
    displayStatus: display.key,
    displayStatusLabel: display.label,
    source: invite.source || 'invite',
    schoolName: invite.school_name,
    schoolOrganizationId: invite.school_organization_id,
    outreachSchoolId: invite.outreach_school_id ? Number(invite.outreach_school_id) : null,
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
    lastViewedAt: invite.last_viewed_at,
    inviteEmailSentAt: invite.invite_email_sent_at || null,
    recipientStartedAt: invite.recipient_started_at || null
  };

  if (admin) {
    const urls = buildSchoolPortalUrls(invite);
    return {
      ...base,
      token: invite.token,
      link: buildOnboardingLink(invite.token),
      portalUrl: urls.portalUrl,
      loginUrl: urls.loginUrl,
      portalDashboardUrl: urls.portalDashboardUrl,
      invitedByName: `${invite.invited_by_first_name || ''} ${invite.invited_by_last_name || ''}`.trim() || null,
      agencyId: invite.agency_id,
      agencyName: invite.agency_name || null,
      materialsRequest: summarizeWelcomeMaterials(payload),
      activity: buildInviteActivity(invite, progress, payload),
      // Full submission details for admin receipt / review (not just materials)
      stepPayload: payload && typeof payload === 'object' ? payload : {}
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
          invite.agency_support_team_email || invite.agency_onboarding_team_email
        ),
        schoolGroupEmailDomain: resolveSchoolGroupEmailDomain(invite.agency_slug, invite.agency_portal_url)
      },
      staffTempPasswordExpiresHours: SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS,
      portalAccessTokenExpiresHours: SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS,
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
  if (!invite.last_viewed_at) {
    await ensureSchoolDigitalIntakeForms(invite);
  }
  const fresh = await reconcileStepProgress(await SchoolOnboardingInvite.findByToken(token));
  const profile = await getSchoolProfile(fresh.school_organization_id);
  const serialized = serializeInvite(fresh, { publicView: true });
  serialized.schoolProfile = profile;
  serialized.submitted = !!usable.submitted;
  const urls = buildSchoolPortalUrls(fresh);
  serialized.portalUrl = urls.portalUrl;
  serialized.loginUrl = urls.loginUrl;
  serialized.portalDashboardUrl = urls.portalDashboardUrl;
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
  const pwBasics = checkPasswordBasics(password);
  if (!pwBasics.valid) {
    throw Object.assign(new Error(pwBasics.message), { status: 400 });
  }
  const user = await User.findById(invite.primary_user_id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const username = user.username || user.email || invite.contact_email;
  const hadPassword = !!user.password_hash;
  // Always persist the password they just confirmed on the review step.
  // Previously we skipped when a hash already existed, but findById historically
  // omitted password_hash (so this was unreliable) and returning staff who chose
  // a new password during onboarding would keep an unknown prior credential.
  const pwCheck = await validatePasswordStrength(password, { accountId: username });
  if (!pwCheck.valid) {
    throw Object.assign(new Error(pwCheck.message), { status: 400 });
  }
  await User.changePassword(user.id, password);
  // Keep PENDING_SETUP / in-progress until final submit; do not jump to PREHIRE.
  await SchoolOnboardingInvite.update(invite.id, {
    passwordSetAt: new Date(),
    status: 'in_progress',
    ...(invite.recipient_started_at ? {} : { recipientStartedAt: new Date() })
  });
  const updatedUser = await User.findById(user.id);
  const agencies = await User.getAgencies(user.id);
  return {
    ok: true,
    username,
    user: updatedUser,
    agencies,
    passwordAlreadySet: hadPassword
  };
}

export async function saveStep(token, stepKey, payload = {}, markComplete = true, actor = null) {
  if (!STEP_KEYS.includes(stepKey)) {
    throw Object.assign(new Error('Invalid step'), { status: 400 });
  }
  const invite = await SchoolOnboardingInvite.findByToken(token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    throw Object.assign(new Error(usable.message), { status: usable.code === 'not_found' ? 404 : 410 });
  }
  if (usable.submitted) {
    throw Object.assign(
      new Error(
        'This onboarding is already complete. Edits can be made in the school portal, or message support for help.'
      ),
      { status: 400 }
    );
  }

  const helper = isAgencyHelperActor(invite, actor);
  // Agency staff can prefill drafts, but only the school contact may mark steps complete.
  let effectiveMarkComplete = markComplete === true;
  if (helper) effectiveMarkComplete = false;

  const progress = { ...(invite.step_progress || SchoolOnboardingInvite.defaultStepProgress()) };
  const stepPayload = { ...(invite.step_payload || {}) };
  const body = payload && typeof payload === 'object' ? payload : {};
  const markCompleteFlag = effectiveMarkComplete;

  if (stepKey === 'school_information') {
    const schoolName = String(body.schoolName || (markCompleteFlag ? invite.school_name : '')).trim();
    const itscoEmail = String(body.itscoEmail || '').trim().toLowerCase();
    if (markCompleteFlag && !schoolName) {
      throw Object.assign(new Error('School name is required before continuing'), { status: 400 });
    }
    if (markCompleteFlag && !itscoEmail) {
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
      primaryContactName: markCompleteFlag
        ? contactName || `${invite.contact_first_name} ${invite.contact_last_name}`
        : contactName || null,
      primaryContactEmail: markCompleteFlag ? contactEmail || invite.contact_email : contactEmail || null,
      primaryContactRole: body.primaryContactRole || 'Primary Contact',
      secondaryContactText: body.secondaryContactText || null,
      schoolDaysTimes: body.schoolDaysTimes || null
    });
    const filledBody = Object.fromEntries(
      Object.entries({ ...body, ...(itscoEmail ? { itscoEmail } : {}) }).filter(
        ([, value]) => String(value ?? '').trim() !== ''
      )
    );
    const mergedBody = markCompleteFlag
      ? filledBody
      : { ...(stepPayload.school_information || {}), ...filledBody };
    if (!markCompleteFlag && mergedBody.completedAt) delete mergedBody.completedAt;
    let infoPayload = stampStepPayload('school_information', mergedBody, markCompleteFlag);
    if (helper) infoPayload = applyAssistanceStamp(infoPayload, actor, { draft: true });
    stepPayload.school_information = infoPayload;

    if (markCompleteFlag && itscoEmail) {
      const groupResult = await provisionSchoolGroupForInvite(invite, {
        groupEmail: itscoEmail,
        schoolName: schoolName || invite.school_name
      });
      stepPayload.school_information = {
        ...stepPayload.school_information,
        googleGroupProvisionedAt: groupResult?.ok ? new Date().toISOString() : null,
        googleGroupProvisionError: groupResult?.ok ? null : groupResult?.reason || groupResult?.skipped ? 'skipped' : 'failed',
        googleGroupEmail: itscoEmail
      };
    }
  } else if (stepKey === 'school_staff') {
    const staff = Array.isArray(body.staff) ? body.staff : [];
    // Legacy clients may still send a shared temp password — ignore it going forward.
    // Added staff receive individual set-password email links when onboarding is submitted.

    const created = [];
    for (const row of staff) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      const isPrimary = email === String(invite.contact_email).toLowerCase();
      const { firstName, lastName } = parseName(row.fullName || row.name);
      const flags = parseAccessRole(row.accessRole || row.role || 'standard');
      const jobTitle = String(row.jobTitle || row.roleTitle || row.title || '').trim().slice(0, 255) || null;
      const groupEmailSubscription = normalizeGroupSubscription(
        row.groupEmailSubscription || row.subscription || 'all_mail'
      );
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
      if (jobTitle) {
        try {
          await User.update(user.id, { title: jobTitle });
        } catch {
          // ignore
        }
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

      const accessRole =
        row.accessRole ||
        (flags.isSchoolAdmin && flags.isScheduler
          ? 'school_admin_scheduler'
          : flags.isSchoolAdmin
            ? 'school_admin'
            : flags.isScheduler
              ? 'scheduler'
              : 'standard');

      await upsertSchoolContactRoleFlags({
        orgId: invite.school_organization_id,
        email,
        fullName: `${user.first_name || firstName} ${user.last_name || lastName}`.trim(),
        roleTitle: jobTitle,
        isSchoolAdmin: isPrimary ? true : flags.isSchoolAdmin,
        isScheduler: flags.isScheduler,
        isPrimary,
        groupEmailSubscription
      });

      created.push({
        userId: user.id,
        email,
        fullName: `${user.first_name || firstName} ${user.last_name || lastName}`.trim(),
        jobTitle,
        accessRole,
        groupEmailSubscription,
        isSchoolAdmin: isPrimary ? true : flags.isSchoolAdmin,
        isScheduler: isPrimary ? false : flags.isScheduler,
        roiEligible: isPrimary ? true : !flags.isScheduler
      });
    }

    // Ensure primary remains School Admin + ROI-eligible unless explicitly also listed as scheduler
    const primarySubscription = normalizeGroupSubscription(
      body.primaryGroupEmailSubscription ||
        staff.find((row) => String(row.email || '').trim().toLowerCase() === String(invite.contact_email || '').toLowerCase())
          ?.groupEmailSubscription ||
        'all_mail'
    );
    await upsertSchoolContactRoleFlags({
      orgId: invite.school_organization_id,
      email: invite.contact_email,
      fullName: `${invite.contact_first_name} ${invite.contact_last_name}`,
      isSchoolAdmin: true,
      isScheduler: false,
      isPrimary: true,
      groupEmailSubscription: primarySubscription
    });

    let staffPayload = stampStepPayload(
      'school_staff',
      {
        staff: created,
        primaryGroupEmailSubscription: primarySubscription,
        portalAccessEmailsOnSubmit: true,
        portalAccessTokenExpiresHours: SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS
      },
      markCompleteFlag
    );
    if (helper) staffPayload = applyAssistanceStamp(staffPayload, actor, { draft: true });
    stepPayload.school_staff = staffPayload;

    if (markCompleteFlag) {
      const profile = await getSchoolProfile(invite.school_organization_id);
      const groupEmail = String(profile?.itsco_email || stepPayload?.school_information?.itscoEmail || '').trim();
      if (groupEmail) {
        const staffEmails = created.map((r) => r.email).filter(Boolean);
        const groupResult = await provisionSchoolGroupForInvite(invite, {
          groupEmail,
          staffEmails: [...staffEmails, invite.contact_email]
        });
        stepPayload.school_staff = {
          ...stepPayload.school_staff,
          googleGroupMembersSyncedAt: groupResult?.ok ? new Date().toISOString() : null,
          googleGroupMembersSyncError: groupResult?.ok ? null : groupResult?.reason || 'failed'
        };
      }
    }
  } else if (stepKey === 'preferred_days') {
    const preferredDays = Array.isArray(body.preferredDays) ? body.preferredDays : [];
    const notes = String(body.notes || '').trim();
    if (markCompleteFlag && preferredDays.length === 0 && !notes) {
      throw Object.assign(
        new Error('Select at least one preferred day or add scheduling notes before continuing'),
        { status: 400 }
      );
    }
    const daysLabel = preferredDays.length ? preferredDays.join(', ') : null;
    await upsertSchoolProfile(invite.school_organization_id, {
      schoolDaysTimes: [daysLabel, notes].filter(Boolean).join('\n') || null
    });
    let daysPayload = stampStepPayload(
      'preferred_days',
      { preferredDays, notes },
      markCompleteFlag
    );
    if (helper) daysPayload = applyAssistanceStamp(daysPayload, actor, { draft: true });
    stepPayload.preferred_days = daysPayload;
  } else if (stepKey === 'welcome_materials') {
    const materials = Array.isArray(body.materials)
      ? [...new Set(body.materials.map((m) => String(m || '').trim()).filter((m) => WELCOME_MATERIAL_KEYS.has(m)))]
      : [];
    const materialsOther = String(body.materialsOther || '').trim().slice(0, 500);
    const requestPaperPackets =
      body.requestPaperPackets === true ? true : body.requestPaperPackets === false ? false : null;
    if (markCompleteFlag && requestPaperPackets == null) {
      throw Object.assign(
        new Error('Please tell us whether you want paper referral packets printed'),
        { status: 400 }
      );
    }
    let materialsPayload = stampStepPayload(
      'welcome_materials',
      {
        welcomePackageAcknowledged: true,
        materials,
        materialsOther: materials.includes('other') ? materialsOther : '',
        requestPaperPackets
      },
      markCompleteFlag
    );
    if (helper) materialsPayload = applyAssistanceStamp(materialsPayload, actor, { draft: true });
    stepPayload.welcome_materials = materialsPayload;
  } else if (stepKey === 'explore_demo') {
    let demoPayload = stampStepPayload(
      'explore_demo',
      { viewedAt: new Date().toISOString(), ...(body || {}) },
      markCompleteFlag
    );
    if (helper) demoPayload = applyAssistanceStamp(demoPayload, actor, { draft: true });
    stepPayload.explore_demo = demoPayload;
  } else if (stepKey === 'review_submit') {
    // handled by submitOnboarding
    stepPayload.review_submit = body;
  }

  if (markCompleteFlag && stepKey !== 'review_submit') {
    progress[stepKey] = 'complete';
  } else if (!markCompleteFlag && progress[stepKey] !== 'complete') {
    progress[stepKey] = 'in_progress';
  }

  const invitePatch = { stepProgress: progress, stepPayload };
  // Agency helper drafts must not mark the invite as started by the school contact.
  if (!helper && recipientHasSavedProgress(progress, stepPayload)) {
    invitePatch.status = 'in_progress';
    if (!invite.recipient_started_at) {
      invitePatch.recipientStartedAt = new Date();
    }
  } else if (helper && invite.status === 'invited') {
    // Keep status invited until the school contact saves; helpers only leave draft payload.
  }

  const updated = await SchoolOnboardingInvite.update(invite.id, invitePatch);
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
    const urls = buildSchoolPortalUrls(invite);
    const serialized = serializeInvite(invite, { publicView: true });
    if (serialized) serialized.submitted = true;
    const primaryUser = await User.findById(invite.primary_user_id);
    const agencies = primaryUser?.id ? await User.getAgencies(primaryUser.id) : [];
    return {
      alreadySubmitted: true,
      loginPath: urls.loginPath,
      portalDashboardPath: urls.portalDashboardPath,
      portalUrl: urls.portalUrl,
      loginUrl: urls.loginUrl,
      portalDashboardUrl: urls.portalDashboardUrl,
      username: primaryUser?.username || primaryUser?.email || invite.contact_email,
      user: primaryUser,
      agencies,
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
    await syncOutreachPartnerFromOnboarding(invite);
  } catch (e) {
    console.warn('[schoolOnboarding] outreach partner sync on submit failed:', e?.message || e);
  }
  try {
    await User.update(invite.primary_user_id, { isActive: true });
  } catch {
    // ignore
  }

  // Activate other school staff created during onboarding
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

  // Portal-access emails: primary (login welcome) + added staff (set-password links)
  try {
    const {
      sendSchoolOnboardingStaffPortalAccessEmail,
      formatSchoolStaffAccessRoleLabel,
      ONBOARDING_TOKEN_EXPIRES_HOURS
    } = await import('./schoolStaffAccountAccessEmail.service.js');
    const schoolName = String(invite.school_org_name || invite.school_name || 'your school').trim();
    const primaryUser = await User.findById(invite.primary_user_id);
    const invitedByName =
      `${invite.contact_first_name || ''} ${invite.contact_last_name || ''}`.trim() ||
      `${primaryUser?.first_name || ''} ${primaryUser?.last_name || ''}`.trim() ||
      'Your school administrator';
    const staffPayload = invite.step_payload?.school_staff?.staff || [];

    if (primaryUser?.id) {
      await sendSchoolOnboardingStaffPortalAccessEmail({
        agencyId: invite.agency_id,
        schoolOrganizationId: invite.school_organization_id,
        schoolName,
        userId: primaryUser.id,
        invitedByName:
          `${invite.invited_by_first_name || ''} ${invite.invited_by_last_name || ''}`.trim() ||
          'Our team',
        accessRoleLabel: formatSchoolStaffAccessRoleLabel('primary'),
        jobTitle: primaryUser.title || null,
        includeSetPasswordLink: false,
        actorUserId: invite.primary_user_id,
        tokenExpiresHours: ONBOARDING_TOKEN_EXPIRES_HOURS,
        source: 'auto'
      }).catch((e) => console.warn('[schoolOnboarding] primary portal email failed:', e?.message || e));
    }

    for (const row of staffPayload) {
      const uid = Number(row?.userId || 0);
      if (!uid || uid === invite.primary_user_id) continue;
      await sendSchoolOnboardingStaffPortalAccessEmail({
        agencyId: invite.agency_id,
        schoolOrganizationId: invite.school_organization_id,
        schoolName,
        userId: uid,
        invitedByName,
        accessRoleLabel: formatSchoolStaffAccessRoleLabel(row.accessRole),
        jobTitle: row.jobTitle || null,
        includeSetPasswordLink: true,
        actorUserId: invite.primary_user_id,
        tokenExpiresHours: ONBOARDING_TOKEN_EXPIRES_HOURS,
        source: 'auto'
      }).catch((e) =>
        console.warn('[schoolOnboarding] staff portal email failed:', uid, e?.message || e)
      );
    }
  } catch (e) {
    console.warn('[schoolOnboarding] portal access emails failed:', e?.message || e);
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

  // Ensure EN/ES digital intake shells exist at activation (QR or invite start).
  try {
    await ensureSchoolDigitalIntakeForms(invite, { createdByUserId: invite.primary_user_id || null });
  } catch (e) {
    console.warn('[schoolOnboarding] ensure digital intakes on submit failed:', e?.message || e);
  }

  const fresh = await SchoolOnboardingInvite.findById(invite.id)
  await notifySchoolPortalOnboardingCompleted(fresh);
  const urls = buildSchoolPortalUrls(fresh);
  const primaryUser = await User.findById(invite.primary_user_id);
  const agencies = primaryUser?.id ? await User.getAgencies(primaryUser.id) : [];
  const serialized = serializeInvite(fresh, { publicView: true });
  if (serialized) serialized.submitted = true;
  return {
    alreadySubmitted: false,
    loginPath: urls.loginPath,
    portalDashboardPath: urls.portalDashboardPath,
    portalUrl: urls.portalUrl,
    loginUrl: urls.loginUrl,
    portalDashboardUrl: urls.portalDashboardUrl,
    username: primaryUser?.username || primaryUser?.email || fresh.contact_email,
    user: primaryUser,
    agencies,
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
        link.agency_support_team_email || link.agency_onboarding_team_email
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
    qrLinkId: link.id,
    priorSchoolDecision: body.priorSchoolDecision || null,
    resetPassword: body.resetPassword === true,
    confirmExistingSchoolStaff: body.confirmExistingSchoolStaff === true
  });

  return {
    inviteToken: result.invite.token,
    link: buildOnboardingLink(result.invite.token),
    school: result.school,
    reusedExistingUser: !!result.reusedExistingUser,
    temporaryPassword: result.temporaryPassword || undefined,
    temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt || undefined
  };
}

export { STEP_KEYS };
