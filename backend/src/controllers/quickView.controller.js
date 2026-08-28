import crypto from 'crypto';
import {
  getCredentialStatus,
  regenerateToken,
  resetPasscode,
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

async function assertPassword(userId, password) {
  const user = await User.findById(userId);
  if (!user?.password_hash) {
    const err = new Error('Password not set');
    err.status = 400;
    throw err;
  }
  const bcrypt = (await import('bcrypt')).default;
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    const err = new Error('Incorrect password');
    err.status = 401;
    throw err;
  }
  return user;
}

export const getMyQuickViewStatus = async (req, res, next) => {
  try {
    const status = await getCredentialStatus(req.user.id);
    res.json({ ok: true, ...status });
  } catch (e) {
    next(e);
  }
};

export const postRegenerateToken = async (req, res, next) => {
  try {
    await assertPassword(req.user.id, req.body?.password);
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
    await assertPassword(req.user.id, req.body?.password);
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
    let agencyName = null;
    let quickViewEnabled = true;
    if (cred.agency_id) {
      try {
        const settings = await getAgencyEmailSettings(cred.agency_id);
        quickViewEnabled = settings.quickViewEnabled !== false;
        const [a] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [cred.agency_id]);
        agencyName = a?.[0]?.name || null;
      } catch { /* ignore */ }
    }
    await logAccessEvent({
      userId: cred.user_id,
      agencyId: cred.agency_id,
      eventType: 'token_click',
      meta: deliveryMode ? { delivery: true } : null,
      ipHash: ipHash(req),
      userAgent: ua(req)
    });
    res.json({
      ok: true,
      userId: cred.user_id,
      firstName: user?.first_name || null,
      agencyId: cred.agency_id,
      agencyName,
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
    req.quickView = session;
    next();
  } catch (e) {
    next(e);
  }
}

export const getQuickHome = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
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
         AND (c.owner_user_id = ? OR c.agency_id = ?)
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 40`,
      [userId, userId, agencyId]
    );
    res.json({ ok: true, conversations: convs || [], expiresAt: req.quickView.expiresAt });
  } catch (e) {
    next(e);
  }
};

export const getQuickTasks = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const view = String(req.query.view || 'mine').toLowerCase();
    // Prefer me/tasks shape; fall back to lightweight query
    const [rows] = await pool.execute(
      `SELECT t.id, t.title, t.status, t.due_at, t.urgency, t.task_type
       FROM tasks t
       LEFT JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.deleted_at IS NULL
         AND (
           (? = 'mine' AND t.created_by_user_id = ?)
           OR (? = 'assigned' AND ta.user_id = ?)
           OR (t.assigned_to_user_id = ?)
         )
         AND COALESCE(t.status,'open') NOT IN ('completed','cancelled','done')
       GROUP BY t.id
       ORDER BY t.due_at IS NULL, t.due_at ASC, t.id DESC
       LIMIT 50`,
      [view, userId, view, userId, userId]
    ).catch(() => [[]]);
    res.json({ ok: true, tasks: rows || [], view });
  } catch (e) {
    next(e);
  }
};

export const getQuickDayCalendar = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const day = String(req.query.day || new Date().toISOString().slice(0, 10));
    const start = `${day} 00:00:00`;
    const end = `${day} 23:59:59`;
    const [events] = await pool.execute(
      `SELECT id, title, kind, start_at, end_at, location, join_token, participant_join_token,
              platform_video_link, google_meet_link
       FROM provider_schedule_events
       WHERE provider_id = ?
         AND (status IS NULL OR status = 'ACTIVE')
         AND start_at >= ? AND start_at <= ?
       ORDER BY start_at ASC
       LIMIT 80`,
      [userId, start, end]
    ).catch(() => [[]]);
    const items = (events || []).map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      startAt: e.start_at,
      endAt: e.end_at,
      location: e.location || null,
      joinKey: e.participant_join_token || e.join_token || e.id,
      canJoin: !!(e.platform_video_link == null || Number(e.platform_video_link) === 1)
    }));
    res.json({ ok: true, day, items });
  } catch (e) {
    next(e);
  }
};

export const getQuickOfficeAvailability = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const day = String(req.query.day || new Date().toISOString().slice(0, 10));
    // Minimal office slot list from schedule-summary adjacent tables
    const [rows] = await pool.execute(
      `SELECT ose.id, ose.start_at, ose.end_at, ose.status, o.name AS office_name, o.id AS office_id
       FROM office_schedule_events ose
       LEFT JOIN offices o ON o.id = ose.office_id
       WHERE ose.provider_user_id = ?
         AND DATE(ose.start_at) = ?
       ORDER BY ose.start_at ASC
       LIMIT 100`,
      [userId, day]
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
    if (conv.owner_user_id && Number(conv.owner_user_id) !== Number(userId) && Number(conv.agency_id) !== Number(req.quickView.agencyId)) {
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

export const postQuickTaskStatus = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const status = String(req.body?.status || 'completed').toLowerCase();
    const allowed = new Set(['open', 'in_progress', 'completed', 'done', 'cancelled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: { message: 'Invalid status' } });
    }
    await pool.execute(
      `UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [status === 'done' ? 'completed' : status, taskId]
    );
    res.json({ ok: true, id: taskId, status });
  } catch (e) {
    next(e);
  }
};
