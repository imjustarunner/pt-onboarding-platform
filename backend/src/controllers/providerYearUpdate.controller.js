import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/User.model.js';
import * as S from '../services/providerYearUpdate.service.js';
import * as SchoolNeeds from '../services/providerYearUpdateSchoolNeeds.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Soft-attach req.user from Bearer/cookie when present (public routes skip authenticate). */
async function attachUserIfPresent(req) {
  if (req.user?.id) return req.user;
  try {
    let token = null;
    const auth = req.headers.authorization || req.headers.Authorization;
    if (auth && String(auth).startsWith('Bearer ')) {
      token = String(auth).slice(7).trim();
    }
    if (!token && req.cookies?.token) token = req.cookies.token;
    if (!token && req.headers['x-user-authorization']) {
      const raw = String(req.headers['x-user-authorization']);
      token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
    }
    if (!token) return null;
    const decoded = jwt.verify(token, config.jwt.secret);
    const userId = decoded?.id || decoded?.userId;
    if (!userId) return null;
    const user = await User.findById(userId);
    if (!user) return null;
    req.user = user;
    return user;
  } catch {
    return null;
  }
}

function providerDisplayName(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(' ') || row?.email || 'Provider';
}

function actorFromReq(req, body = {}, tokenRow = null) {
  const user = req.user;
  if (user?.id) {
    const role = String(user.role || '').toLowerCase();
    const isAdmin = role === 'super_admin' || role === 'admin' || role === 'support';
    if (tokenRow && Number(user.id) !== Number(tokenRow.provider_user_id) && !isAdmin) {
      // Magic link wins — possession of the token is sufficient.
      return {
        actorType: 'token_guest',
        userId: Number(tokenRow.provider_user_id),
        displayName: providerDisplayName(tokenRow),
      };
    }
    const actorType = isAdmin ? 'admin' : 'provider';
    return {
      actorType,
      userId: user.id,
      displayName:
        [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'User',
    };
  }
  if (tokenRow) {
    return {
      actorType: 'token_guest',
      userId: Number(tokenRow.provider_user_id),
      displayName: providerDisplayName(tokenRow),
    };
  }
  const displayName = String(body.displayName || '').trim();
  if (!displayName) return null;
  return { actorType: 'token_guest', userId: null, displayName };
}

async function assertAgencyAccess(req, agencyId) {
  const user = req.user;
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const ua = user.agencies || user.userAgencies || [];
  if (Array.isArray(ua) && ua.some((a) => Number(a.id || a.agency_id) === Number(agencyId))) {
    return true;
  }
  if (Number(user.agency_id) === Number(agencyId)) return true;
  try {
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, agencyId]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

function isAdminRole(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support';
}

function tokenResponse(tokenRow, cycle) {
  return {
    token: tokenRow.token,
    tokenId: tokenRow.id,
    cycleId: cycle.id,
    schoolYear: cycle.school_year,
    expiresAt: tokenRow.expires_at,
    markedSentAt: tokenRow.marked_sent_at || null,
    path: `/provider-year-update/${tokenRow.token}`,
    urlPath: `/provider-year-update/${tokenRow.token}`,
  };
}

/** GET /api/provider-year-update/report */
export async function getReport(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const report = await S.listAgencyReport(agencyId, schoolYear);
    res.json(report);
  } catch (e) {
    next(e);
  }
}

/** GET /api/provider-year-update/campaign */
export async function getCampaignStatus(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const campaign = await S.getOrCreateCampaign(agencyId, schoolYear);
    res.json({
      agencyId,
      schoolYear,
      status: campaign.status,
      enabledAt: campaign.enabled_at,
      pushedAt: campaign.pushed_at,
      disabledAt: campaign.disabled_at || null,
      isEnabled: S.campaignIsEnabled(campaign),
      isPushed: S.campaignIsPushed(campaign),
      isDisabled: S.campaignIsDisabled(campaign),
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/campaign/enable */
export async function enableCampaign(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const result = await S.enableCampaign({
      agencyId,
      schoolYear,
      userId: req.user?.id,
    });
    res.json({
      ok: true,
      alreadyEnabled: Boolean(result.alreadyEnabled),
      alreadyPushed: Boolean(result.alreadyPushed),
      campaign: {
        status: result.campaign.status,
        enabledAt: result.campaign.enabled_at,
        pushedAt: result.campaign.pushed_at,
        disabledAt: result.campaign.disabled_at || null,
        isEnabled: S.campaignIsEnabled(result.campaign),
        isPushed: S.campaignIsPushed(result.campaign),
        isDisabled: S.campaignIsDisabled(result.campaign),
      },
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/campaign/disable */
export async function disableCampaign(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    try {
      const result = await S.disableCampaign({
        agencyId,
        schoolYear,
        userId: req.user?.id,
      });
      res.json({
        ok: true,
        alreadyDisabled: Boolean(result.alreadyDisabled),
        campaign: {
          status: result.campaign.status,
          enabledAt: result.campaign.enabled_at,
          pushedAt: result.campaign.pushed_at,
          disabledAt: result.campaign.disabled_at || null,
          isEnabled: S.campaignIsEnabled(result.campaign),
          isPushed: S.campaignIsPushed(result.campaign),
          isDisabled: S.campaignIsDisabled(result.campaign),
        },
      });
    } catch (err) {
      if (err?.status === 400) {
        return res.status(400).json({ error: { message: err.message } });
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/providers/:providerUserId/mark-complete */
export async function adminMarkComplete(req, res, next) {
  try {
    const providerUserId = safeInt(req.params.providerUserId);
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({
        error: { message: 'agencyId and providerUserId are required' },
      });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const cycle = await S.adminMarkComplete({
      agencyId,
      providerUserId,
      schoolYear,
      userId: req.user?.id,
    });
    res.json({
      ok: true,
      providerUserId,
      cycleId: cycle.id,
      status: cycle.status,
      finalizedAt: cycle.finalized_at,
      adminCompletedAt: cycle.admin_completed_at,
      isPushed: false,
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/campaign/push */
export async function pushCampaign(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const result = await S.pushCampaign({
      agencyId,
      schoolYear,
      userId: req.user?.id,
    });
    res.json({
      ok: true,
      providersReady: result.providersReady,
      tokensCreated: result.tokensCreated,
      providerCount: result.providerCount,
      campaign: {
        status: result.campaign.status,
        enabledAt: result.campaign.enabled_at,
        pushedAt: result.campaign.pushed_at,
        isEnabled: true,
        isPushed: true,
      },
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/providers/:providerUserId/push */
export async function pushProvider(req, res, next) {
  try {
    const providerUserId = safeInt(req.params.providerUserId);
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({
        error: { message: 'agencyId and providerUserId are required' },
      });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    try {
      const result = await S.pushProvider({
        agencyId,
        providerUserId,
        schoolYear,
        userId: req.user?.id,
      });
      res.json({
        ok: true,
        alreadyPushed: Boolean(result.alreadyPushed),
        providerUserId,
        cycleId: result.cycle?.id || null,
        pushedAt: result.cycle?.pushed_at || null,
        isPushed: true,
        campaign: {
          status: result.campaign?.status,
          isEnabled: S.campaignIsEnabled(result.campaign),
          isPushed: S.campaignIsPushed(result.campaign),
          pushedAt: result.campaign?.pushed_at || null,
        },
      });
    } catch (err) {
      if (err?.status === 400) {
        return res.status(400).json({ error: { message: err.message } });
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/tokens */
export async function generateToken(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const providerUserId = safeInt(req.body?.providerUserId);
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    if (!agencyId || !providerUserId) {
      return res.status(400).json({
        error: { message: 'agencyId and providerUserId are required' },
      });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const campaign = await S.getCampaign(agencyId, schoolYear);
    if (!S.campaignIsEnabled(campaign)) {
      return res.status(400).json({
        error: { message: 'Enable Provider Year Update first before generating tokens.' },
      });
    }
    const { cycle, tokenRow, created } = await S.ensureShareableToken({
      agencyId,
      providerUserId,
      schoolYear,
      createdByUserId: req.user?.id,
    });
    res.status(created ? 201 : 200).json({ ...tokenResponse(tokenRow, cycle), created });
  } catch (e) {
    next(e);
  }
}

/** PATCH /api/provider-year-update/tokens/:tokenId/mark-sent */
export async function markTokenSent(req, res, next) {
  try {
    const tokenId = safeInt(req.params.tokenId);
    const sent = req.body?.sent !== false;
    if (!tokenId) return res.status(400).json({ error: { message: 'tokenId required' } });
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      `SELECT * FROM provider_year_update_tokens WHERE id = ? LIMIT 1`,
      [tokenId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Token not found' } });
    if (!(await assertAgencyAccess(req, row.agency_id)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await S.markTokenSent(tokenId, req.user?.id, sent);
    res.json({ ok: true, tokenId, markedSent: sent });
  } catch (e) {
    next(e);
  }
}

/** GET /api/provider-year-update/providers/:providerUserId */
export async function getProviderBundle(req, res, next) {
  try {
    const providerUserId = safeInt(req.params.providerUserId);
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({
        error: { message: 'agencyId and providerUserId are required' },
      });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const campaign = await S.getCampaign(agencyId, schoolYear);
    if (!S.campaignIsEnabled(campaign)) {
      return res.status(400).json({
        error: { message: 'Enable Provider Year Update first.' },
      });
    }
    const { cycle, tokenRow } = await S.ensureShareableToken({
      agencyId,
      providerUserId,
      schoolYear,
      createdByUserId: req.user?.id,
    });
    const payload = await S.buildDashboardPayload(cycle);
    res.json({
      ...payload,
      shareToken: tokenResponse(tokenRow, cycle),
      campaign: {
        status: campaign.status,
        isEnabled: true,
        isPushed: S.campaignIsPushed(campaign),
      },
      actorType: 'admin',
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/provider-year-update/me */
export async function getMyCycle(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const status = await S.getMyStatus({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    if (!status.available) {
      return res.json(status);
    }
    const cycle = await S.getCycleById(status.cycle.id);
    const payload = await S.buildDashboardPayload(cycle);
    await S.recordViewEvent({
      cycleId: cycle.id,
      userId: req.user.id,
      actorDisplayName:
        [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || req.user.email || null,
      eventType: 'dashboard_view',
    });
    res.json({
      ...status,
      ...payload,
      actorType: 'provider',
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/provider-year-update/me/status — lightweight for My Dashboard */
export async function getMyStatus(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const status = await S.getMyStatus({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    res.json(status);
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/me/ensure-token */
export async function ensureMyToken(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const status = await S.getMyStatus({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    if (!status.available) {
      return res.status(400).json({
        error: {
          message:
            status.reason === 'not_pushed'
              ? 'Provider Year Update has not been pushed yet.'
              : 'Provider Year Update is not available.',
        },
      });
    }
    const { cycle, tokenRow, created } = await S.ensureShareableToken({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
      createdByUserId: req.user.id,
    });
    res.status(created ? 201 : 200).json({ ...tokenResponse(tokenRow, cycle), created });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/me/dismiss */
export async function dismissMyCycle(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const cycle = await S.getOrCreateCycle({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    await S.dismissForUser(cycle.id, req.user.id, req.body?.dismissUntil || null);
    res.json({ ok: true, cycleId: cycle.id });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/provider-year-update/me/sections/:sectionKey */
export async function updateMySection(req, res, next) {
  try {
    const sectionKey = String(req.params.sectionKey || '').trim();
    const agencyId = safeInt(req.body?.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!S.SECTION_KEYS.includes(sectionKey)) {
      return res.status(400).json({ error: { message: 'Invalid section_key' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const cycle = await S.getOrCreateCycle({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    if (cycle.status === 'finalized') {
      return res.status(400).json({ error: { message: 'Cycle is finalized' } });
    }
    const actor = actorFromReq(req);
    const sections = await S.upsertSectionProgress({
      cycleId: cycle.id,
      sectionKey,
      data: req.body?.data,
      reviewed: Boolean(req.body?.reviewed),
      completed: req.body?.completed !== undefined ? Boolean(req.body.completed) : undefined,
      actor,
    });
    await S.recordViewEvent({
      cycleId: cycle.id,
      userId: req.user.id,
      actorDisplayName: actor?.displayName,
      sectionKey,
      eventType: 'section_open',
    });
    res.json({ ok: true, sections });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/me/finalize */
export async function finalizeMyCycle(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId) || safeInt(req.user?.agency_id);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const cycle = await S.getOrCreateCycle({
      agencyId,
      providerUserId: req.user.id,
      schoolYear,
    });
    const actor = actorFromReq(req);
    const finalized = await S.finalizeCycle({ cycleId: cycle.id, actor });
    const payload = await S.buildDashboardPayload(finalized);
    res.json({ ok: true, cycle: payload.cycle, ...payload });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('not reviewed') || msg.includes('not completed') || msg.includes('Already')) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** GET /api/public/provider-year-update/:token */
export async function getPublicByToken(req, res, next) {
  try {
    const { valid, reason, row } = await S.validateToken(req.params.token);
    if (!valid && reason !== 'expired') {
      if (!row || row.cycle_status !== 'finalized') {
        return res.status(404).json({ error: { message: 'Invalid or expired link', reason } });
      }
    }
    if (!row) return res.status(404).json({ error: { message: 'Invalid link' } });

    const campaign = await S.getCampaign(row.agency_id, row.school_year);
    if (S.campaignIsDisabled(campaign)) {
      return res.status(410).json({
        error: {
          message: 'Provider Year Update is disabled for this school year.',
          reason: 'campaign_disabled',
        },
      });
    }

    await S.recordTokenClick(row, providerDisplayName(row));
    await attachUserIfPresent(req);
    const user = req.user;

    const cycle = await S.getCycleById(row.cycle_id);
    const payload = await S.buildDashboardPayload(cycle);
    await S.recordViewEvent({
      cycleId: cycle.id,
      tokenId: row.id,
      userId: user?.id || Number(row.provider_user_id),
      actorDisplayName: user
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
        : providerDisplayName(row),
      eventType: 'view',
    });
    res.json({
      requiresLogin: false,
      identityRequired: false,
      actorType: 'token_guest',
      providerName: providerDisplayName(row),
      ...payload,
      shareToken: tokenResponse(row, cycle),
      tokenLocked: Boolean(row.locked_at) || cycle.status === 'finalized',
      campaign: campaign
        ? {
            status: campaign.status,
            isEnabled: S.campaignIsEnabled(campaign),
            isPushed: S.campaignIsPushed(campaign),
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/public/provider-year-update/:token/sections/:sectionKey */
export async function updatePublicSection(req, res, next) {
  try {
    const { valid, reason, row } = await S.validateToken(req.params.token);
    if (!valid && reason !== 'expired') {
      if (!row || row.cycle_status !== 'finalized') {
        return res.status(404).json({ error: { message: 'Invalid or expired link', reason } });
      }
    }
    if (!row) return res.status(404).json({ error: { message: 'Invalid link' } });
    await attachUserIfPresent(req);
    const actor = actorFromReq(req, req.body, row);
    if (!actor) {
      return res.status(400).json({ error: { message: 'Could not identify provider for this link' } });
    }
    const cycle = await S.getCycleById(row.cycle_id);
    if (cycle.status === 'finalized' || row.locked_at) {
      return res.status(400).json({ error: { message: 'This Year Update is locked' } });
    }
    const sectionKey = String(req.params.sectionKey || '').trim();
    if (!S.SECTION_KEYS.includes(sectionKey)) {
      return res.status(400).json({ error: { message: 'Invalid section_key' } });
    }
    const sections = await S.upsertSectionProgress({
      cycleId: cycle.id,
      sectionKey,
      data: req.body?.data,
      reviewed: Boolean(req.body?.reviewed),
      completed: req.body?.completed !== undefined ? Boolean(req.body.completed) : undefined,
      actor,
    });
    res.json({ ok: true, sections });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/provider-year-update/:token/finalize */
export async function finalizePublic(req, res, next) {
  try {
    const { valid, reason, row } = await S.validateToken(req.params.token);
    if (!valid && reason !== 'expired') {
      if (!row || row.cycle_status !== 'finalized') {
        return res.status(404).json({ error: { message: 'Invalid or expired link', reason } });
      }
    }
    if (!row) return res.status(404).json({ error: { message: 'Invalid link' } });
    await attachUserIfPresent(req);
    const actor = actorFromReq(req, req.body, row);
    if (!actor) {
      return res.status(400).json({ error: { message: 'Could not identify provider for this link' } });
    }
    const finalized = await S.finalizeCycle({ cycleId: row.cycle_id, actor });
    const payload = await S.buildDashboardPayload(finalized);
    res.json({ ok: true, ...payload });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('not reviewed') || msg.includes('not completed') || msg.includes('Already')) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

function schoolNeedsHttpError(res, e) {
  const code = e?.code || '';
  if (
    code === 'SCHOOL_NEEDS_INVALID_SCHOOL' ||
    code === 'SCHOOL_NEED_INVALID_STATUS' ||
    code === 'SCHOOL_NEED_APP_INVALID_STATUS' ||
    code === 'SCHOOL_NEED_DAY_REQUIRED' ||
    code === 'SCHOOL_NEED_NOT_OPEN'
  ) {
    return res.status(400).json({ error: { message: e.message, code } });
  }
  if (code === 'SCHOOL_NEED_NOT_FOUND' || code === 'SCHOOL_NEED_APP_NOT_FOUND') {
    return res.status(404).json({ error: { message: e.message, code } });
  }
  return null;
}

/** GET /api/provider-year-update/school-needs/schools */
export async function listSchoolNeedsSchools(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schools = await SchoolNeeds.listSchoolsForNeedsPicker(agencyId);
    res.json({ schools });
  } catch (e) {
    next(e);
  }
}

/** GET /api/provider-year-update/school-needs */
export async function listSchoolNeedsAdmin(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    const schoolYear = String(req.query.schoolYear || '').trim();
    if (!agencyId || !schoolYear) {
      return res.status(400).json({ error: { message: 'agencyId and schoolYear are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const needs = await SchoolNeeds.listNeedsForAdmin({ agencyId, schoolYear });
    res.json({ needs });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/school-needs */
export async function createSchoolNeed(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const schoolYear = String(req.body?.schoolYear || '').trim();
    const schoolOrganizationId = safeInt(req.body?.schoolOrganizationId);
    if (!agencyId || !schoolYear || !schoolOrganizationId) {
      return res.status(400).json({
        error: { message: 'agencyId, schoolYear, and schoolOrganizationId are required' },
      });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const need = await SchoolNeeds.createNeed({
      agencyId,
      schoolYear,
      schoolOrganizationId,
      title: req.body?.title,
      body: req.body?.body,
      slotsNeeded: req.body?.slotsNeeded,
      days: req.body?.days,
      postedByUserId: req.user?.id,
    });
    res.status(201).json({ need });
  } catch (e) {
    if (schoolNeedsHttpError(res, e)) return;
    next(e);
  }
}

/** PATCH /api/provider-year-update/school-needs/:id */
export async function updateSchoolNeed(req, res, next) {
  try {
    const needId = safeInt(req.params.id);
    const agencyId = safeInt(req.body?.agencyId || req.query?.agencyId);
    if (!needId || !agencyId) {
      return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const need = await SchoolNeeds.updateNeed({
      needId,
      agencyId,
      patch: {
        title: req.body?.title,
        body: req.body?.body,
        slotsNeeded: req.body?.slotsNeeded,
        days: req.body?.days,
        status: req.body?.status,
      },
    });
    res.json({ need });
  } catch (e) {
    if (schoolNeedsHttpError(res, e)) return;
    next(e);
  }
}

/** GET /api/provider-year-update/school-needs/:id/applications */
export async function listSchoolNeedApplications(req, res, next) {
  try {
    const needId = safeInt(req.params.id);
    const agencyId = safeInt(req.query.agencyId);
    if (!needId || !agencyId) {
      return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const applications = await SchoolNeeds.listApplicationsForNeed({ needId, agencyId });
    res.json({ applications });
  } catch (e) {
    if (schoolNeedsHttpError(res, e)) return;
    next(e);
  }
}

/** PATCH /api/provider-year-update/school-needs/applications/:id */
export async function reviewSchoolNeedApplication(req, res, next) {
  try {
    const applicationId = safeInt(req.params.id);
    const agencyId = safeInt(req.body?.agencyId);
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!applicationId || !agencyId || !status) {
      return res.status(400).json({ error: { message: 'id, agencyId, and status are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId)) || !isAdminRole(req.user)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const application = await SchoolNeeds.reviewApplication({
      applicationId,
      agencyId,
      status,
      reviewedByUserId: req.user?.id,
    });
    res.json({ application });
  } catch (e) {
    if (schoolNeedsHttpError(res, e)) return;
    next(e);
  }
}

/** GET /api/provider-year-update/me/school-needs */
export async function listMySchoolNeeds(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    const schoolYear = String(req.query.schoolYear || '').trim();
    if (!agencyId || !schoolYear) {
      return res.status(400).json({ error: { message: 'agencyId and schoolYear are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const needs = await SchoolNeeds.listOpenNeedsForProvider({
      agencyId,
      schoolYear,
      providerUserId: req.user.id,
    });
    res.json({ needs });
  } catch (e) {
    next(e);
  }
}

/** POST /api/provider-year-update/me/school-needs/:id/apply */
export async function applyMySchoolNeed(req, res, next) {
  try {
    const needId = safeInt(req.params.id);
    const agencyId = safeInt(req.body?.agencyId);
    if (!needId || !agencyId) {
      return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const need = await SchoolNeeds.applyToNeed({
      needId,
      providerUserId: req.user.id,
      preferredDay: req.body?.preferredDay,
      notes: req.body?.notes,
    });
    res.json({ need });
  } catch (e) {
    if (schoolNeedsHttpError(res, e)) return;
    next(e);
  }
}

/** DELETE /api/provider-year-update/me/school-needs/:id/apply */
export async function withdrawMySchoolNeed(req, res, next) {
  try {
    const needId = safeInt(req.params.id);
    const agencyId = safeInt(req.query.agencyId || req.body?.agencyId);
    if (!needId || !agencyId) {
      return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const ok = await SchoolNeeds.withdrawApplication({
      needId,
      providerUserId: req.user.id,
    });
    res.json({ ok });
  } catch (e) {
    next(e);
  }
}
