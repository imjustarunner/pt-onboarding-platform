import crypto from 'crypto';
import {
  getCredentialStatus,
  regenerateToken,
  resetPasscode,
  revealToken,
  findUserByToken,
  verifyPasscodeAndStartSession,
  touchSession,
  revokeSession,
  logAccessEvent,
  buildQuickViewUrl
} from '../services/quickViewAuth.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import { getAgencyEmailSettings } from '../services/emailSettings.service.js';

function ipHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

function ua(req) {
  return req.headers['user-agent'] || null;
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
    res.json({
      ok: true,
      ...status,
      requiresPassword: !!user?.password_hash
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
    const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    res.json({
      ok: true,
      token: revealed.token,
      tokenVersion: revealed.tokenVersion,
      url: buildQuickViewUrl({ baseUrl, token: revealed.token })
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
    const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    res.json({
      ok: true,
      token: result.token,
      tokenVersion: result.tokenVersion,
      url: buildQuickViewUrl({ baseUrl, token: result.token }),
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
    let quickViewEnabled = true;
    if (agencyId) {
      try {
        const settings = await getAgencyEmailSettings(agencyId);
        quickViewEnabled = settings.quickViewEnabled !== false;
        const Agency = (await import('../models/Agency.model.js')).default;
        const agency = await Agency.findById(agencyId);
        agencyName = agency?.name || null;
        const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const { resolveOrgLogoUrl } = await import('../services/publicFormBranding.service.js');
        agencyLogoUrl = resolveOrgLogoUrl(agency, { baseUrl });
        const palette = typeof agency?.color_palette === 'string'
          ? (() => { try { return JSON.parse(agency.color_palette); } catch { return null; } })()
          : agency?.color_palette;
        agencyPrimaryColor = palette?.primary || palette?.brand || agency?.primary_color || null;
      } catch { /* ignore */ }
    }
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
      hasPasscode: !!cred.passcode_hash,
      quickViewEnabled,
      deliveryMode: !!deliveryMode,
      deepLinkPath,
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
      return res.status(status).json({ error: { message: result.error, ...result } });
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
    // Personal mailbox only — never whole-agency ticket queues
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
         AND (c.agency_id = ? OR c.agency_id IS NULL OR ? IS NULL)
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 50`,
      [userId, userId, inboxId, inboxId, agencyId, agencyId]
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
    const agencyId = req.quickView.agencyId;
    const day = String(req.query.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const windowStart = `${day} 00:00:00`;
    const dayEnd = new Date(`${day}T12:00:00`);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const windowEnd = `${dayEnd.toISOString().slice(0, 10)} 00:00:00`;

    const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
    const events = await ProviderScheduleEvent.listForUserInWindow({
      agencyId,
      providerId: userId,
      windowStart,
      windowEnd
    }).catch(() => []);

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
      ...(events || []).map((e) => ({
        id: `pse-${e.id}`,
        title: e.title || e.kind || 'Event',
        kind: e.kind || 'SCHEDULE',
        startAt: e.start_at || e.startAt,
        endAt: e.end_at || e.endAt,
        location: e.location || null,
        joinKey: e.participant_join_token || e.join_token || e.id,
        canJoin: !!(e.platform_video_link == null || Number(e.platform_video_link) === 1 || e.google_meet_link)
      })),
      ...(officeRows || []).map((o) => ({
        id: `office-${o.id}`,
        title: o.office_name || 'Office',
        kind: 'OFFICE',
        startAt: o.start_at,
        endAt: o.end_at,
        location: o.office_name || null,
        joinKey: null,
        canJoin: false
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
    const day = String(req.query.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const windowStart = `${day} 00:00:00`;
    const dayEnd = new Date(`${day}T12:00:00`);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const windowEnd = `${dayEnd.toISOString().slice(0, 10)} 00:00:00`;

    const [rows] = await pool.execute(
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
    res.json({ ok: true, day, slots: rows || [] });
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
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const rows = await UserCommunicationContact.listForOwner(req.quickView.userId, {
      agencyId: req.quickView.agencyId
    });
    res.json({ ok: true, contacts: rows || [] });
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
