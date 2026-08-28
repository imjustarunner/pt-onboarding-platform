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

function sanitizeQuickViewCalendarItem(e, { clientInitials = null, attendees = [] } = {}) {
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
    id: `pse-${e.id}`,
    eventId: e.id,
    title,
    kind: e.kind || 'SCHEDULE',
    startAt: e.start_at || e.startAt,
    endAt: e.end_at || e.endAt,
    location: e.location || e.office_name || null,
    joinKey: e.participant_join_token || e.join_token || e.id,
    canJoin: !!(e.platform_video_link == null || Number(e.platform_video_link) === 1 || e.google_meet_link),
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

/**
 * Confirm identity for Quick View credential changes.
 * Password accounts: require password.
 * SSO / passwordless: require typing CONFIRM (session is already authenticated).
 */
async function assertIdentityConfirm(userId, body = {}) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const hasPassword = !!user.password_hash;
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
      requiresPassword: !!user?.password_hash,
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
    await assertIdentityConfirm(req.user.id, req.body || {});
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
    await assertIdentityConfirm(req.user.id, req.body || {});
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
    await assertIdentityConfirm(req.user.id, req.body || {});
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
    const raw = req.cookies?.qv_session || req.headers['x-quick-view-session'] || req.body?.sessionToken;
    const session = await touchSession(raw, { meetingEndsAt: req.body?.meetingEndsAt || null });
    if (!session) return res.status(401).json({ error: { message: 'Session expired' } });
    res.json({ ok: true, ...session });
  } catch (e) {
    next(e);
  }
};

export const postExtendSession = async (req, res, next) => {
  try {
    const raw = req.cookies?.qv_session || req.headers['x-quick-view-session'] || req.body?.sessionToken;
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
    const raw = req.cookies?.qv_session || req.headers['x-quick-view-session'] || req.body?.sessionToken;
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
    const raw = req.cookies?.qv_session || req.headers['x-quick-view-session'];
    const session = await touchSession(raw);
    if (!session) return res.status(401).json({ error: { message: 'Quick View session required' } });
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
    next();
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

async function assertQuickViewConversationAccess(userId, agencyId, conv) {
  if (!conv) return false;
  if (Number(conv.owner_user_id) === Number(userId)) return true;
  const inbox = await resolvePersonalInbox(userId, agencyId);
  if (inbox?.id && Number(conv.inbox_id) === Number(inbox.id)) return true;
  return false;
}

export const getQuickHome = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
    const inbox = await resolvePersonalInbox(userId, agencyId);
    const inboxId = inbox?.id || null;
    // Personal mailbox / owned threads across all tenants (user-scoped, not agency ticket queues)
    const [convs] = await pool.execute(
      `SELECT c.id, c.channel, c.subject, c.status, c.last_message_at, c.last_message_preview,
              c.sender_trust, COALESCE(c.is_unknown_sender,0) AS is_unknown_sender,
              EXISTS(
                SELECT 1 FROM communication_messages m
                WHERE m.conversation_id = c.id AND m.is_auto_reply = 1
              ) AS has_auto_reply,
              r.last_read_at,
              (r.last_read_at IS NULL OR r.last_read_at < COALESCE(c.last_message_at, c.updated_at)) AS is_unread
       FROM communication_conversations c
       LEFT JOIN communication_conversation_reads r
         ON r.conversation_id = c.id AND r.user_id = ?
       WHERE c.archived_at IS NULL
         AND COALESCE(c.is_spam,0) = 0
         AND COALESCE(c.is_unknown_sender,0) = 0
         AND (c.visible_after IS NULL OR c.visible_after <= NOW())
         AND (
           c.owner_user_id = ?
           OR (? IS NOT NULL AND c.inbox_id = ?)
         )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 50`,
      [userId, userId, inboxId, inboxId]
    );
    res.json({
      ok: true,
      conversations: convs || [],
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
    const rows = await Task.findForHub(userId, { view, limit: 50 });
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
    const day = String(req.query.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const windowStart = `${day} 00:00:00`;
    const dayEnd = new Date(`${day}T12:00:00`);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const windowEnd = `${dayEnd.toISOString().slice(0, 10)} 00:00:00`;

    const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
    // All tenants: meetings/sessions tied to this user
    const events = await ProviderScheduleEvent.listForUserInWindow({
      allAgencies: true,
      providerId: userId,
      windowStart,
      windowEnd
    }).catch(() => []);

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
      `SELECT e.id, e.start_at, e.end_at, e.status,
              ol.name AS office_name
       FROM office_events e
       LEFT JOIN office_locations ol ON ol.id = e.office_location_id
       WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND e.start_at < ? AND e.end_at > ?
       ORDER BY e.start_at ASC
       LIMIT 80`,
      [userId, userId, windowEnd, windowStart]
    ).catch(() => [[]]);

    const items = [
      ...(events || []).map((e) => sanitizeQuickViewCalendarItem(e, {
        clientInitials: initialsByClient.get(Number(e.client_id || e.clientId || 0)) || null,
        attendees: attendeesByEvent.get(Number(e.id)) || []
      })),
      ...(officeRows || []).map((o) => ({
        id: `office-${o.id}`,
        eventId: o.id,
        title: 'Office',
        kind: 'OFFICE',
        startAt: o.start_at,
        endAt: o.end_at,
        location: o.office_name || null,
        joinKey: null,
        canJoin: false,
        hasClient: false,
        clientInitials: null,
        attendees: [],
        editable: false
      }))
    ].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

    res.json({ ok: true, day, items });
  } catch (e) {
    next(e);
  }
};

export const getQuickOfficeAvailability = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
    const day = String(req.query.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const windowStart = `${day} 00:00:00`;
    const dayEnd = new Date(`${day}T12:00:00`);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const windowEnd = `${dayEnd.toISOString().slice(0, 10)} 00:00:00`;
    const officeFilter = Number(req.query.officeId || 0) || null;

    // My slots today
    const [myRows] = await pool.execute(
      `SELECT e.id, e.start_at, e.end_at, e.status,
              ol.name AS office_name,
              e.office_location_id AS office_id
       FROM office_events e
       LEFT JOIN office_locations ol ON ol.id = e.office_location_id
       WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND e.start_at < ? AND e.end_at > ?
       ORDER BY e.start_at ASC
       LIMIT 100`,
      [userId, userId, windowEnd, windowStart]
    ).catch(() => [[]]);

    let locations = [];
    let rosterRows = [];
    if (agencyId) {
      const [locs] = await pool.execute(
        `SELECT ol.id, ol.name
         FROM office_locations ol
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id
         WHERE ola.agency_id = ?
           AND (ol.is_active = TRUE OR ol.is_active IS NULL)
         ORDER BY ol.name ASC
         LIMIT 50`,
        [agencyId]
      ).catch(() => [[]]);
      locations = locs || [];

      const where = [
        'ola.agency_id = ?',
        '(ol.is_active = TRUE OR ol.is_active IS NULL)',
        'e.start_at < ?',
        'e.end_at > ?',
        "(e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')",
        'COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) IS NOT NULL'
      ];
      const params = [agencyId, windowEnd, windowStart];
      if (officeFilter) {
        where.push('ol.id = ?');
        params.push(officeFilter);
      }
      const [rows] = await pool.execute(
        `SELECT
           ol.id AS office_id,
           ol.name AS office_name,
           e.id AS event_id,
           e.start_at,
           e.end_at,
           e.status,
           r.name AS room_name,
           r.room_number,
           COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) AS provider_id,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(bu.first_name, ''), ' ', COALESCE(bu.last_name, ''))), ''),
             NULLIF(TRIM(CONCAT(COALESCE(au.first_name, ''), ' ', COALESCE(au.last_name, ''))), ''),
             NULLIF(TRIM(CONCAT(COALESCE(su.first_name, ''), ' ', COALESCE(su.last_name, ''))), '')
           ) AS provider_name
         FROM office_events e
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id
         LEFT JOIN office_rooms r ON r.id = e.room_id
         LEFT JOIN users bu ON e.booked_provider_id = bu.id
         LEFT JOIN users au ON e.assigned_provider_id = au.id
         LEFT JOIN office_standing_assignments sa ON e.standing_assignment_id = sa.id
         LEFT JOIN users su ON sa.provider_id = su.id
         WHERE ${where.join(' AND ')}
         ORDER BY ol.name ASC, provider_name ASC, e.start_at ASC
         LIMIT 400`,
        params
      ).catch(() => [[]]);
      rosterRows = rows || [];
    }

    const byOffice = new Map();
    const byPerson = new Map();
    for (const row of rosterRows) {
      const officeId = Number(row.office_id || 0);
      const providerId = Number(row.provider_id || 0);
      if (!officeId || !providerId) continue;
      if (!byOffice.has(officeId)) {
        byOffice.set(officeId, {
          id: officeId,
          name: row.office_name || 'Office',
          people: [],
          slotCount: 0
        });
      }
      const office = byOffice.get(officeId);
      office.slotCount += 1;

      const personKey = `${officeId}:${providerId}`;
      if (!byPerson.has(personKey)) {
        const person = {
          providerId,
          name: String(row.provider_name || '').trim() || `Provider #${providerId}`,
          officeId,
          officeName: row.office_name || 'Office',
          firstStart: row.start_at,
          lastEnd: row.end_at,
          rooms: [],
          slots: []
        };
        byPerson.set(personKey, person);
        office.people.push(person);
      }
      const person = byPerson.get(personKey);
      if (row.start_at && (!person.firstStart || row.start_at < person.firstStart)) {
        person.firstStart = row.start_at;
      }
      if (row.end_at && (!person.lastEnd || row.end_at > person.lastEnd)) {
        person.lastEnd = row.end_at;
      }
      const roomLabel = String(row.room_number || row.room_name || '').trim();
      if (roomLabel && !person.rooms.includes(roomLabel)) person.rooms.push(roomLabel);
      person.slots.push({
        id: row.event_id,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status || null,
        room: roomLabel || null
      });
    }

    const offices = Array.from(byOffice.values()).map((o) => ({
      ...o,
      people: o.people.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }));

    // Flat unique people (for messaging) — earliest office window wins as primary
    const peopleMap = new Map();
    for (const p of byPerson.values()) {
      if (!peopleMap.has(p.providerId)) {
        peopleMap.set(p.providerId, { ...p });
      } else {
        const existing = peopleMap.get(p.providerId);
        if (p.firstStart && (!existing.firstStart || p.firstStart < existing.firstStart)) {
          existing.firstStart = p.firstStart;
          existing.officeId = p.officeId;
          existing.officeName = p.officeName;
        }
        if (p.lastEnd && (!existing.lastEnd || p.lastEnd > existing.lastEnd)) {
          existing.lastEnd = p.lastEnd;
        }
      }
    }

    res.json({
      ok: true,
      day,
      agencyId: agencyId || null,
      slots: myRows || [],
      mySlots: myRows || [],
      locations,
      offices,
      people: Array.from(peopleMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    });
  } catch (e) {
    next(e);
  }
};

export const getQuickConversation = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const id = Number(req.params.id);
    const [convs] = await pool.execute(
      `SELECT * FROM communication_conversations WHERE id = ? LIMIT 1`,
      [id]
    );
    const conv = convs?.[0];
    if (!conv) return res.status(404).json({ error: { message: 'Not found' } });
    const allowed = await assertQuickViewConversationAccess(userId, req.quickView.agencyId, conv);
    if (!allowed) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const [messages] = await pool.execute(
      `SELECT id, channel, direction, subject, body_text, body_html, sent_at, created_at,
              is_auto_reply, auto_reply_kind, from_json, to_json
       FROM communication_messages
       WHERE conversation_id = ?
         AND (send_status IS NULL OR send_status <> 'cancelled')
       ORDER BY COALESCE(sent_at, created_at) ASC
       LIMIT 200`,
      [id]
    );
    await pool.execute(
      `INSERT INTO communication_conversation_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_at = NOW()`,
      [id, userId]
    );
    await logAccessEvent({
      userId,
      agencyId: req.quickView.agencyId,
      eventType: 'message_open',
      resourceType: 'conversation',
      resourceId: id
    });
    // Mark messages first-read via Quick View when unset
    await pool.execute(
      `UPDATE communication_messages
       SET first_read_at = COALESCE(first_read_at, NOW()),
           first_read_by_user_id = COALESCE(first_read_by_user_id, ?),
           read_via = COALESCE(read_via, 'quick_view')
       WHERE conversation_id = ?
         AND direction = 'inbound'
         AND first_read_at IS NULL`,
      [userId, id]
    ).catch(() => {});
    res.json({ ok: true, conversation: conv, messages: messages || [] });
  } catch (e) {
    next(e);
  }
};

export const getQuickContacts = async (req, res, next) => {
  try {
    // User-scoped across tenants (no agency filter)
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const rows = await UserCommunicationContact.listForOwner(req.quickView.userId, {});
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

export const postQuickReply = async (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    const text = String(req.body?.text || req.body?.body || '').trim();
    if (!text) return res.status(400).json({ error: { message: 'Reply text required' } });
    const [convs] = await pool.execute(
      `SELECT * FROM communication_conversations WHERE id = ? LIMIT 1`,
      [conversationId]
    );
    const conv = convs?.[0];
    if (!conv) return res.status(404).json({ error: { message: 'Not found' } });
    const allowed = await assertQuickViewConversationAccess(
      req.quickView.userId,
      req.quickView.agencyId,
      conv
    );
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });
    const { replyToConversation } = await import('../services/unifiedInbox.service.js');
    const result = await replyToConversation(conversationId, {
      text,
      mode: 'reply',
      skipUndo: true
    }, { userId: req.quickView.userId });
    await logAccessEvent({
      userId: req.quickView.userId,
      agencyId: req.quickView.agencyId,
      eventType: 'message_reply',
      resourceType: 'conversation',
      resourceId: conversationId
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};

export const postQuickCompose = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim() || '(no subject)';
    const text = String(req.body?.text || req.body?.body || '').trim();
    if (!to || !text) {
      return res.status(400).json({ error: { message: 'Recipient and message text are required' } });
    }
    const inbox = await resolvePersonalInbox(userId, agencyId);
    if (!inbox?.id) {
      return res.status(400).json({ error: { message: 'Personal mailbox is not set up yet' } });
    }
    const { composeNewEmail } = await import('../services/unifiedInbox.service.js');
    const conversation = await composeNewEmail({
      agencyId,
      inboxId: inbox.id,
      userId,
      payload: { to, subject, text, skipUndo: true }
    });
    await logAccessEvent({
      userId,
      agencyId,
      eventType: 'message_compose',
      resourceType: 'conversation',
      resourceId: conversation?.id || null
    });
    res.json({ ok: true, conversation });
  } catch (e) {
    const msg = e?.message || 'Could not send message';
    if (/required|blocked|inbox|recipient/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
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
    const allowed = new Set(['open', 'in_progress', 'completed', 'done', 'cancelled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: { message: 'Invalid status' } });
    }
    const userId = req.quickView.userId;
    const Task = (await import('../models/Task.model.js')).default;
    const rows = await Task.findForHub(userId, { view: 'assigned', limit: 200 });
    const mine = await Task.findForHub(userId, { view: 'mine', limit: 200 });
    const visible = new Set([...(rows || []), ...(mine || [])].map((t) => Number(t.id)));
    if (!visible.has(taskId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await pool.execute(
      `UPDATE tasks SET status = ? WHERE id = ?`,
      [status === 'done' ? 'completed' : status, taskId]
    );
    res.json({ ok: true, id: taskId, status });
  } catch (e) {
    next(e);
  }
};
