import pool from '../config/database.js';
import * as AdaptiveIntake from '../services/adaptiveIntake.service.js';
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
      actingUserId: req.user?.id || null
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Conversion failed';
    if (/not found|not available|does not belong/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}
