import { recordQuickPresenceActivity } from './quickViewPresence.controller.js';
import {enrichMobileClinicalCalendar} from '../services/mobileClinicalCalendar.service.js';
import { quickDayWindow, quickMeetingLink } from '../utils/quickViewCalendar.js';
import crypto from 'crypto';
import {
  getCredentialStatus,
  regenerateToken,
  resetPasscode,
  revealToken,
  findUserByToken,
  verifyPasscodeAndStartSession,
  verifyPasscodeForTenantAndStartSession,
  touchSession,
  extendSession,
  revokeSession,
  logAccessEvent,
  buildQuickViewUrl
} from '../services/quickViewAuth.service.js';
import User from '../models/User.model.js';
import { quickViewRequiresPassword, assertQuickViewAccountMatch } from '../services/quickViewIdentity.service.js';
import pool from '../config/database.js';
import { getAgencyEmailSettings } from '../services/emailSettings.service.js';
import {
  buildQuickViewHomeUrl,
  buildQuickViewTokenUrl,
  buildPublicPortalLoginUrl
} from '../utils/publicPortalUrl.js';

function ipHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

function ua(req) {
  return req.headers['user-agent'] || null;
}

async function resolveAgencyForUser(userId, preferredAgencyId = null) {
  const Agency = (await import('../models/Agency.model.js')).default;
  if (preferredAgencyId) {
    const agency = await Agency.findById(preferredAgencyId);
    if (agency) return agency;
  }
  if (!userId) return null;
  try {
    const [uaRows] = await pool.execute(
      `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
      [userId]
    );
    const aid = uaRows?.[0]?.agency_id;
    if (aid) return Agency.findById(aid);
  } catch { /* ignore */ }
  return null;
}

/** Full tenant palette for Quick View shell (primary / secondary / accent / surfaces). */
async function resolveQuickViewBranding(agency, req = null) {
  const { buildPublicFormBranding, requestBaseUrl } = await import('../services/publicFormBranding.service.js');
  const baseUrl = req
    ? requestBaseUrl(req)
    : String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const branding = await buildPublicFormBranding({
    organization: agency,
    agency,
    baseUrl
  });
  const palette = branding.colorPalette || {};
  return {
    agencyName: branding.agencyName || agency?.name || null,
    agencyLogoUrl: branding.logoUrl || null,
    agencyPrimaryColor: palette.primary || palette.brand || agency?.primary_color || null,
    colorPalette: {
      primary: palette.primary || null,
      secondary: palette.secondary || null,
      accent: palette.accent || null,
      primaryHover: palette.primaryHover || null,
      backgroundColor: palette.backgroundColor || null,
      secondaryBackground: palette.secondaryBackground || null,
      textPrimary: palette.textPrimary || null,
      textSecondary: palette.textSecondary || null,
      textMuted: palette.textMuted || null
    }
  };
}

function sanitizeQuickViewCalendarItem(e, { clientInitials = null, attendees = [], source = 'schedule', viewerId, portalBase } = {}) {
  const kind = String(e.kind || 'SCHEDULE').toUpperCase();
  const hasClient = !!(e.client_id || e.clientId);
  const rawTitle = String(e.title || '').trim();
  // Never expose client identity in Quick View list titles
  let title;
  if (hasClient) {
    if (kind.includes('SUPERVISION')) title = 'Supervision';
    else if (kind.includes('TEAM') || kind.includes('HUDDLE')) title = 'Team meeting';
    else title = 'Client session';
  } else if (/client|patient|student|family/i.test(rawTitle)) {
    title = kind.includes('SUPERVISION') ? 'Supervision' : 'Scheduled session';
  } else {
    title = rawTitle || kind.replace(/_/g, ' ') || 'Event';
  }
  return {
    id: `${source === 'supervision' ? 'supervision' : 'pse'}-${e.id}`,
    agencyId:Number(e.agency_id || e.agencyId) || null,
    eventId: e.id,
    title,
    kind: e.kind || 'SCHEDULE',
    startAt: e.start_at || e.startAt || e.start_date,
    endAt: e.end_at || e.endAt || e.end_date,
    allDay: !!e.all_day,
    status: e.status || null,
    location: e.location || e.office_name || null,
    joinUrl: quickMeetingLink(e, { source, viewerId, portalBase }),
    canJoin: !!quickMeetingLink(e, { source, viewerId, portalBase }),
    hasClient,
    clientInitials: hasClient ? (clientInitials || null) : null,
    attendees: attendees || [],
    notes: null,
    editable: !hasClient
  };
}

function clientInitialsFromRow(c) {
  if (!c) return null;
  const f = String(c.first_name || '').trim();
  const l = String(c.last_name || '').trim();
  if (f && l) return `${f[0].toUpperCase()}.${l[0].toUpperCase()}.`;
  if (f) return `${f[0].toUpperCase()}.`;
  if (l) return `${l[0].toUpperCase()}.`;
  return null;
}

function userInitials(u) {
  const f = String(u?.first_name || '').trim();
  const l = String(u?.last_name || '').trim();
  if (f && l) return `${f[0].toUpperCase()}.${l[0].toUpperCase()}.`;
  return `${f || l || '?'}`.slice(0, 2).toUpperCase();
}

/** Human-readable office booking state for Quick View calendar. */
function humanizeOfficeAvailability(status, slotState) {
  const slot = String(slotState || '').toUpperCase();
  const st = String(status || '').toUpperCase();
  if (slot === 'ASSIGNED_AVAILABLE') return 'Available';
  if (slot === 'ASSIGNED_BOOKED' || st === 'BOOKED') return 'Booked';
  if (slot === 'ASSIGNED_TEMPORARY') return 'Temporarily assigned';
  if (slot === 'COMPANY_HOLD') return 'Company hold';
  if (st === 'RELEASED') return 'Released';
  if (st === 'CANCELLED') return 'Cancelled';
  if (st) return st.charAt(0) + st.slice(1).toLowerCase();
  return 'Scheduled';
}

/**
 * Confirm identity for Quick View credential changes.
 * Password accounts: require password.
 * SSO / passwordless: require typing CONFIRM (session is already authenticated).
 */
async function assertIdentityConfirm(req) {
  assertQuickViewAccountMatch(req);
  const body = req.body || {};
  const user = await User.findById(req.user.id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const hasPassword = await quickViewRequiresPassword(user, req.authClaims);
  if (hasPassword) {
    const bcrypt = (await import('bcrypt')).default;
    const ok = await bcrypt.compare(String(body.password || ''), user.password_hash);
    if (!ok) {
      const err = new Error('Incorrect password');
      err.status = 401;
      throw err;
    }
    return user;
  }
  const phrase = String(body.confirmPhrase || body.password || '')
    .trim()
    .toUpperCase();
  if (phrase !== 'CONFIRM') {
    const err = new Error('Type CONFIRM to continue (Google sign-in accounts do not use a password here)');
    err.status = 400;
    throw err;
  }
  return user;
}

export const getMyQuickViewStatus = async (req, res, next) => {
  try {
    const status = await getCredentialStatus(req.user.id);
    const user = await User.findById(req.user.id);
    const agencyId = Number(req.headers['x-agency-id'] || status.agencyId || 0) || null;
    const agency = await resolveAgencyForUser(req.user.id, agencyId);
    const homeUrl = agency ? buildQuickViewHomeUrl(agency) : null;
    const loginUrl = agency ? buildPublicPortalLoginUrl(agency) : null;
    res.json({
      ok: true,
      ...status,
      userId: req.user.id,
      requiresPassword: await quickViewRequiresPassword(user, req.authClaims),
      agencyId: agency?.id || agencyId,
      agencyName: agency?.name || null,
      homeUrl,
      loginUrl,
      /** Add-to-home-screen URL (no token). Bind once via token link, then PIN only. */
      addToHomeUrl: homeUrl
    });
  } catch (e) {
    next(e);
  }
};

export const postRevealToken = async (req, res, next) => {
  try {
    await assertIdentityConfirm(req);
    const revealed = await revealToken({ userId: req.user.id });
    if (!revealed.ok) {
      return res.status(404).json({
        error: {
          message:
            'This Quick View link cannot be shown again. Generate a new URL (this invalidates the old one).'
        }
      });
    }
    const agencyId = Number(req.headers['x-agency-id'] || req.body?.agencyId || 0) || null;
    const agency = await resolveAgencyForUser(req.user.id, agencyId);
    const url = agency
      ? buildQuickViewTokenUrl(agency, revealed.token)
      : buildQuickViewUrl({
          baseUrl: process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL,
          token: revealed.token
        });
    const homeUrl = agency ? buildQuickViewHomeUrl(agency) : null;
    res.json({
      ok: true,
      token: revealed.token,
      tokenVersion: revealed.tokenVersion,
      url,
      homeUrl
    });
  } catch (e) {
    next(e);
  }
};

export const postRegenerateToken = async (req, res, next) => {
  try {
    await assertIdentityConfirm(req);
    const agencyId = Number(req.headers['x-agency-id'] || req.body?.agencyId || 0) || null;
    const result = await regenerateToken({
      userId: req.user.id,
      agencyId,
      actorUserId: req.user.id,
      ipHash: ipHash(req),
      userAgent: ua(req)
    });
    const agency = await resolveAgencyForUser(req.user.id, agencyId);
    const url = agency
      ? buildQuickViewTokenUrl(agency, result.token)
      : buildQuickViewUrl({
          baseUrl: process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL,
          token: result.token
        });
    const homeUrl = agency ? buildQuickViewHomeUrl(agency) : null;
    res.json({
      ok: true,
      token: result.token,
      tokenVersion: result.tokenVersion,
      url,
      homeUrl,
      shownOnce: true
    });
  } catch (e) {
    next(e);
  }
};

export const postResetPasscode = async (req, res, next) => {
  try {
    await assertIdentityConfirm(req);
    const agencyId = Number(req.headers['x-agency-id'] || req.body?.agencyId || 0) || null;
    const result = await resetPasscode({
      userId: req.user.id,
      agencyId,
      actorUserId: req.user.id,
      ipHash: ipHash(req),
      userAgent: ua(req)
    });
    res.json({
      ok: true,
      passcode: result.passcode,
      passcodeVersion: result.passcodeVersion,
      shownOnce: true
    });
  } catch (e) {
    next(e);
  }
};

/** Public: resolve token landing (no passcode yet) */
export const getTokenInfo = async (req, res, next) => {
  try {
    const raw = String(req.params.token || '').trim();
    const deliveryMode = String(req.query.delivery || req.params.mode || '') === '1'
      || String(req.baseUrl || '').includes('delivery')
      || req.deliveryMode === true;
    let cred = null;
    let deepLinkPath = null;
    if (deliveryMode) {
      const { findDeliveryToken } = await import('../services/quickViewAuth.service.js');
      const delivery = await findDeliveryToken(raw);
      if (!delivery) return res.status(404).json({ error: { message: 'Invalid or expired Quick View link' } });
      cred = {
        user_id: delivery.user_id,
        agency_id: delivery.agency_id || delivery.cred_agency_id,
        passcode_hash: delivery.passcode_hash
      };
      deepLinkPath = delivery.deep_link_path || null;
    } else {
      cred = await findUserByToken(raw);
    }
    if (!cred) return res.status(404).json({ error: { message: 'Invalid or revoked Quick View link' } });
    const user = await User.findById(cred.user_id);
    let agencyId = cred.agency_id || null;
    if (!agencyId) {
      try {
        const [ua] = await pool.execute(
          `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
          [cred.user_id]
        );
        agencyId = ua?.[0]?.agency_id || null;
      } catch { /* ignore */ }
    }
    let agencyName = null;
    let agencyLogoUrl = null;
    let agencyPrimaryColor = null;
    let colorPalette = null;
    let quickViewEnabled = true;
    let loginUrl = null;
    let homeUrl = null;
    let agency = null;
    if (agencyId) {
      try {
        const settings = await getAgencyEmailSettings(agencyId);
        quickViewEnabled = settings.quickViewEnabled !== false;
        const Agency = (await import('../models/Agency.model.js')).default;
        agency = await Agency.findById(agencyId);
        agencyName = agency?.name || null;
        loginUrl = agency ? buildPublicPortalLoginUrl(agency) : null;
        homeUrl = agency ? buildQuickViewHomeUrl(agency) : null;
        const brand = await resolveQuickViewBranding(agency, req);
        agencyName = brand.agencyName || agencyName;
        agencyLogoUrl = brand.agencyLogoUrl;
        agencyPrimaryColor = brand.agencyPrimaryColor;
        colorPalette = brand.colorPalette;
      } catch { /* ignore */ }
    }
    const status = await getCredentialStatus(cred.user_id);
    await logAccessEvent({
      userId: cred.user_id,
      agencyId,
      eventType: 'token_click',
      meta: deliveryMode ? { delivery: true } : null,
      ipHash: ipHash(req),
      userAgent: ua(req)
    });
    res.json({
      ok: true,
      userId: cred.user_id,
      firstName: user?.first_name || null,
      agencyId,
      agencyName,
      agencyLogoUrl,
      agencyPrimaryColor,
      colorPalette,
      hasPasscode: !!cred.passcode_hash,
      quickViewEnabled,
      deliveryMode: !!deliveryMode,
      deepLinkPath,
      loginUrl,
      homeUrl,
      isLocked: !!status.isLocked,
      requiresReset: !!status.isLocked,
      join: {
        type: req.query.join || null,
        id: req.query.id || null
      }
    });
  } catch (e) {
    next(e);
  }
};

export const getDeliveryTokenInfo = async (req, res, next) => {
  req.deliveryMode = true;
  return getTokenInfo(req, res, next);
};

export const postUnlock = async (req, res, next) => {
  try {
    const raw = String(req.params.token || req.body?.token || '').trim();
    const passcode = req.body?.passcode;
    const deliveryMode = req.deliveryMode === true || req.body?.deliveryMode === true;
    const result = await verifyPasscodeAndStartSession({
      rawToken: raw,
      passcode,
      agencyId: req.body?.agencyId || null,
      meetingEventType: req.body?.meetingEventType || null,
      meetingEventId: req.body?.meetingEventId || null,
      meetingEndsAt: req.body?.meetingEndsAt || null,
      ipHash: ipHash(req),
      userAgent: ua(req),
      deliveryMode
    });
    if (!result.ok) {
      const status = result.error === 'locked' ? 429 : 401;
      let message = 'Incorrect passcode';
      if (result.error === 'locked' || result.requiresReset) {
        message =
          'Quick View is locked after 3 incorrect attempts. Sign in to the portal and reset your 6-digit passcode under Settings → Privacy & Quick View.';
      } else if (result.error === 'invalid_passcode' && result.remainingAttempts != null) {
        message = `Incorrect passcode. ${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? '' : 's'} left before lockout.`;
      } else if (result.error === 'passcode_not_set') {
        message = 'Passcode not set. Sign in and create one under Settings → Privacy & Quick View.';
      } else if (result.error === 'invalid_token') {
        message = 'Invalid or revoked Quick View link';
      }
      let loginUrl = null;
      try {
        const agency = await resolveAgencyForUser(result.userId || null, result.agencyId || req.body?.agencyId);
        if (agency) loginUrl = buildPublicPortalLoginUrl(agency);
      } catch { /* ignore */ }
      return res.status(status).json({
        error: {
          message,
          code: result.error,
          requiresReset: !!result.requiresReset,
          remainingAttempts: result.remainingAttempts,
          lockedUntil: result.lockedUntil || null,
          loginUrl
        }
      });
    }
    res.cookie('qv_session', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.json({
      ok: true,
      userId: result.userId,
      agencyId: result.agencyId,
      expiresAt: result.expiresAt,
      sessionToken: result.sessionToken,
      deepLinkPath: result.deepLinkPath || null
    });
  } catch (e) {
    next(e);
  }
};

export const postDeliveryUnlock = async (req, res, next) => {
  req.deliveryMode = true;
  return postUnlock(req, res, next);
};

/** Public: branding for tenant Quick View home (no token). */
export const getTenantQuickViewInfo = async (req, res, next) => {
  try {
    const portalSlug = String(req.query.portal || req.query.slug || '').trim().toLowerCase();
    const host = String(req.query.host || '').trim().toLowerCase().replace(/^qv\./, '');
    const Agency = (await import('../models/Agency.model.js')).default;
    let agency = null;
    if (portalSlug) {
      agency = await Agency.findByPortalUrl(portalSlug);
      if (!agency) agency = await Agency.findBySlug(portalSlug);
    }
    if (!agency && host) {
      agency = await Agency.findByCustomDomain(host);
    }
    // Dedicated app hosts (qv.app.nextleveluplcc.com → app.nextleveluplcc.com → slug)
    if (!agency && host) {
      try {
        const { DEDICATED_APP_HOSTS } = await import('../utils/publicPortalUrl.js');
        const entry = Object.entries(DEDICATED_APP_HOSTS || {}).find(
          ([, dedicated]) => String(dedicated).toLowerCase() === host
        );
        if (entry?.[0]) {
          agency = (await Agency.findByPortalUrl(entry[0])) || (await Agency.findBySlug(entry[0]));
        }
      } catch { /* ignore */ }
    }
    if (!agency) {
      return res.status(404).json({ error: { message: 'Unknown Quick View tenant' } });
    }
    const brand = await resolveQuickViewBranding(agency, req);
    res.json({
      ok: true,
      agencyId: agency.id,
      agencyName: brand.agencyName,
      agencyLogoUrl: brand.agencyLogoUrl,
      agencyPrimaryColor: brand.agencyPrimaryColor,
      colorPalette: brand.colorPalette,
      loginUrl: buildPublicPortalLoginUrl(agency),
      homeUrl: buildQuickViewHomeUrl(agency)
    });
  } catch (e) {
    next(e);
  }
};

/** Public: unlock with 6-digit passcode only (tenant home — no setup-link bind). */
export const postTenantUnlock = async (req, res, next) => {
  try {
    let agencyId = Number(req.body?.agencyId || 0) || null;
    const portalSlug = String(req.body?.portal || req.body?.slug || '').trim().toLowerCase();
    if (!agencyId && portalSlug) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = (await Agency.findByPortalUrl(portalSlug)) || (await Agency.findBySlug(portalSlug));
      agencyId = agency?.id || null;
    }
    const result = await verifyPasscodeForTenantAndStartSession({
      passcode: req.body?.passcode,
      email: req.body?.email,
      agencyId,
      ipHash: ipHash(req),
      userAgent: ua(req)
    });
    if (!result.ok) {
      const status = result.error === 'locked' ? 429 : 401;
      let message = 'Incorrect passcode';
      if (result.error === 'locked' || result.requiresReset) {
        message =
          'Quick View is locked after 3 incorrect attempts. Sign in and reset your 6-digit passcode under Settings → Privacy & Quick View.';
      } else if (result.error === 'agency_required') {
        message = 'Could not determine your organization for Quick View';
      } else if (result.error === 'passcode_not_set') {
        message = 'No Quick View passcode is set for this organization yet';
      }
      let loginUrl = null;
      try {
        const agency = await resolveAgencyForUser(result.userId || null, agencyId);
        if (agency) loginUrl = buildPublicPortalLoginUrl(agency);
      } catch { /* ignore */ }
      return res.status(status).json({
        error: {
          message,
          code: result.error,
          requiresReset: !!result.requiresReset,
          loginUrl
        }
      });
    }
    res.cookie('qv_session', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.json({
      ok: true,
      userId: result.userId,
      agencyId: result.agencyId,
      expiresAt: result.expiresAt,
      sessionToken: result.sessionToken
    });
  } catch (e) {
    next(e);
  }
};

export const postHeartbeat = async (req, res, next) => {
  try {
    const raw = req.headers['x-quick-view-session'] || req.cookies?.qv_session || req.body?.sessionToken;
    const session = await touchSession(raw, { meetingEndsAt: req.body?.meetingEndsAt || null, activity: req.body?.activity === true });
    if (!session) return res.status(401).json({ error: { message: 'Session expired' } });
    if (req.body?.activity === true) await recordQuickPresenceActivity(session).catch(e => console.warn('[quickView] presence activity:', e.message));
    res.json({ ok: true, ...session });
  } catch (e) {
    next(e);
  }
};

export const postExtendSession = async (req, res, next) => {
  try {
    const raw = req.headers['x-quick-view-session'] || req.cookies?.qv_session || req.body?.sessionToken;
    const minutes = Number(req.body?.minutes || 10);
    const session = await extendSession(raw, { minutes });
    if (!session) return res.status(401).json({ error: { message: 'Session expired' } });
    res.json({ ok: true, ...session, message: 'Still here — session extended' });
  } catch (e) {
    next(e);
  }
};

export const postLogout = async (req, res, next) => {
  try {
    const raw = req.headers['x-quick-view-session'] || req.cookies?.qv_session || req.body?.sessionToken;
    if (raw) await revokeSession(raw);
    res.clearCookie('qv_session');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** Scoped data endpoints — require active quick view session */
export async function requireQuickViewSession(req, res, next) {
  try {
    const raw = req.headers['x-quick-view-session'] || req.cookies?.qv_session;
    const session = await touchSession(raw);
    if (!session) return res.status(401).json({ error: { message: 'Quick View session required' } });
    if(session.mobileSurface==='family')return res.status(403).json({error:{message:'Use your family portal. Staff workspace access is not available to this account.'}});
    if (!session.agencyId) {
      try {
        const [ua] = await pool.execute(
          `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
          [session.userId]
        );
        session.agencyId = ua?.[0]?.agency_id || null;
      } catch { /* ignore */ }
    }
    req.quickView = session;
    const {enforceMobileQaBoundary}=await import('../services/mobile/qaScope.service.js');
    await enforceMobileQaBoundary(req);
    await req.auditIdentify?.({ id: session.userId, role: 'quick_view', sessionId: `quickview:${session.sessionId}` });
    // A Quick View PIN is not the authenticator second factor. Sensitive access
    // uses a full account sign-in rather than upgrading this reusable shortcut.
    const { enforceAccountSecurity } = await import('../middleware/accountSecurity.middleware.js');
    req.user = { id: session.userId, role: 'quick_view' };
    if(session.mobileDeviceSessionId){
      const {mobileSessions,parsePrimaryAuthentication}=await import('../services/mobile/session.service.js');
      const context=await mobileSessions.access(session.mobileDeviceSessionId,session.userId,session.agencyId),proof=parsePrimaryAuthentication(context.device.primary_authentication_json);
      if(proof){req.sessionSecurity={key:proof.sessionKey};req.authClaims={authMethod:proof.authMethod};}
    }
    return enforceAccountSecurity(req, res, next);
  } catch (e) {
    next(e);
  }
}

async function resolvePersonalInbox(userId, agencyId) {
  const { findPersonalInbox, ensurePersonalMailbox } = await import('../services/personalMailbox.service.js');
  let inbox = await findPersonalInbox({ agencyId, userId });
  if (!inbox && agencyId) {
    try {
      inbox = await ensurePersonalMailbox({ agencyId, userId });
    } catch (e) {
      console.warn('[quickView] ensurePersonalMailbox:', e?.message || e);
    }
  }
  return inbox;
}

export const getQuickHome = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
    const inbox = await resolvePersonalInbox(userId, agencyId);
    const inboxId = inbox?.id || null;
    if (req.query.channel === 'sms' && agencyId) {
      const { syncSmsThreads } = await import('../services/channelInboxAdapter.service.js');
      await syncSmsThreads({ agencyId, limit: 100 });
    }
    const beforeAt = req.query.beforeAt ? new Date(req.query.beforeAt) : null;
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
    if ((beforeAt || beforeId) && (!beforeAt || !Number.isFinite(beforeAt.getTime()) || !Number.isSafeInteger(beforeId) || beforeId <= 0)) return res.status(400).json({ error: { message: 'Invalid conversation cursor' } });
    // Personal mailbox / owned threads across all tenants (user-scoped, not agency ticket queues)
    const [convs] = await pool.execute(
      `SELECT c.id, c.agency_id, c.channel, c.subject, c.status, c.last_message_at, c.last_message_preview, COALESCE(c.last_message_at,c.created_at) AS sort_at,
              c.sender_trust, COALESCE(c.is_unknown_sender,0) AS is_unknown_sender,
              EXISTS(
                SELECT 1 FROM communication_messages m
                WHERE m.conversation_id = c.id AND m.is_auto_reply = 1
              ) AS has_auto_reply,
              r.last_read_at,
              (COALESCE(r.forced_unread,0)=1 OR EXISTS (SELECT 1 FROM communication_messages unread_message WHERE unread_message.conversation_id=c.id AND unread_message.direction='inbound' AND COALESCE(unread_message.is_internal_note,0)=0 AND COALESCE(unread_message.send_status,'sent') NOT IN ('cancelled','preparing') AND (r.last_read_at IS NULL OR r.last_read_at < COALESCE(unread_message.sent_at,unread_message.created_at)))) AS is_unread
       FROM communication_conversations c
       LEFT JOIN communication_conversation_reads r
         ON r.conversation_id = c.id AND r.user_id = ?
       WHERE c.archived_at IS NULL
         AND c.channel = ?
         ${beforeAt ? 'AND (COALESCE(c.last_message_at,c.created_at) < ? OR (COALESCE(c.last_message_at,c.created_at)=? AND c.id<?))' : ''}
         AND EXISTS (SELECT 1 FROM user_agencies member WHERE member.user_id = ? AND member.agency_id = c.agency_id AND COALESCE(member.is_active,1)=1)
         AND COALESCE(c.is_spam,0) = 0
         AND COALESCE(c.is_unknown_sender,0) = ${req.query.filter === 'unknown' ? 1 : 0}
         ${req.query.filter === 'unread' ? `AND (COALESCE(r.forced_unread,0)=1 OR EXISTS (SELECT 1 FROM communication_messages unread_message WHERE unread_message.conversation_id=c.id AND unread_message.direction='inbound' AND COALESCE(unread_message.is_internal_note,0)=0 AND COALESCE(unread_message.send_status,'sent') NOT IN ('cancelled','preparing') AND (r.last_read_at IS NULL OR r.last_read_at < COALESCE(unread_message.sent_at,unread_message.created_at)))) AND (c.snoozed_until IS NULL OR c.snoozed_until<=NOW())` : ''}
         AND (
           (c.owner_user_id = ? AND NOT EXISTS (SELECT 1 FROM communication_inboxes private_box WHERE private_box.id=c.inbox_id AND private_box.kind='personal' AND private_box.owner_user_id<>c.owner_user_id))
           OR EXISTS (SELECT 1 FROM communication_inboxes mine WHERE mine.id=c.inbox_id AND mine.kind='personal' AND mine.owner_user_id=?)
           OR (c.channel='sms' AND EXISTS (SELECT 1 FROM message_logs sms WHERE sms.agency_id=c.agency_id AND sms.sms_thread_key=c.external_thread_id AND (sms.user_id=? OR sms.assigned_user_id=? OR sms.number_id IN (SELECT number_id FROM twilio_number_assignments WHERE user_id=? AND is_active=1 AND sms_access_enabled=1))))
         )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
       LIMIT 50`,
      [userId, req.query.channel === 'sms' ? 'sms' : 'email', ...(beforeAt ? [beforeAt, beforeAt, beforeId] : []), userId, userId, userId, userId, userId, userId]
    );
    res.json({
      ok: true,
      conversations: convs || [],
      nextCursor: convs.length === 50 ? { beforeAt: convs.at(-1).sort_at, beforeId: convs.at(-1).id } : null,
      inboxId,
      mailboxEmail: inbox?.from_email || null,
      expiresAt: req.quickView.expiresAt
    });
  } catch (e) {
    next(e);
  }
};

export const getQuickTasks = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const view = String(req.query.view || 'assigned').toLowerCase() === 'mine' ? 'mine' : 'assigned';
    const Task = (await import('../models/Task.model.js')).default;
    const rows = req.quickView.qaAgencyIds
      ? (await pool.execute(`SELECT t.id,t.title,t.status,t.due_date,t.urgency,t.task_type FROM tasks t
          WHERE t.assigned_to_agency_id=? AND (t.assigned_to_user_id=? OR t.assigned_by_user_id=?
          OR EXISTS(SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.user_id=?))
          ORDER BY t.due_date,t.id LIMIT 50`,[req.quickView.agencyId,userId,userId,userId]))[0]
      : await Task.findForHub(userId, { view, limit: 50 });
    const open = (rows || []).filter((t) => {
      const s = String(t.status || 'open').toLowerCase();
      return !['completed', 'done', 'cancelled', 'overridden'].includes(s);
    });
    res.json({
      ok: true,
      tasks: open.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due_at: t.due_date || t.due_at || null,
        urgency: t.urgency,
        task_type: t.task_type
      })),
      view
    });
  } catch (e) {
    next(e);
  }
};

export const getQuickDayCalendar = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const day = String(req.query.day || new Date().toISOString().slice(0, 10));
    const timeZone = String(req.query.timeZone || 'America/Denver');
    const { windowStart, windowEnd } = quickDayWindow(day, timeZone);
    const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
    // All tenants: meetings/sessions tied to this user
    const qaAgencyIds=req.quickView.qaAgencyIds;
    const events = qaAgencyIds ? (await pool.execute(`SELECT pse.* FROM provider_schedule_events pse
      WHERE pse.agency_id=? AND pse.recurrence_horizon_held=0
      AND ((pse.all_day=1 AND pse.start_date<DATE(?) AND pse.end_date>DATE(?)) OR (pse.all_day=0 AND pse.start_at<? AND pse.end_at>?))
      AND (pse.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees qa_attendee WHERE qa_attendee.event_id=pse.id AND qa_attendee.user_id=?))
      ORDER BY pse.start_at,pse.id`,[req.quickView.agencyId,windowEnd,windowStart,windowEnd,windowStart,userId,userId]))[0] : await ProviderScheduleEvent.listForUserInWindow({
      allAgencies: true,
      providerId: userId,
      windowStart,
      windowEnd
    });

    const SupervisionSession = (await import('../models/SupervisionSession.model.js')).default;
    const supervision = await SupervisionSession.listForUserInWindow({ allAgencies: !qaAgencyIds,agencyId:req.quickView.agencyId, userId, windowStart, windowEnd });
    const Agency = (await import('../models/Agency.model.js')).default;
    const { buildPublicPortalBaseUrl } = await import('../utils/publicPortalUrl.js');
    const agencyIds = [...new Set([...events, ...supervision].map((e) => Number(e.agency_id)).filter(Boolean))];
    const portalByAgency = new Map(await Promise.all(agencyIds.map(async (id) => [id, buildPublicPortalBaseUrl(await Agency.findById(id))])));
    const clientIds = [...new Set(
      (events || []).map((e) => Number(e.client_id || e.clientId || 0)).filter(Boolean)
    )];
    const initialsByClient = new Map();
    if (clientIds.length) {
      const ph = clientIds.map(() => '?').join(',');
      const [crows] = await pool.execute(
        `SELECT id, first_name, last_name FROM clients WHERE id IN (${ph})`,
        clientIds
      ).catch(() => [[]]);
      for (const c of crows || []) {
        initialsByClient.set(Number(c.id), clientInitialsFromRow(c));
      }
    }

    const eventIds = (events || []).map((e) => Number(e.id)).filter(Boolean);
    const attendeesByEvent = new Map();
    if (eventIds.length) {
      try {
        const ph = eventIds.map(() => '?').join(',');
        const [arows] = await pool.execute(
          `SELECT a.event_id, u.id AS user_id, u.first_name, u.last_name
           FROM provider_schedule_event_attendees a
           JOIN users u ON u.id = a.user_id
           WHERE a.event_id IN (${ph})
           LIMIT 500`,
          eventIds
        );
        for (const a of arows || []) {
          const eid = Number(a.event_id);
          if (!attendeesByEvent.has(eid)) attendeesByEvent.set(eid, []);
          attendeesByEvent.get(eid).push({
            userId: Number(a.user_id),
            initials: userInitials(a),
            name: `${a.first_name || ''} ${a.last_name || ''}`.trim()
          });
        }
      } catch { /* table may differ */ }
    }

    const [officeRows] = await pool.execute(
      `SELECT e.id, e.start_at, e.end_at, e.status, e.slot_state,
              ol.name AS office_name,
              r.name AS room_name,
              r.room_number
       FROM office_events e
       LEFT JOIN office_locations ol ON ol.id = e.office_location_id
       LEFT JOIN office_rooms r ON r.id = e.room_id
       WHERE COALESCE(e.booked_provider_id,e.assigned_provider_id) = ?
         AND UPPER(COALESCE(e.status,'')) NOT IN('CANCELLED','CANCELED','DELETED','RELEASED')
         AND e.start_at < ? AND e.end_at > ?
         ${qaAgencyIds?'AND EXISTS(SELECT 1 FROM appointments qa_appointment WHERE qa_appointment.office_event_id=e.id AND qa_appointment.agency_id=? AND qa_appointment.provider_user_id=?)':''}
       ORDER BY e.start_at ASC
       LIMIT 80`,
      [userId, windowEnd, windowStart,...(qaAgencyIds?[req.quickView.agencyId,userId]:[])]
    ).catch(() => [[]]);

    const items = [
      ...(events || []).map((e) => sanitizeQuickViewCalendarItem(e, {
        viewerId: userId, portalBase: portalByAgency.get(Number(e.agency_id)),
        clientInitials: initialsByClient.get(Number(e.client_id || e.clientId || 0)) || null,
        attendees: attendeesByEvent.get(Number(e.id)) || []
      })),
      ...supervision.map((e) => sanitizeQuickViewCalendarItem({ ...e, kind: 'SUPERVISION', title: 'Supervision', location: e.location_text }, { source: 'supervision', viewerId: userId, portalBase: portalByAgency.get(Number(e.agency_id)) })),
      ...(officeRows || []).map((o) => {
        const officeName = o.office_name || 'Office';
        const availability = String(o.slot_state || '').toUpperCase()==='COMPANY_HOLD'?'Office hold':'Office reservation';
        const roomLabel = String(o.room_number || o.room_name || '').trim();
        return {
          id: `office-${o.id}`,
          eventId: o.id,
          title: `${officeName} · ${availability}`,
          kind: 'OFFICE',
          startAt: o.start_at,
          endAt: o.end_at,
          location: officeName,
          officeName,
          room: roomLabel || null,
          status: o.status || null,
          slotState: o.slot_state || null,
          availability,
          joinKey: null,
          canJoin: false,
          hasClient: false,
          clientInitials: null,
          attendees: [],
          editable: false
        };
      })
    ].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

    if(req.quickView.mobileDeviceSessionId) {
      const user=await User.findById(userId);
      if(user){
        // Recheck each agency using the primary account; a workspace selection must
        // not discard this provider's own appointments at other authorized agencies.
        const ids=qaAgencyIds?[Number(req.quickView.agencyId)]:(await (await import('../services/mobile/agencyScope.service.js')).listMobileAgencies(user)).agencies.map(agency=>Number(agency.id));
        let enriched=items;
        for(const agencyId of ids){
          try{enriched=await enrichMobileClinicalCalendar({user:{...user},agencyId,windowStart,windowEnd,items:enriched,events});}
          catch(error){if(error.status!==403)throw error; /* non-clinical agency: retain ordinary calendar entries */}
        }
        return res.json({ok:true,day,timeZone,items:enriched});
      }
    }
    res.json({ ok: true, day, timeZone, items });
  } catch (e) {
    next(e);
  }
};

export const getQuickOfficeAvailability = async (req, res, next) => {
 try {
  const {loadOfficeSchedule}=await import('../services/mobile/officeSchedule.service.js');
  res.json(await loadOfficeSchedule({userId:req.quickView.userId,agencyId:req.quickView.agencyId,day:String(req.query.day || new Date().toISOString().slice(0,10)),timeZone:String(req.query.timeZone || 'America/Denver'),officeFilterId:Number(req.query.officeId)||null}));
 } catch(error){next(error);}
};

export const getQuickContacts = async (req, res, next) => {
  try {
    // User-scoped across tenants (no agency filter)
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const rows = await UserCommunicationContact.listForOwner(req.quickView.userId, {externalOnly:true});
    res.json({
      ok: true,
      contacts: (rows || []).map((c) => ({
        id: c.id,
        email: c.email,
        display_name: c.display_name,
        phone: c.phone,
        trust_status: c.trust_status
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** Public PWA manifest for tenant Quick View hosts (iOS uses start_url from this). */
export const getQuickViewPwaManifest = async (req, res, next) => {
  try {
    const origin = String(req.query.origin || '').replace(/\/$/, '');
    const name = String(req.query.name || 'Quick View').slice(0, 60);
    const theme = String(req.query.theme || '#0f172a');
    const icon = String(req.query.icon || '/branding/plottwisthq-platform-bg.png');
    const start = origin ? `${origin}/` : '/';
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      name,
      short_name: name.slice(0, 12),
      start_url: start,
      scope: origin ? `${origin}/` : '/',
      display: 'standalone',
      background_color: theme,
      theme_color: theme,
      icons: [
        { src: icon, sizes: '192x192', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any' }
      ]
    });
  } catch (e) {
    next(e);
  }
};

export const postQuickContact = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();
    const displayName = String(req.body?.displayName || req.body?.name || '').trim() || null;
    const phone = String(req.body?.phone || '').trim() || null;
    if (!email) return res.status(400).json({ error: { message: 'Email is required' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const contact = await UserCommunicationContact.upsertSafe({
      agencyId: req.quickView.agencyId,
      ownerUserId: req.quickView.userId,
      email,
      displayName,
      phone,
      source: 'quick_view'
    });
    res.json({ ok: true, contact });
  } catch (e) {
    const msg = e?.message || 'Could not save contact';
    if (/required|email/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
};

export const postQuickTask = async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'Title is required' } });
    const userId = req.quickView.userId;
    const Task = (await import('../models/Task.model.js')).default;
    const task = await Task.create({
      taskType: 'custom',
      title,
      description: String(req.body?.description || '').trim() || null,
      assignedByUserId: userId,
      assignedToUserId: userId,
      dueDate: req.body?.dueDate || req.body?.due_at || null,
      urgency: String(req.body?.urgency || 'medium').toLowerCase(),
      isPrivate: true
    });
    res.json({ ok: true, task });
  } catch (e) {
    next(e);
  }
};

export const postQuickTaskStatus = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const status = String(req.body?.status || 'completed').toLowerCase();
    const allowed = new Set(['open','pending', 'in_progress','waiting', 'completed', 'done', 'cancelled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: { message: 'Invalid status' } });
    }
    const userId = req.quickView.userId;
    const Task = (await import('../models/Task.model.js')).default;
    const task=await Task.findById(taskId,{revealPhi:false});
    if(!task)return res.status(404).json({error:{message:'Task not found'}});
    // Preserve the Assigned/Mine write scope without a 200-row list cutoff.
    if(Number(task.assigned_to_user_id)!==Number(userId) && Number(task.assigned_by_user_id)!==Number(userId))return res.status(403).json({error:{message:'Only the assignee or assigning user can change this task status.'}});
    const nextStatus=['done','completed'].includes(status)?'completed':status==='open'?'pending':status;
    if(nextStatus==='completed')await Task.markComplete(taskId,userId);
    else if(nextStatus==='pending')await Task.markIncomplete(taskId);
    else await Task.updateStatus(taskId,nextStatus);
    res.json({ ok: true, id: taskId, status });
  } catch (e) {
    next(e);
  }
};
