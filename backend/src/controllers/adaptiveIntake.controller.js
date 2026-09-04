import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import * as AdaptiveIntake from '../services/adaptiveIntake.service.js';
import * as CoGuardianInvite from '../services/coGuardianInvite.service.js';
import {
  ensurePractitionerIntakeFrame,
  listPathwayTemplates
} from '../services/adaptiveIntakeTemplateBootstrap.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

function isBackoffice(role) {
  return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
}

async function assertAgencyAccess(req, agencyId) {
  const user = req.user;
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'super_admin') return true;
  const ua = user.agencies || user.userAgencies || [];
  if (Array.isArray(ua) && ua.some((a) => Number(a.id || a.agency_id) === Number(agencyId))) {
    return true;
  }
  if (Number(user.agencyId) === Number(agencyId)) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, agencyId]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

/** GET /api/public/adaptive-intake/:agencySlug */
export async function getPublicConfig(req, res, next) {
  try {
    const config = await AdaptiveIntake.getAdaptiveIntakeConfig(req.params.agencySlug, req);
    if (!config) return res.status(404).json({ error: { message: 'Organization not found' } });
    res.json(config);
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/adaptive-intake/:agencySlug/quick */
export async function submitQuick(req, res, next) {
  try {
    const result = await AdaptiveIntake.submitQuickProspective({
      agencySlugOrId: req.params.agencySlug,
      payload: req.body || {},
      req
    });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Failed to submit inquiry';
    if (/Organization not found|Name is required/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** POST /api/public/adaptive-intake/:agencySlug/support-inquiry */
export async function submitSupportInquiry(req, res, next) {
  try {
    const result = await AdaptiveIntake.submitSupportInquiry({
      agencySlugOrId: req.params.agencySlug,
      payload: req.body || {}
    });
    res.status(201).json(result);
  } catch (e) {
    const msg = e?.message || 'Failed to send message';
    if (/Organization not found|required/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** PATCH /api/public/adaptive-intake/:agencySlug/landing */
export async function updateJoinLanding(req, res, next) {
  try {
    const config = await AdaptiveIntake.getAdaptiveIntakeConfig(req.params.agencySlug, req, {
      serviceType: req.body?.serviceType || req.query?.serviceType
    });
    if (!config) return res.status(404).json({ error: { message: 'Organization not found' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Only admins can edit this page.' } });
    }
    if (!(await assertAgencyAccess(req, config.agency.id)) && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const result = await AdaptiveIntake.updateJoinLandingCopy({
      agencySlugOrId: req.params.agencySlug,
      serviceType: req.body?.serviceType || config.activeService?.serviceType,
      copy: req.body?.copy || {},
      supportContact: req.body?.supportContact ?? null,
      logoPath: req.body?.logoPath,
      logoUrl: req.body?.logoUrl,
      req
    });
    res.json({
      ok: true,
      copy: result.copy,
      branding: result.branding,
      supportContact: result.supportContact
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/public/adaptive-intake/:agencySlug/providers */
export async function listProviders(req, res, next) {
  try {
    const config = await AdaptiveIntake.getAdaptiveIntakeConfig(req.params.agencySlug, req);
    if (!config) return res.status(404).json({ error: { message: 'Organization not found' } });
    res.json({ providers: config.providerPreview || [] });
  } catch (e) {
    next(e);
  }
}

/** GET /api/client-exchange/adaptive-templates */
export async function getPathwayTemplates(req, res, next) {
  try {
    const templates = await listPathwayTemplates();
    res.json({ templates });
  } catch (e) {
    next(e);
  }
}

/** POST /api/client-exchange/adaptive-bootstrap-frame */
export async function bootstrapPractitionerFrame(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const intakeLinkId = safeInt(req.body?.intakeLinkId);
    const verticalKey = String(req.body?.verticalKey || 'life_coach').trim();
    if (!agencyId || !intakeLinkId) {
      return res.status(400).json({ error: { message: 'agencyId and intakeLinkId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) && !isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const result = await ensurePractitionerIntakeFrame({ agencyId, verticalKey, intakeLinkId });
    res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Bootstrap failed';
    if (/required|not found|No pathway/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** POST /api/client-exchange/adaptive-convert */
export async function convertProspective(req, res, next) {
  try {
    const clientId = safeInt(req.body?.clientId);
    const agencyId = safeInt(req.body?.agencyId);
    if (!clientId || !agencyId) {
      return res.status(400).json({ error: { message: 'clientId and agencyId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) && !isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const result = await AdaptiveIntake.convertProspectiveToFullIntake({
      clientId,
      agencyId,
      intakePublicKey: req.body?.intakePublicKey || null,
      actingUserId: req.user?.id || null,
      sendEmail: req.body?.sendEmail === true || req.body?.sendEmail === 1 || req.body?.sendEmail === '1'
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Conversion failed';
    if (/not found|not available|does not belong|No email|expired|Invalid convert/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** GET /api/public/adaptive-intake/convert-prefill?token= */
export async function getConvertPrefill(req, res, next) {
  try {
    const token = String(req.query?.token || req.params?.token || '').trim();
    const result = await AdaptiveIntake.resolveConvertPrefillToken(token);
    res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Unable to load prefill';
    if (/required|Invalid|not found|does not match|expired/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

async function resolveAgencyFromSlug(slugOrId) {
  const slug = String(slugOrId || '').trim();
  if (!slug) return null;
  if (/^\d+$/.test(slug)) return Agency.findById(Number(slug));
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug));
}

export async function createPublicCoGuardianInvite(req, res, next) {
  try {
    const agency = await resolveAgencyFromSlug(req.params.agencySlug);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found' } });
    const og = req.body?.otherGuardian || req.body || {};
    const source = String(req.body?.source || 'quick').trim().toLowerCase() || 'quick';
    const isSchool = source === 'school';
    // School secondary guardians: record + agency follow-up; do not auto-email until settings are ready.
    const sendEmail = !isSchool && req.body?.sendEmail !== false && og.sendInvite !== false;
    const rights = String(og.hasLegalRights || og.legalAuthority || '').trim().toLowerCase();
    const result = await CoGuardianInvite.maybeCreateFromIntakeGuardian({
      agencyId: agency.id,
      intakeData: {
        guardian: {
          other_guardian_has_legal_rights: rights,
          other_guardian_first_name: og.firstName,
          other_guardian_last_name: og.lastName,
          other_guardian_email: og.email,
          other_guardian_phone: og.phone,
          other_guardian_relationship: og.relationship,
          other_guardian_send_intake_link: sendEmail ? 'yes' : 'no'
        }
      },
      clientIds: req.body?.clientIds || [],
      source,
      publicKey: req.body?.publicKey || null,
      submissionId: req.body?.submissionId || null
    });
    if (!result) {
      return res.status(400).json({
        error: { message: 'The other guardian needs an email or a phone number we can use to collect consent.' }
      });
    }
    return res.status(201).json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Unable to create invite';
    if (/email|dependent|required|not found/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

export async function getPublicCoGuardianInvite(req, res, next) {
  try {
    const invite = await CoGuardianInvite.getPublicCoGuardianInvite(req.params.token);
    return res.json({ ok: true, invite });
  } catch (e) {
    const status = e.statusCode || 400;
    return res.status(status).json({ error: { message: e.message || 'Invite not found' } });
  }
}

export async function acceptPublicCoGuardianInvite(req, res, next) {
  try {
    const result = await CoGuardianInvite.acceptCoGuardianInvite({
      token: req.params.token,
      contact: req.body?.contact || {},
      answers: req.body?.answers || null
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    const status = e.statusCode || 400;
    return res.status(status).json({ error: { message: e.message || 'Unable to accept invite' } });
  }
}

export async function submitCoGuardianQuick(req, res, next) {
  try {
    const contact = req.body?.contact || req.body?.respondent || {};
    const result = await CoGuardianInvite.acceptCoGuardianInvite({
      token: req.params.token,
      contact,
      answers: req.body || null
    });
    return res.json({
      ok: true,
      ...result,
      confirmation: {
        submittedAt: new Date().toISOString(),
        pathway: 'co_guardian_quick',
        summary: {
          whoForLabel: 'Connected dependent(s)',
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          contactEmail: contact.email || result?.portalAccess?.email,
          contactPhone: contact.phone || ''
        },
        portalAccess: result.portalAccess || null,
        isolatedFromOtherGuardian: true
      }
    });
  } catch (e) {
    const status = e.statusCode || 400;
    return res.status(status).json({ error: { message: e.message || 'Unable to save your intake' } });
  }
}

export async function emailPublicPortalLogin(req, res, next) {
  try {
    const agency = await resolveAgencyFromSlug(req.params.agencySlug);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found' } });
    const email = String(req.body?.email || '').trim();
    await CoGuardianInvite.emailPortalLoginInfo({
      to: email,
      agency,
      username: String(req.body?.username || email).trim(),
      temporaryPassword: req.body?.temporaryPassword || req.body?.password || null,
      portalPath: req.body?.portalPath || `/${encodeURIComponent(agency.portal_url || agency.slug || '')}/login`,
      clientId: req.body?.clientId || null
    });
    return res.json({ ok: true });
  } catch (e) {
    const msg = e?.message || 'Unable to email login details';
    if (/email|valid/i.test(msg)) return res.status(400).json({ error: { message: msg } });
    next(e);
  }
}
