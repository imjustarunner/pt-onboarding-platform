import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import * as S from '../services/schoolReinit.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function actorFromReq(req, body = {}) {
  const user = req.user;
  if (user?.id) {
    const role = String(user.role || '');
    const actorType =
      role === 'school_staff' ? 'school_staff' : role === 'super_admin' || role.includes('admin') ? 'admin' : 'school_staff';
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.email ||
      body.displayName ||
      'Staff';
    return { actorType, userId: user.id, displayName };
  }
  const displayName = String(body.displayName || body.identityName || '').trim();
  if (!displayName) return null;
  return {
    actorType: 'token_guest',
    userId: null,
    displayName,
    title: String(body.identityTitle || body.title || '').trim() || null,
  };
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

async function assertSchoolStaffForOrg(req, schoolOrganizationId) {
  const user = req.user;
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role !== 'school_staff' && role !== 'super_admin' && role !== 'admin' && role !== 'support') {
    return false;
  }
  if (role === 'super_admin') return true;
  if (Number(user.organization_id) === Number(schoolOrganizationId)) return true;
  const ua = user.agencies || [];
  if (ua.some((a) => Number(a.id || a.agency_id) === Number(schoolOrganizationId))) return true;
  try {
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, schoolOrganizationId]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

function parseSnapshot(cycle) {
  if (!cycle) return null;
  const snap = S.parseJsonField(cycle.snapshot_json);
  return {
    ...cycle,
    snapshot: snap,
  };
}

/** GET /api/school-reinit/report?agencyId=&schoolYear= */
export async function getReport(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const report = await S.listAgencyReport(agencyId, schoolYear);
    res.json(report);
  } catch (e) {
    next(e);
  }
}

function tokenResponse(tokenRow, cycle) {
  return {
    token: tokenRow.token,
    tokenId: tokenRow.id,
    cycleId: cycle.id,
    schoolYear: cycle.school_year,
    expiresAt: tokenRow.expires_at,
    markedSentAt: tokenRow.marked_sent_at || null,
    path: `/school-reinit/${tokenRow.token}`,
    urlPath: `/school-reinit/${tokenRow.token}`,
  };
}

/** POST /api/school-reinit/tokens — generate token (or ensure existing when ensure=true) */
export async function generateToken(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const schoolOrganizationId = safeInt(req.body?.schoolOrganizationId);
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    if (!agencyId || !schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'agencyId and schoolOrganizationId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const ok = await S.assertSchoolAffiliated(agencyId, schoolOrganizationId);
    if (!ok) return res.status(400).json({ error: { message: 'School is not affiliated with this agency' } });

    const campaign = await S.getCampaign(agencyId, schoolYear);
    if (!S.campaignIsEnabled(campaign)) {
      return res.status(400).json({
        error: { message: 'Enable Year Update first, then set questions before generating tokens.' },
      });
    }

    if (req.body?.ensure !== false) {
      const { cycle, tokenRow, created } = await S.ensureShareableToken({
        agencyId,
        schoolOrganizationId,
        schoolYear,
        createdByUserId: req.user?.id,
      });
      return res.status(created ? 201 : 200).json({ ...tokenResponse(tokenRow, cycle), created });
    }

    const cycle = await S.getOrCreateCycle({ agencyId, schoolOrganizationId, schoolYear });
    await S.ensureDefaultQuestions(agencyId, schoolYear);
    const tokenRow = await S.createToken({
      cycleId: cycle.id,
      agencyId,
      schoolOrganizationId,
      createdByUserId: req.user?.id,
      expiresAt: req.body?.expiresAt || null,
    });
    res.status(201).json({ ...tokenResponse(tokenRow, cycle), created: true });
  } catch (e) {
    next(e);
  }
}

/** GET /api/school-reinit/schools/:schoolOrganizationId?agencyId= — admin open collaborative UI */
export async function getSchoolBundle(req, res, next) {
  try {
    const schoolOrganizationId = safeInt(req.params.schoolOrganizationId);
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId || !schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'agencyId and schoolOrganizationId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const ok = await S.assertSchoolAffiliated(agencyId, schoolOrganizationId);
    if (!ok) return res.status(400).json({ error: { message: 'School is not affiliated with this agency' } });

    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const campaign = await S.getCampaign(agencyId, schoolYear);
    if (!S.campaignIsEnabled(campaign)) {
      return res.status(400).json({
        error: { message: 'Enable Year Update first before opening the collaborative interface.' },
      });
    }
    const { cycle, tokenRow } = await S.ensureShareableToken({
      agencyId,
      schoolOrganizationId,
      schoolYear,
      createdByUserId: req.user?.id,
    });
    const payload = await buildDashboardPayload(cycle);
    res.json({
      ...payload,
      shareToken: tokenResponse(tokenRow, cycle),
      campaign: {
        status: campaign.status,
        isEnabled: true,
        isPushed: S.campaignIsPushed(campaign),
      },
      actorType: 'admin',
      windowOpen: S.campaignIsPushed(campaign),
      splashEnabled: S.campaignIsPushed(campaign),
      showReceiptButton: S.canShowReceiptButton(cycle),
    });
  } catch (e) {
    next(e);
  }
}

/** PATCH /api/school-reinit/tokens/:tokenId/mark-sent */
export async function markTokenSent(req, res, next) {
  try {
    const tokenId = safeInt(req.params.tokenId);
    const sent = req.body?.sent !== false;
    if (!tokenId) return res.status(400).json({ error: { message: 'tokenId required' } });

    const [rows] = await (await import('../config/database.js')).default.execute(
      `SELECT * FROM school_reinit_tokens WHERE id = ? LIMIT 1`,
      [tokenId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Token not found' } });
    if (!(await assertAgencyAccess(req, row.agency_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await S.markTokenSent(tokenId, req.user?.id, sent);
    res.json({ ok: true, tokenId, markedSent: sent });
  } catch (e) {
    next(e);
  }
}

/** GET /api/school-reinit/questions?agencyId=&schoolYear= */
export async function getQuestions(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const campaign = await S.getCampaign(agencyId, schoolYear);
    // Seed only after Enable Year Update (listQuestionConfigs seeds when empty).
    let questions = [];
    if (S.campaignIsEnabled(campaign)) {
      questions = await S.listQuestionConfigs(agencyId, schoolYear);
    }
    res.json({
      agencyId,
      schoolYear,
      questions,
      campaignEnabled: S.campaignIsEnabled(campaign),
    });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/school-reinit/questions/:questionKey */
export async function updateQuestion(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const questionKey = String(req.params.questionKey || '').trim();
    if (!agencyId || !questionKey) {
      return res.status(400).json({ error: { message: 'agencyId and questionKey are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await S.ensureDefaultQuestions(agencyId, schoolYear);
    const row = await S.upsertQuestionConfig(agencyId, schoolYear, questionKey, req.body || {});
    res.json({ question: row });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/questions/reset */
export async function resetQuestions(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const questions = await S.resetQuestionConfigs(agencyId, schoolYear);
    res.json({ agencyId, schoolYear, questions });
  } catch (e) {
    next(e);
  }
}

/** GET /api/school-reinit/cycles/:cycleId */
export async function getCycleDetail(req, res, next) {
  try {
    const cycleId = safeInt(req.params.cycleId);
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertAgencyAccess(req, cycle.agency_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const sections = await S.getSectionProgress(cycleId);
    const changeRequests = await S.listChangeRequests(cycleId);
    const addendums = await S.listAddendums(cycleId);
    const providers = await S.loadProvidersForSchool(cycle.school_organization_id);
    const staff = await S.loadSchoolStaff(cycle.school_organization_id);
    const events = await S.loadSchoolEventsContext(
      cycle.agency_id,
      cycle.school_organization_id,
      cycle.school_year
    );
    const questions = await S.listQuestionConfigs(cycle.agency_id, cycle.school_year);
    const slots = await S.listCheckinSlots(cycle.agency_id, cycle.school_year);
    const viewEvents = await S.listViewEvents(cycleId, 40);
    res.json({
      cycle: parseSnapshot(cycle),
      sections,
      changeRequests,
      addendums,
      providers,
      staff,
      events,
      questions: questions.filter((q) => q.enabled),
      checkinSlots: slots,
      viewEvents,
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/change-requests/:id/resolve */
export async function resolveChangeRequest(req, res, next) {
  try {
    const requestId = safeInt(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();
    const [rows] = await (await import('../config/database.js')).default.execute(
      `SELECT cr.*, c.agency_id FROM school_reinit_change_requests cr
       JOIN school_reinit_cycles c ON c.id = cr.cycle_id
       WHERE cr.id = ? LIMIT 1`,
      [requestId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertAgencyAccess(req, row.agency_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const updated = await S.resolveChangeRequest({
      requestId,
      status,
      resolvedByUserId: req.user?.id,
      note: req.body?.note || null,
    });
    res.json({ changeRequest: updated });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/checkin-slots */
export async function createCheckinSlot(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const startsAt = req.body?.startsAt;
    if (!agencyId || !startsAt) {
      return res.status(400).json({ error: { message: 'agencyId and startsAt are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const pool = (await import('../config/database.js')).default;
    const [result] = await pool.execute(
      `INSERT INTO school_reinit_checkin_slots
        (agency_id, school_year, starts_at, ends_at, label, capacity, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        agencyId,
        schoolYear,
        startsAt,
        req.body?.endsAt || null,
        req.body?.label || null,
        Number(req.body?.capacity) || 20,
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM school_reinit_checkin_slots WHERE id = ?`, [
      result.insertId,
    ]);
    res.status(201).json({ slot: rows[0] });
  } catch (e) {
    next(e);
  }
}

/** GET /api/school-reinit/checkin-slots?agencyId=&schoolYear= */
export async function listCheckinSlotsAdmin(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.query.schoolYear || S.currentSchoolYear());
    const slots = await S.listCheckinSlots(agencyId, schoolYear);
    res.json({ slots });
  } catch (e) {
    next(e);
  }
}

// ─── School staff authenticated ─────────────────────────────────────────────

/** GET /api/school-reinit/me?schoolOrganizationId= */
export async function getMyCycle(req, res, next) {
  try {
    const schoolOrganizationId = safeInt(req.query.schoolOrganizationId);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId is required' } });
    }
    if (!(await assertSchoolStaffForOrg(req, schoolOrganizationId))) {
      // Also allow agency admins previewing
      const agencyId = safeInt(req.query.agencyId);
      if (!agencyId || !(await assertAgencyAccess(req, agencyId))) {
        return res.status(403).json({ error: { message: 'Forbidden' } });
      }
    }

    // Resolve agency via affiliation
    let agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      const parents = await OrganizationAffiliation.listActiveAgenciesForOrganization?.(schoolOrganizationId);
      if (parents?.length) agencyId = Number(parents[0].id || parents[0].agency_id);
    }
    if (!agencyId) {
      // Try reverse: find affiliation where school is org
      const pool = (await import('../config/database.js')).default;
      const [aff] = await pool.execute(
        `SELECT agency_id FROM organization_affiliations
         WHERE organization_id = ? AND is_active = 1
         LIMIT 1`,
        [schoolOrganizationId]
      ).catch(() => [[]]);
      agencyId = safeInt(aff?.[0]?.agency_id);
    }
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Could not resolve agency for school' } });
    }

    const schoolYear = S.currentSchoolYear();
    const campaign = await S.getCampaign(agencyId, schoolYear);
    const isPushed = S.campaignIsPushed(campaign);

    // Until the tenant pushes the year update, school staff do not get the splash/workflow.
    if (!isPushed) {
      return res.json({
        campaign: {
          status: campaign?.status || 'draft',
          isEnabled: S.campaignIsEnabled(campaign),
          isPushed: false,
        },
        splashEnabled: false,
        windowOpen: false,
        showReceiptButton: false,
        dismissed: false,
        cycle: null,
        actorType: 'school_staff',
      });
    }

    const cycle = await S.getOrCreateCycle({ agencyId, schoolOrganizationId, schoolYear });
    await S.ensureDefaultQuestions(agencyId, schoolYear);

    if (req.user?.id) {
      await S.recordViewEvent({
        cycleId: cycle.id,
        userId: req.user.id,
        actorDisplayName: [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || req.user.email,
        eventType: 'view',
      });
    }

    const dismissal = req.user?.id ? await S.getDismissal(cycle.id, req.user.id) : null;
    const dismissed =
      dismissal &&
      (!dismissal.dismiss_until || new Date(dismissal.dismiss_until).getTime() > Date.now());

    const { tokenRow } = await S.ensureShareableToken({
      agencyId,
      schoolOrganizationId,
      schoolYear,
      createdByUserId: req.user?.id,
    });

    const payload = await buildDashboardPayload(cycle);
    res.json({
      ...payload,
      shareToken: tokenResponse(tokenRow, cycle),
      campaign: {
        status: campaign.status,
        isEnabled: true,
        isPushed: true,
        pushedAt: campaign.pushed_at,
      },
      splashEnabled: true,
      windowOpen: true,
      showReceiptButton: S.canShowReceiptButton(cycle),
      dismissed: Boolean(dismissed),
      actorType: 'school_staff',
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/me/ensure-token */
export async function ensureMyToken(req, res, next) {
  try {
    const schoolOrganizationId = safeInt(req.body?.schoolOrganizationId);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId is required' } });
    }
    if (!(await assertSchoolStaffForOrg(req, schoolOrganizationId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    let agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) {
      const pool = (await import('../config/database.js')).default;
      const [aff] = await pool.execute(
        `SELECT agency_id FROM organization_affiliations
         WHERE organization_id = ? AND is_active = 1 LIMIT 1`,
        [schoolOrganizationId]
      );
      agencyId = safeInt(aff?.[0]?.agency_id);
    }
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Could not resolve agency for school' } });
    }
    const schoolYear = S.currentSchoolYear();
    const campaign = await S.getCampaign(agencyId, schoolYear);
    if (!S.campaignIsPushed(campaign)) {
      return res.status(400).json({ error: { message: 'Year update has not been pushed yet' } });
    }
    const { cycle, tokenRow, created } = await S.ensureShareableToken({
      agencyId,
      schoolOrganizationId,
      schoolYear,
      createdByUserId: req.user?.id,
    });
    res.status(created ? 201 : 200).json({ ...tokenResponse(tokenRow, cycle), created });
  } catch (e) {
    next(e);
  }
}

/** GET /api/school-reinit/campaign?agencyId=&schoolYear= */
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
      campaign: {
        status: campaign.status,
        enabledAt: campaign.enabled_at,
        pushedAt: campaign.pushed_at,
        isEnabled: S.campaignIsEnabled(campaign),
        isPushed: S.campaignIsPushed(campaign),
      },
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/campaign/enable — Enable Year Update */
export async function enableCampaign(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const result = await S.enableCampaign({
      agencyId,
      schoolYear,
      userId: req.user?.id,
    });
    res.json({
      agencyId,
      schoolYear,
      campaign: {
        status: result.campaign.status,
        enabledAt: result.campaign.enabled_at,
        pushedAt: result.campaign.pushed_at,
        isEnabled: S.campaignIsEnabled(result.campaign),
        isPushed: S.campaignIsPushed(result.campaign),
      },
      alreadyEnabled: Boolean(result.alreadyEnabled),
      alreadyPushed: Boolean(result.alreadyPushed),
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/campaign/push — Push to Schools */
export async function pushCampaign(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const schoolYear = String(req.body?.schoolYear || S.currentSchoolYear());
    const result = await S.pushCampaign({
      agencyId,
      schoolYear,
      userId: req.user?.id,
    });
    res.json({
      agencyId,
      schoolYear,
      campaign: {
        status: result.campaign.status,
        enabledAt: result.campaign.enabled_at,
        pushedAt: result.campaign.pushed_at,
        isEnabled: true,
        isPushed: true,
      },
      schoolsReady: result.schoolsReady,
      tokensCreated: result.tokensCreated,
      schoolCount: result.schoolCount,
    });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/me/dismiss */
export async function dismissMyCycle(req, res, next) {
  try {
    const cycleId = safeInt(req.body?.cycleId);
    if (!cycleId || !req.user?.id) {
      return res.status(400).json({ error: { message: 'cycleId required' } });
    }
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertSchoolStaffForOrg(req, cycle.school_organization_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    // Dismiss until end of day
    const until = new Date();
    until.setHours(23, 59, 59, 999);
    await S.dismissForUser(cycleId, req.user.id, until.toISOString().slice(0, 19).replace('T', ' '));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

async function buildDashboardPayload(cycle) {
  const sections = await S.getSectionProgress(cycle.id);
  const providers = await S.loadProvidersForSchool(cycle.school_organization_id);
  const staff = await S.loadSchoolStaff(cycle.school_organization_id);
  const events = await S.loadSchoolEventsContext(
    cycle.agency_id,
    cycle.school_organization_id,
    cycle.school_year
  );
  const questions = (await S.listQuestionConfigs(cycle.agency_id, cycle.school_year)).filter(
    (q) => q.enabled
  );
  const slots = await S.listCheckinSlots(cycle.agency_id, cycle.school_year);
  const changeRequests = await S.listChangeRequests(cycle.id);
  const addendums = cycle.status === 'finalized' ? await S.listAddendums(cycle.id) : [];

  const pool = (await import('../config/database.js')).default;
  const [agencyRows] = await pool.execute(
    `SELECT id, name, logo_url, logo_path, color_palette FROM agencies WHERE id = ? LIMIT 1`,
    [cycle.agency_id]
  );
  const [schoolRows] = await pool.execute(
    `SELECT id, name, logo_url, logo_path, portal_url, slug FROM agencies WHERE id = ? LIMIT 1`,
    [cycle.school_organization_id]
  );

  return {
    cycle: parseSnapshot(cycle),
    sections,
    providers,
    staff,
    events,
    questions,
    checkinSlots: slots,
    changeRequests,
    addendums,
    agency: agencyRows?.[0] || null,
    school: schoolRows?.[0] || null,
    sectionKeys: S.SECTION_KEYS,
  };
}

async function mutateSection(req, res, next, cycleResolver) {
  try {
    const cycle = await cycleResolver();
    if (!cycle) return res.status(404).json({ error: { message: 'Cycle not found' } });
    if (cycle.status === 'finalized') {
      return res.status(400).json({ error: { message: 'Cycle is finalized; use addendum' } });
    }
    const actor = actorFromReq(req, req.body);
    if (!actor) {
      return res.status(400).json({ error: { message: 'Identity (displayName) is required' } });
    }
    const sectionKey = String(req.params.sectionKey || req.body?.sectionKey || '').trim();
    const sections = await S.upsertSectionProgress({
      cycleId: cycle.id,
      sectionKey,
      data: req.body?.data,
      reviewed: Boolean(req.body?.reviewed),
      completed: req.body?.completed !== undefined ? Boolean(req.body.completed) : undefined,
      actor,
    });
    res.json({ sections });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/school-reinit/me/sections/:sectionKey */
export async function updateMySection(req, res, next) {
  return mutateSection(req, res, next, async () => {
    const cycleId = safeInt(req.body?.cycleId);
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return null;
    if (!(await assertSchoolStaffForOrg(req, cycle.school_organization_id))) return null;
    return cycle;
  });
}

/** POST /api/school-reinit/me/change-requests */
export async function submitMyChangeRequest(req, res, next) {
  try {
    const cycleId = safeInt(req.body?.cycleId);
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return res.status(404).json({ error: { message: 'Not found' } });
    if (cycle.status === 'finalized') {
      return res.status(400).json({ error: { message: 'Use addendum after finalization' } });
    }
    if (!(await assertSchoolStaffForOrg(req, cycle.school_organization_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const actor = actorFromReq(req, req.body);
    if (!actor) return res.status(400).json({ error: { message: 'Identity required' } });

    const action = String(req.body?.action || '').toLowerCase();
    const entityType = String(req.body?.entityType || '');

    if (action === 'add') {
      const created = await S.applyAddition({
        entityType,
        payload: req.body?.payload || {},
        schoolOrganizationId: cycle.school_organization_id,
      });
      return res.status(201).json({ applied: true, created });
    }

    const cr = await S.createChangeRequest({
      cycleId,
      entityType,
      entityId: safeInt(req.body?.entityId),
      action,
      beforeJson: req.body?.before || null,
      afterJson: req.body?.after || null,
      actor,
    });
    res.status(201).json({ changeRequest: cr });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/me/finalize */
export async function finalizeMyCycle(req, res, next) {
  try {
    const cycleId = safeInt(req.body?.cycleId);
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertSchoolStaffForOrg(req, cycle.school_organization_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const actor = actorFromReq(req, req.body);
    const finalized = await S.finalizeCycle({ cycleId, actor });
    res.json({ cycle: parseSnapshot(finalized) });
  } catch (e) {
    next(e);
  }
}

/** POST /api/school-reinit/me/addendums */
export async function createMyAddendum(req, res, next) {
  try {
    const cycleId = safeInt(req.body?.cycleId);
    const cycle = await S.getCycleById(cycleId);
    if (!cycle) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertSchoolStaffForOrg(req, cycle.school_organization_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const actor = actorFromReq(req, req.body);
    const addendum = await S.createAddendum({
      cycleId,
      summaryText: req.body?.summaryText || req.body?.summary || '',
      changes: req.body?.changes || {},
      actor,
    });
    res.status(201).json({ addendum });
  } catch (e) {
    next(e);
  }
}

// ─── Public token ───────────────────────────────────────────────────────────

/** GET /api/public/school-reinit/:token */
export async function getPublicByToken(req, res, next) {
  try {
    const result = await S.validateToken(req.params.token);
    if (!result.valid && result.reason !== 'expired') {
      // Allow viewing finalized even if expired
      if (!result.row || result.row.cycle_status !== 'finalized') {
        return res.status(404).json({ error: { message: 'Invalid or expired link', reason: result.reason } });
      }
    }
    const row = result.row;
    if (!row) return res.status(404).json({ error: { message: 'Invalid link' } });

    // Locked tokens can still view receipt if finalized
    const cycle = await S.getCycleById(row.cycle_id);
    await S.recordTokenClick(row);

    const payload = await buildDashboardPayload(cycle);
    res.json({
      ...payload,
      token: row.token,
      tokenLocked: Boolean(row.locked_at) || cycle.status === 'finalized',
      identityRequired: true,
      actorType: 'token_guest',
      schoolName: row.school_name,
      agencyName: row.agency_name,
    });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/public/school-reinit/:token/sections/:sectionKey */
export async function updatePublicSection(req, res, next) {
  try {
    const result = await S.validateToken(req.params.token);
    if (!result.valid || !result.row) {
      return res.status(404).json({ error: { message: 'Invalid or expired link' } });
    }
    if (result.row.locked_at) {
      return res.status(400).json({ error: { message: 'This link is locked after finalization' } });
    }
    const cycle = await S.getCycleById(result.row.cycle_id);
    if (cycle.status === 'finalized') {
      return res.status(400).json({ error: { message: 'Already finalized' } });
    }
    const actor = actorFromReq(req, req.body);
    if (!actor) {
      return res.status(400).json({ error: { message: 'Please identify yourself (name) before saving' } });
    }
    const sectionKey = String(req.params.sectionKey || '').trim();
    const sections = await S.upsertSectionProgress({
      cycleId: cycle.id,
      sectionKey,
      data: req.body?.data,
      reviewed: Boolean(req.body?.reviewed),
      completed: req.body?.completed !== undefined ? Boolean(req.body.completed) : undefined,
      actor,
    });
    res.json({ sections });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/school-reinit/:token/change-requests */
export async function submitPublicChangeRequest(req, res, next) {
  try {
    const result = await S.validateToken(req.params.token);
    if (!result.valid || !result.row) {
      return res.status(404).json({ error: { message: 'Invalid or expired link' } });
    }
    if (result.row.locked_at) {
      return res.status(400).json({ error: { message: 'Link locked' } });
    }
    const cycle = await S.getCycleById(result.row.cycle_id);
    const actor = actorFromReq(req, req.body);
    if (!actor) return res.status(400).json({ error: { message: 'Identity required' } });

    const action = String(req.body?.action || '').toLowerCase();
    const entityType = String(req.body?.entityType || '');
    if (action === 'add') {
      const created = await S.applyAddition({
        entityType,
        payload: req.body?.payload || {},
        schoolOrganizationId: cycle.school_organization_id,
      });
      return res.status(201).json({ applied: true, created });
    }
    const cr = await S.createChangeRequest({
      cycleId: cycle.id,
      entityType,
      entityId: safeInt(req.body?.entityId),
      action,
      beforeJson: req.body?.before || null,
      afterJson: req.body?.after || null,
      actor,
    });
    res.status(201).json({ changeRequest: cr });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/school-reinit/:token/finalize */
export async function finalizePublic(req, res, next) {
  try {
    const result = await S.validateToken(req.params.token);
    if (!result.valid || !result.row) {
      return res.status(404).json({ error: { message: 'Invalid or expired link' } });
    }
    const actor = actorFromReq(req, req.body);
    if (!actor) return res.status(400).json({ error: { message: 'Identity required to finalize' } });
    const finalized = await S.finalizeCycle({ cycleId: result.row.cycle_id, actor });
    res.json({ cycle: parseSnapshot(finalized) });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/school-reinit/:token/addendums */
export async function createPublicAddendum(req, res, next) {
  try {
    const result = await S.validateToken(req.params.token);
    // Allow addendum on finalized even if locked
    const row = result.row;
    if (!row) return res.status(404).json({ error: { message: 'Invalid link' } });
    const actor = actorFromReq(req, req.body);
    if (!actor) return res.status(400).json({ error: { message: 'Identity required' } });
    const addendum = await S.createAddendum({
      cycleId: row.cycle_id,
      summaryText: req.body?.summaryText || req.body?.summary || '',
      changes: req.body?.changes || {},
      actor,
    });
    res.status(201).json({ addendum });
  } catch (e) {
    next(e);
  }
}
