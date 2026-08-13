import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import * as S from '../services/schoolOnboarding.service.js';
import { nukeSchoolOnboardingInvite } from '../services/schoolOnboardingNuke.service.js';

function agencyIdFromReq(req) {
  const raw = req.body?.agencyId ?? req.query?.agencyId ?? req.headers['x-agency-id'];
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function handleServiceError(err, res, next) {
  if (err?.status) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code || undefined,
        details: err.details || undefined
      }
    });
  }
  return next(err);
}

export async function createInvite(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const result = await S.createInvite({
      agencyId,
      contactFirstName: req.body?.contactFirstName,
      contactLastName: req.body?.contactLastName,
      contactEmail: req.body?.contactEmail,
      schoolName: req.body?.schoolName,
      invitedByUserId: req.user?.id || null,
      sendEmail: req.body?.sendEmail === true,
      priorSchoolDecision: req.body?.priorSchoolDecision || null,
      resetPassword: req.body?.resetPassword === true,
      confirmExistingSchoolStaff: req.body?.confirmExistingSchoolStaff === true
    });
    res.status(201).json({
      invite: S.serializeInvite(result.invite, { admin: true }),
      link: result.link,
      emailSent: result.emailSent,
      school: result.school,
      intakeBootstrap: result.intakeBootstrap || null,
      reusedExistingUser: !!result.reusedExistingUser,
      temporaryPassword: result.temporaryPassword || undefined,
      temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt || undefined
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function listInvites(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const invites = await S.listInvites(agencyId);
    res.json({ invites });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function resendInvite(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: { message: 'Invalid invite id' } });
    const result = await S.resendInvite(inviteId, agencyId, req.user?.id || null);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function sendInviteEmail(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: { message: 'Invalid invite id' } });
    const result = await S.sendInviteEmailOnly(inviteId, agencyId, req.user?.id || null);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function revokeInvite(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: { message: 'Invalid invite id' } });
    const invite = await S.revokeInvite(inviteId, agencyId);
    res.json({ invite });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function nukeInvite(req, res, next) {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only admins can nuke a school onboarding invite.' } });
    }
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: { message: 'Invalid invite id' } });
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'NUKE') {
      return res.status(400).json({
        error: {
          code: 'NUKE_CONFIRM_REQUIRED',
          message: 'Type confirm: "NUKE" in the request body to permanently delete this school and all related test data.'
        }
      });
    }
    const result = await nukeSchoolOnboardingInvite(inviteId, agencyId, {
      archivedByUserId: req.user?.id || null
    });
    res.json({
      message: 'School and related onboarding data permanently deleted.',
      ...result
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getPublicByToken(req, res, next) {
  try {
    const data = await S.getPublicInvite(req.params.token);
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function setPassword(req, res, next) {
  try {
    const result = await S.setPassword(req.params.token, req.body?.password, {
      identityConfirmed: req.body?.identityConfirmed === true,
      contactFirstName: req.body?.contactFirstName,
      contactLastName: req.body?.contactLastName,
      contactEmail: req.body?.contactEmail,
      schoolName: req.body?.schoolName
    });
    const user = result.user;
    const sessionId = crypto.randomUUID();
    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.username || user.email,
        role: user.role,
        status: user.status,
        sessionId,
        schoolOnboarding: true
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    res.cookie('authToken', jwtToken, config.authCookie.set());
    res.json({
      ok: true,
      username: result.username,
      token: jwtToken,
      sessionId,
      user: {
        id: user.id,
        email: user.username || user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status,
        username: user.username || user.email
      },
      agencies: result.agencies || []
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function saveStep(req, res, next) {
  try {
    const markComplete = req.body?.markComplete !== false;
    const invite = await S.saveStep(
      req.params.token,
      req.params.stepKey,
      req.body?.payload ?? req.body ?? {},
      markComplete
    );
    res.json({ invite });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getDemo(req, res, next) {
  try {
    const demo = await S.resolveDemoSchool(req.params.token);
    res.json({ demo });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getDemoSnapshot(req, res, next) {
  try {
    const snapshot = await S.getDemoSnapshot(req.params.token);
    res.json({ snapshot });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getDemoPortal(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    // When mounted at /:token/demo/portal, remaining path is req.url (e.g. /stats?x=1)
    const pathRest = String(req.url || '/')
      .split('?')[0]
      .replace(/^\/+/, '');
    const data = await DemoPortal.handleDemoPortalGet(req.params.token, pathRest, req.query || {});
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function mutateDemoPortal(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    // Validate invite exists
    await S.resolveDemoSchool(req.params.token);
    const pathRest = String(req.url || '/')
      .split('?')[0]
      .replace(/^\/+/, '');
    const data = await DemoPortal.handleDemoPortalMutation(req.method, pathRest, req.body || {}, req.params.token);
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getDemoSchoolMeta(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    const school = await DemoPortal.getDemoSchoolMeta(req.params.token);
    res.json({ school });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getPublicStandaloneDemo(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    const { demo } = await DemoPortal.resolveHogwartsCore();
    res.json({ demo });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getPublicStandaloneDemoSchoolMeta(req, res, next) {
  req.params = { ...(req.params || {}), token: 'public' };
  return getDemoSchoolMeta(req, res, next);
}

export async function getPublicStandaloneDemoPortal(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    const pathRest = String(req.url || '/')
      .split('?')[0]
      .replace(/^\/+/, '');
    const data = await DemoPortal.handleDemoPortalGet('public', pathRest, req.query || {});
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function mutatePublicStandaloneDemoPortal(req, res, next) {
  try {
    const DemoPortal = await import('../services/schoolOnboardingDemoPortal.service.js');
    const pathRest = String(req.url || '/')
      .split('?')[0]
      .replace(/^\/+/, '');
    const data = await DemoPortal.handleDemoPortalMutation(req.method, pathRest, req.body || {}, 'public');
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function submit(req, res, next) {
  try {
    const result = await S.submitOnboarding(req.params.token);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getQrLink(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const qr = await S.getOrCreateQrLink(agencyId, req.user?.id || null);
    res.json({ qr });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function rotateQrLink(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const qr = await S.rotateQrLink(agencyId, req.user?.id || null);
    res.json({ qr });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function revokeQrLink(req, res, next) {
  try {
    const agencyId = agencyIdFromReq(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await S.revokeQrLink(agencyId);
    res.json({ revoked: true });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function getPublicQr(req, res, next) {
  try {
    const data = await S.getPublicQrLink(req.params.token);
    res.json(data);
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function startFromQr(req, res, next) {
  try {
    const result = await S.startFromQr(req.params.token, req.body || {});
    res.status(201).json({
      inviteToken: result.inviteToken,
      link: result.link,
      school: result.school,
      reusedExistingUser: !!result.reusedExistingUser,
      temporaryPassword: result.temporaryPassword || undefined,
      temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt || undefined
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function downloadHogwartsOfflineDemo(req, res, next) {
  try {
    const { streamHogwartsOfflineDemoZip } = await import('../services/hogwartsOfflineDemo.service.js');
    await streamHogwartsOfflineDemoZip(res);
  } catch (err) {
    if (res.headersSent) return next(err);
    handleServiceError(err, res, next);
  }
}
