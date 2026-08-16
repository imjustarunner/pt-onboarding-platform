import pool from '../config/database.js';
import config from '../config/config.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import { verifyRecaptchaV3 } from './captcha.service.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { SUPPORT_TICKET_SOURCE_KEYS, normalizeSupportTicketSourceKey } from '../constants/supportTicketSources.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import { normalizeTicketTopic } from '../utils/ticketTopics.js';
import {
  mergeIntakeLegalIntoTheme,
  resolveIntakeLegalFromTheme
} from '../content/intakeLegalCopy.js';
import {
  mergeOfficeCommunicationsIntoTheme,
  resolveOfficeCommunicationsFromTheme
} from '../content/officeCommunicationsCopy.js';

export const PUBLIC_SUPPORT_CATEGORIES = [
  { id: 'parent_access', label: 'Help with parent or guardian login' },
  { id: 'intake_join', label: 'Questions about joining or intake' },
  { id: 'scheduling', label: 'Scheduling or appointments' },
  { id: 'billing', label: 'Billing or insurance questions' },
  { id: 'careers', label: 'Careers or employment' },
  { id: 'records', label: 'Records request' },
  { id: 'technical', label: 'Website or technical help' },
  { id: 'other', label: 'Something else' }
];

const DEFAULT_INTRO = [
  'We\'re glad you reached out. Share what you need below — it\'s okay to include health details',
  'if that helps us assist you. For the most private option, message us through your portal account.'
].join(' ');

const LEGACY_INTRO_MARKERS = [
  'send a message to this organization',
  'this public page is not as protected',
  'message inside the portal',
  'this organization'
];

const PHI_WARNING = [
  'If sharing health details would help us respond, you can include them here.',
  'This page isn\'t as secure as messaging us inside your portal.',
  'Please don\'t include Social Security or payment card numbers.',
  'Need extra privacy? Log in to your portal to send us a secure message.'
].join(' ');

function defaultIntroForAgency(_agencyName) {
  return DEFAULT_INTRO;
}

function resolveSupportIntro(pageIntro, agencyName) {
  const custom = String(pageIntro || '').trim();
  if (!custom) return defaultIntroForAgency(agencyName);
  const lower = custom.toLowerCase();
  if (LEGACY_INTRO_MARKERS.some((marker) => lower.includes(marker))) {
    return defaultIntroForAgency(agencyName);
  }
  return custom;
}

function frontendOrigin() {
  return String(process.env.FRONTEND_URL || process.env.APP_URL || 'https://plottwisthq.com').replace(/\/$/, '');
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parsePublicSupportTheme(themeSettings) {
  const theme = parseJson(themeSettings, {});
  const raw = theme.publicSupport && typeof theme.publicSupport === 'object' ? theme.publicSupport : {};
  return {
    intro: String(raw.intro || '').trim().slice(0, 800),
    hoursNote: String(raw.hoursNote || '').trim().slice(0, 240),
    layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : {}
  };
}

function parseColorPalette(raw) {
  const palette = parseJson(raw, {});
  const primary = String(palette.primary || palette.primaryColor || palette.accent || '').trim();
  const secondary = String(palette.secondary || palette.secondaryColor || '').trim();
  return {
    primary: primary || '#1b3d2f',
    secondary: secondary || '#143528'
  };
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhoneDisplay(phone, extension) {
  const digits = digitsOnly(phone);
  let display = String(phone || '').trim();
  if (!display && digits.length === 10) {
    display = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  const ext = String(extension || '').trim();
  if (display && ext) display = `${display} x${ext}`;
  return display;
}

function e164(phone) {
  const digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 7) return `+${digits}`;
  return '';
}

function telHref(phone) {
  const n = e164(phone);
  return n ? `tel:${n}` : '';
}

function smsHref(phone) {
  const n = e164(phone);
  return n ? `sms:${n}` : '';
}

export function ticketTopicFromPublicCategory(category) {
  return category === 'billing' ? 'billing' : 'general';
}

async function resolveAgency(slugOrId) {
  const slug = String(slugOrId || '').trim();
  if (!slug) return null;
  if (/^\d+$/.test(slug)) return Agency.findById(Number(slug));
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug));
}

export function canEditPublicAgencySupport(user) {
  const role = String(user?.role || user?.effectiveRole || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return role === 'admin' || role === 'support' || role === 'super_admin' || role === 'superadmin';
}

export async function assertCanEditPublicAgencySupport(user, agencyId) {
  if (!canEditPublicAgencySupport(user)) {
    const err = new Error('Not allowed to edit this page.');
    err.status = 403;
    throw err;
  }
  const role = String(user?.role || user?.effectiveRole || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (role === 'super_admin' || role === 'superadmin') return;
  const agencies = await User.getAgencies(user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('Not allowed to edit this organization.');
    err.status = 403;
    throw err;
  }
}

export function scanPublicSupportContent(message) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const flags = [];
  let block = false;
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(text) || lower.includes('social security')) {
    flags.push('possible_ssn');
    block = true;
  }
  if (/(?:\d[ -]?){13,19}/.test(text)) {
    flags.push('possible_card');
    block = true;
  }
  const medicalHits = [
    'diagnosis', 'diagnosed', 'medication', 'prescription', 'hipaa',
    'therapy notes', 'treatment plan', 'medicaid', 'medical record',
    'phi', 'depression', 'anxiety', 'adhd', 'autism'
  ].filter((term) => lower.includes(term));
  if (medicalHits.length) flags.push('possible_phi');
  return { flags, block, medicalHits };
}

function tenantSlugForPublicPaths(agency, requestSlug = '') {
  const requested = String(requestSlug || '').trim();
  if (requested) return requested;
  return String(agency.portal_url || agency.slug || '').trim();
}

function buildPublicConfig(agency, requestSlug = '') {
  const slug = tenantSlugForPublicPaths(agency, requestSlug);
  const recaptchaConfigured = !!(config.recaptcha?.secretKey || config.recaptcha?.enterpriseApiKey || config.recaptcha?.siteKey);
  const page = parsePublicSupportTheme(agency.theme_settings);
  const colors = parseColorPalette(agency.color_palette);
  const phone = String(agency.phone_number || '').trim();
  const extension = String(agency.phone_extension || '').trim();
  const email = String(agency.onboarding_team_email || '').trim();
  const bookingEnabled = !!(
    agency.public_availability_enabled === 1
    || agency.public_availability_enabled === true
    || agency.public_availability_enabled === '1'
  );
  const origin = frontendOrigin();
  const joinPath = `/join/${encodeURIComponent(slug)}/counseling`;
  return {
    agency: {
      id: agency.id,
      name: String(agency.official_name || agency.name || '').trim(),
      slug,
      logoUrl: agency.logo_url || agency.logoUrl || null,
      colors
    },
    publicUrl: `${origin}/${encodeURIComponent(slug)}/support`,
    intro: resolveSupportIntro(page.intro, String(agency.official_name || agency.name || '').trim()),
    hoursNote: page.hoursNote || '',
    layout: page.layout || {},
    supportContact: {
      phone,
      phoneExtension: extension,
      phoneDisplay: formatPhoneDisplay(phone, extension),
      telHref: telHref(phone),
      smsHref: smsHref(phone),
      email
    },
    shortcuts: {
      joinPath,
      joinUrl: `${origin}${joinPath}`,
      loginPath: `/${encodeURIComponent(slug)}/login`,
      careersPath: `/careers/${encodeURIComponent(slug)}`,
      bookingPath: bookingEnabled ? `/${encodeURIComponent(slug)}/book-session` : null
    },
    intakeLegal: {
      en: resolveIntakeLegalFromTheme(agency.theme_settings, 'en'),
      es: resolveIntakeLegalFromTheme(agency.theme_settings, 'es')
    },
    officeCommunications: resolveOfficeCommunicationsFromTheme(agency.theme_settings),
    categories: PUBLIC_SUPPORT_CATEGORIES,
    phiWarning: PHI_WARNING,
    recaptchaSiteKey: String(config.recaptcha?.siteKey || process.env.RECAPTCHA_SITE_KEY || '').trim() || null,
    recaptchaRequired: recaptchaConfigured && config.nodeEnv === 'production'
  };
}

export async function getPublicAgencySupportConfig(agencySlug) {
  const agency = await resolveAgency(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  return buildPublicConfig(agency, agencySlug);
}

export async function updatePublicAgencySupportSettings(agencySlug, payload = {}, user = null) {
  const agency = await resolveAgency(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  await assertCanEditPublicAgencySupport(user, agency.id);

  const theme = parseJson(agency.theme_settings, {});
  const current = parsePublicSupportTheme(theme);
  const nextPage = {
    intro: payload.intro !== undefined ? String(payload.intro || '').trim().slice(0, 800) : current.intro,
    hoursNote: payload.hoursNote !== undefined
      ? String(payload.hoursNote || '').trim().slice(0, 240)
      : current.hoursNote,
    layout: payload.layout && typeof payload.layout === 'object' ? payload.layout : current.layout
  };
  theme.publicSupport = nextPage;
  let nextTheme = theme;
  if (payload.officeCommunications && typeof payload.officeCommunications === 'object') {
    nextTheme = mergeOfficeCommunicationsIntoTheme(nextTheme, payload.officeCommunications);
  }
  if (payload.intakeLegal && typeof payload.intakeLegal === 'object') {
    if (payload.intakeLegal.en || payload.intakeLegal.es) {
      if (payload.intakeLegal.en) nextTheme = mergeIntakeLegalIntoTheme(nextTheme, payload.intakeLegal.en, 'en');
      if (payload.intakeLegal.es) nextTheme = mergeIntakeLegalIntoTheme(nextTheme, payload.intakeLegal.es, 'es');
    } else {
      nextTheme = mergeIntakeLegalIntoTheme(nextTheme, payload.intakeLegal, payload.locale || 'en');
    }
  }

  await Agency.update(agency.id, {
    phoneNumber: payload.phone !== undefined ? String(payload.phone || '').trim().slice(0, 40) : agency.phone_number,
    phoneExtension: payload.phoneExtension !== undefined
      ? String(payload.phoneExtension || '').trim().slice(0, 20)
      : agency.phone_extension,
    onboardingTeamEmail: payload.email !== undefined
      ? String(payload.email || '').trim().slice(0, 255)
      : agency.onboarding_team_email,
    themeSettings: nextTheme
  });

  const updated = await Agency.findById(agency.id);
  return buildPublicConfig(updated || agency, agencySlug);
}

async function verifyRequiredCaptcha({ token, req }) {
  const configured = !!(config.recaptcha?.secretKey || config.recaptcha?.enterpriseApiKey || config.recaptcha?.siteKey);
  if (!configured) {
    if (config.nodeEnv === 'production') return { ok: false, reason: 'captcha_not_configured' };
    return { ok: true, skipped: true };
  }
  const cleaned = String(token || '').trim();
  if (!cleaned) return { ok: false, reason: 'missing_token' };
  const verification = await verifyRecaptchaV3({
    token: cleaned,
    expectedAction: 'public_agency_support',
    remoteip: getClientIpAddress(req),
    userAgent: req?.get?.('user-agent')
  });
  if (!verification.ok) return verification;
  const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
  const minScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
  if (verification.score !== null && verification.score < minScore && config.nodeEnv === 'production') {
    return { ok: false, reason: 'low_score', score: verification.score, minScore };
  }
  return verification;
}

async function notifyPublicSupportTicket({ agency, topic, subject, question, ticketId }) {
  const aid = Number(agency?.id || 0);
  if (!aid || !ticketId) return;
  const t = normalizeTicketTopic(topic);
  let flagSql = '';
  if (t === 'billing') flagSql = ' OR COALESCE(ua.has_billing_access, 0) = 1';
  const [rows] = await pool.execute(
    `SELECT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       AND (
         LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin', 'support')
         ${flagSql}
       )`,
    [aid]
  );
  const title = t === 'billing' ? 'New billing ticket' : 'New public support ticket';
  const msg = `${agency.official_name || agency.name || 'Organization'}: ${subject || 'Support'} — ${String(question || '').slice(0, 220)}`;
  for (const r of rows || []) {
    try {
      await Notification.create({
        type: 'support_ticket_created',
        severity: 'info',
        title,
        message: msg,
        userId: r.id,
        agencyId: aid,
        relatedEntityType: 'support_ticket',
        relatedEntityId: ticketId,
        actorUserId: null
      });
    } catch {
      /* per-recipient */
    }
  }
}

export async function createPublicAgencySupportTicket(agencySlug, payload = {}, req = null) {
  const agency = await resolveAgency(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  if (String(payload.website || payload.honeypot || '').trim()) {
    return { ok: true, ticketId: null, suppressed: true };
  }

  const name = String(payload.name || '').trim().slice(0, 120);
  const email = String(payload.email || '').trim().toLowerCase().slice(0, 255);
  const phone = String(payload.phone || payload.callbackPhone || '').trim().slice(0, 40);
  const preferText = payload.preferText === true || payload.preferText === 'true' || payload.preferText === 1;
  const message = String(payload.message || payload.question || '').trim().slice(0, 4000);
  const category = PUBLIC_SUPPORT_CATEGORIES.some((c) => c.id === payload.category)
    ? payload.category
    : 'other';
  const phiAcknowledged = payload.phiAcknowledged === true || payload.phiAcknowledged === 'true';
  const topic = ticketTopicFromPublicCategory(category);

  if (!name || name.length < 2) {
    const err = new Error('Please enter your name.');
    err.status = 400;
    throw err;
  }
  if (!email || !email.includes('@')) {
    const err = new Error('Please enter a valid email address.');
    err.status = 400;
    throw err;
  }
  if (digitsOnly(phone).length < 7) {
    const err = new Error('Please leave a callback number.');
    err.status = 400;
    throw err;
  }
  if (!message || message.length < 10) {
    const err = new Error('Please enter a message (at least 10 characters).');
    err.status = 400;
    throw err;
  }
  if (!phiAcknowledged) {
    const err = new Error('Please check the box to confirm you\'ve read the privacy note above.');
    err.status = 400;
    throw err;
  }

  const scan = scanPublicSupportContent(message);
  if (scan.block) {
    const err = new Error('This message looks like it contains a Social Security number or card number. Remove that information and try again.');
    err.status = 400;
    err.code = 'blocked_content';
    throw err;
  }

  const captcha = await verifyRequiredCaptcha({
    token: payload.captchaToken || payload.recaptchaToken,
    req
  });
  if (!captcha.ok) {
    const err = new Error('Please complete the human verification and try again.');
    err.status = 400;
    err.code = captcha.reason || 'captcha_failed';
    throw err;
  }

  const categoryLabel = PUBLIC_SUPPORT_CATEGORIES.find((c) => c.id === category)?.label || category;
  const subject = `${categoryLabel} — ${name}`.slice(0, 255);
  const question = [
    message,
    '',
    '---',
    `From: ${name}`,
    `Email: ${email}`,
    `Callback number: ${phone}`,
    `Prefers text: ${preferText ? 'yes' : 'no'}`,
    `Category: ${categoryLabel}`,
    scan.flags.length ? `Content flags: ${scan.flags.join(', ')}` : null,
    'Source: public agency support page'
  ].filter(Boolean).join('\n');

  const qEnc = prepareEncryptedTicketText(question);
  const sourceKey = normalizeSupportTicketSourceKey(SUPPORT_TICKET_SOURCE_KEYS.PUBLIC_AGENCY_SUPPORT);
  let insertId = null;
  try {
    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
         subject, question, status, source_channel, source_email_from, topic,
         question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open', 'public_web', ?, ?, ?, ?, ?, ?)`,
      [
        agency.id,
        sourceKey,
        agency.id,
        subject,
        qEnc.plain,
        email,
        topic,
        qEnc.ciphertext,
        qEnc.iv,
        qEnc.authTag,
        qEnc.keyId
      ]
    );
    insertId = result.insertId;
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown column') || msg.includes('source_email_from') || msg.includes('question_ciphertext') || msg.includes('source_channel') || msg.includes('topic')) {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id, subject, question, status)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, 'open')`,
        [agency.id, sourceKey, agency.id, subject, qEnc.plain || question]
      );
      insertId = result.insertId;
      if (insertId && topic === 'billing') {
        try {
          await pool.execute(`UPDATE support_tickets SET topic = ? WHERE id = ?`, [topic, insertId]);
        } catch {
          /* older schema */
        }
      }
    } else {
      throw e;
    }
  }

  try {
    await notifyPublicSupportTicket({ agency, topic, subject, question, ticketId: insertId });
  } catch {
    /* never block create */
  }

  const slug = tenantSlugForPublicPaths(agency, agencySlug);
  return {
    ok: true,
    ticketId: insertId || null,
    suggestedQuickForm: scan.flags.includes('possible_phi'),
    joinPath: `/join/${encodeURIComponent(slug)}/counseling`
  };
}
