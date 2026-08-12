import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import config from '../config/config.js';
import {
  buildPublicFormBrandingForAgencyId,
  resolveOrgLogoUrl,
  requestBaseUrl
} from './publicFormBranding.service.js';
import { verifyRecaptchaV3 } from './captcha.service.js';
import {
  SUPPORT_TICKET_SOURCE_KEYS,
  normalizeSupportTicketSourceKey
} from '../constants/supportTicketSources.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';

const DEMO_SCHOOL_SLUGS = new Set(['hogwarts', 'durmstrang']);

function parseJsonObject(v) {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return { ...v };
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function resolveAgencyBySlug(agencySlug) {
  const slug = String(agencySlug || '').trim().toLowerCase();
  if (!slug) return null;
  const agency = await Agency.findBySlug(slug);
  if (!agency?.id) return null;
  const orgType = String(agency.organization_type || 'agency').toLowerCase();
  if (orgType && orgType !== 'agency') return null;
  if (agency.is_active === false || agency.is_active === 0) return null;
  return agency;
}

async function hasSupportTicketEncryptionColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_tickets'
         AND COLUMN_NAME = 'question_ciphertext'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasSourceEmailFromColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_tickets'
         AND COLUMN_NAME = 'source_email_from'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Affiliated schools that have an active English school intake/public_form link.
 * Excludes Hogwarts/Durmstrang demo orgs.
 */
export async function listPublicReferralDirectory(agencySlug, req = null) {
  const agency = await resolveAgencyBySlug(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const baseUrl = requestBaseUrl(req) || String(config.backendUrl || '').replace(/\/$/, '');
  const branding = await buildPublicFormBrandingForAgencyId(agency.id, { baseUrl });

  const [rows] = await pool.execute(
    `SELECT
       org.id AS school_organization_id,
       org.name AS school_name,
       org.slug AS school_slug,
       org.portal_url AS school_portal_url,
       org.city AS city,
       org.state AS state,
       org.logo_path,
       org.logo_url,
       sp.district_name,
       sp.location_label,
       il.id AS intake_link_id,
       il.public_key AS intake_public_key,
       il.title AS intake_title
     FROM agencies org
     INNER JOIN (
       SELECT organization_id
       FROM organization_affiliations
       WHERE agency_id = ? AND is_active = TRUE
       UNION
       SELECT school_organization_id AS organization_id
       FROM agency_schools
       WHERE agency_id = ? AND is_active = TRUE
     ) aff ON aff.organization_id = org.id
     LEFT JOIN school_profiles sp ON sp.school_organization_id = org.id
     INNER JOIN intake_links il ON il.id = (
       SELECT il2.id
       FROM intake_links il2
       WHERE il2.scope_type = 'school'
         AND il2.organization_id = org.id
         AND il2.is_active = 1
         AND COALESCE(il2.form_type, 'intake') IN ('intake', 'public_form')
         AND LOWER(COALESCE(NULLIF(TRIM(il2.language_code), ''), 'en')) LIKE 'en%'
       ORDER BY il2.updated_at DESC, il2.id DESC
       LIMIT 1
     )
     WHERE LOWER(COALESCE(org.organization_type, 'school')) = 'school'
       AND (org.is_active = TRUE OR org.is_active IS NULL)
       AND LOWER(COALESCE(NULLIF(TRIM(org.slug), ''), '')) NOT IN ('hogwarts', 'durmstrang')
       AND LOWER(COALESCE(NULLIF(TRIM(org.portal_url), ''), '')) NOT IN ('hogwarts', 'durmstrang')
     ORDER BY org.name ASC`,
    [agency.id, agency.id]
  );

  const schools = [];
  const districtCounts = new Map();

  for (const row of rows || []) {
    const slug = String(row.school_slug || row.school_portal_url || '').trim().toLowerCase();
    if (DEMO_SCHOOL_SLUGS.has(slug)) continue;
    const publicKey = String(row.intake_public_key || '').trim();
    if (!publicKey) continue;

    const district = String(row.district_name || '').trim() || 'Other';
    districtCounts.set(district, (districtCounts.get(district) || 0) + 1);

    const city = String(row.city || '').trim();
    const state = String(row.state || '').trim();
    const locationLabel = String(row.location_label || '').trim();
    const location = locationLabel
      || [city, state].filter(Boolean).join(', ')
      || '';

    schools.push({
      id: Number(row.school_organization_id),
      name: String(row.school_name || '').trim() || `School #${row.school_organization_id}`,
      slug: slug || null,
      district,
      city: city || null,
      state: state || null,
      location,
      logoUrl: resolveOrgLogoUrl(row, { baseUrl }),
      intakePublicKey: publicKey,
      intakeLinkId: Number(row.intake_link_id) || null,
      intakeTitle: row.intake_title || null
    });
  }

  const districts = Array.from(districtCounts.entries())
    .map(([districtName, schoolCount]) => ({ districtName, schoolCount }))
    .sort((a, b) => {
      if (a.districtName === 'Other') return 1;
      if (b.districtName === 'Other') return -1;
      return a.districtName.localeCompare(b.districtName);
    });

  const phone = String(agency.phone_number || '').trim() || null;
  const phoneExtension = String(agency.phone_extension || '').trim() || null;
  const supportEmail =
    String(agency.onboarding_team_email || '').trim()
    || (branding.slug ? `support@${String(branding.slug).toLowerCase()}.health` : null);

  return {
    agency: {
      id: agency.id,
      name: agency.official_name || agency.name,
      slug: agency.slug || agency.portal_url,
      phone,
      phoneExtension,
      supportEmail,
      branding
    },
    schools,
    districts,
    totalSchools: schools.length
  };
}

async function verifyOptionalCaptcha(captchaToken) {
  const token = String(captchaToken || '').trim();
  // Captcha is optional for this public form; rate limit + honeypot are primary guards.
  if (!token) return { ok: true, skipped: true };
  const configured = !!(config.recaptcha?.secretKey || config.recaptcha?.enterpriseApiKey);
  if (!configured) return { ok: true, skipped: true };
  const verification = await verifyRecaptchaV3({
    token,
    expectedAction: 'public_school_referral_support',
    siteKeyOverride: process.env.RECAPTCHA_SITE_KEY_INTAKE || config.recaptcha?.siteKey || undefined
  });
  if (!verification.ok) return verification;
  const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
  const minScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
  if (
    verification.score !== null
    && verification.score < minScore
    && config.nodeEnv === 'production'
  ) {
    return { ok: false, reason: 'low_score', score: verification.score, minScore };
  }
  return verification;
}

/**
 * Create an unauthenticated support ticket for the school referral finder / intake splash.
 */
export async function createPublicSchoolReferralSupportTicket(agencySlug, payload = {}) {
  const agency = await resolveAgencyBySlug(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const honeypot = String(payload.website || payload.honeypot || '').trim();
  if (honeypot) {
    // Silent success for bots
    return { ok: true, ticketId: null, suppressed: true };
  }

  const name = String(payload.name || payload.fullName || '').trim().slice(0, 120);
  const email = String(payload.email || '').trim().toLowerCase().slice(0, 255);
  const message = String(payload.message || payload.question || '').trim().slice(0, 4000);
  const schoolName = String(payload.schoolName || '').trim().slice(0, 255);
  const intakePublicKey = String(payload.intakePublicKey || '').trim().slice(0, 64);
  const schoolOrganizationIdRaw = Number(payload.schoolOrganizationId || 0) || null;

  if (!name || name.length < 2) {
    const err = new Error('Please enter your name');
    err.status = 400;
    throw err;
  }
  if (!email || !email.includes('@') || email.length < 5) {
    const err = new Error('Please enter a valid email address');
    err.status = 400;
    throw err;
  }
  if (!message || message.length < 10) {
    const err = new Error('Please enter a message (at least 10 characters)');
    err.status = 400;
    throw err;
  }

  const captcha = await verifyOptionalCaptcha(payload.captchaToken || payload.recaptchaToken);
  if (!captcha.ok) {
    const err = new Error('Please complete the human verification and try again');
    err.status = 400;
    err.code = captcha.reason || 'captcha_failed';
    throw err;
  }

  const sourceKey = normalizeSupportTicketSourceKey(
    payload.sourceKey || SUPPORT_TICKET_SOURCE_KEYS.PUBLIC_SCHOOL_REFERRAL
  );
  const agencyName = String(agency.official_name || agency.name || 'our team').trim();
  const slug = String(agency.slug || agency.portal_url || '').trim().toLowerCase();
  const defaultWantSubject =
    slug === 'itsco' ? 'We Want ITSCO' : `We Want ${agencyName}`;

  let subject = String(payload.subject || '').trim().slice(0, 255);
  if (!subject) {
    subject = schoolName
      ? `School intake help — ${schoolName}`
      : defaultWantSubject;
  }

  const questionParts = [
    message,
    '',
    '---',
    `From: ${name}`,
    `Email: ${email}`,
    schoolName ? `School: ${schoolName}` : null,
    intakePublicKey ? `Intake key: ${intakePublicKey}` : null,
    `Source: ${sourceKey}`
  ].filter(Boolean);
  const question = questionParts.join('\n');

  const schoolOrganizationId = schoolOrganizationIdRaw || agency.id;
  const hasEnc = await hasSupportTicketEncryptionColumns();
  const qEnc = hasEnc
    ? prepareEncryptedTicketText(question)
    : { plain: question, ciphertext: null, iv: null, authTag: null, keyId: null };
  const hasSourceEmail = await hasSourceEmailFromColumn();

  let insertId = null;
  try {
    if (hasEnc && hasSourceEmail) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
           subject, question, status, source_channel, source_email_from,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open', 'public_web', ?, ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          sourceKey,
          agency.id,
          subject,
          qEnc.plain,
          email,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
      insertId = result.insertId;
    } else if (hasEnc) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
           subject, question, status,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          sourceKey,
          agency.id,
          subject,
          qEnc.plain,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
      insertId = result.insertId;
    } else if (hasSourceEmail) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
           subject, question, status, source_channel, source_email_from)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open', 'public_web', ?)`,
        [schoolOrganizationId, sourceKey, agency.id, subject, question, email]
      );
      insertId = result.insertId;
    } else {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
           subject, question, status)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open')`,
        [schoolOrganizationId, sourceKey, agency.id, subject, question]
      );
      insertId = result.insertId;
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('created_by_source_key')) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
         VALUES (?, NULL, NULL, ?, ?, ?, 'open')`,
        [schoolOrganizationId, agency.id, `[${sourceKey}] ${subject}`, question]
      );
      insertId = result.insertId;
    } else {
      throw e;
    }
  }

  // Best-effort notify agency admins
  try {
    const Notification = (await import('../models/Notification.model.js')).default;
    const [admins] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) IN ('admin', 'support', 'super_admin')
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
      [agency.id]
    );
    for (const row of admins || []) {
      const uid = Number(row.id);
      if (!uid) continue;
      await Notification.create({
        type: 'support_ticket_created',
        severity: 'info',
        title: 'New public school referral support message',
        message: subject,
        userId: uid,
        agencyId: agency.id,
        relatedEntityType: 'support_ticket',
        relatedEntityId: insertId,
        actorSource: 'Public School Referral'
      });
    }
  } catch {
    // ignore
  }

  return { ok: true, ticketId: insertId };
}

export { parseJsonObject, resolveAgencyBySlug };
