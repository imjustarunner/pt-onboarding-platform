import { assignedSmsConversationSql } from '../utils/assignedSmsAccessSql.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { groupKeyForIdentity, canAccessDepartmentalGroup } from './departmentalGroupAccess.service.js';

export async function requireConversationAccess(user, conversationId) {
  const id = Number(conversationId);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  const [rows] = await pool.execute(
    `SELECT c.*, i.kind AS inbox_kind, i.owner_user_id AS inbox_owner_user_id,
      i.identity_key AS inbox_identity_key,i.from_email AS inbox_from_email
     FROM communication_conversations c LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
     WHERE c.id = ? LIMIT 1`, [id]
  );
  const c = rows[0];
  const uid = Number(user?.id);
  const role = String(user?.role || '').toLowerCase();
  if (!c || !uid) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if(user?.mobileDevice){const {readAgencyAccess}=await import('./agencyAccessProfiles.service.js');if(!await readAgencyAccess(uid,c.agency_id))throw Object.assign(new Error('Conversation not found'),{status:404});}
  const groupKey = groupKeyForIdentity({ kind: c.inbox_kind, identity_key: c.inbox_identity_key,
    from_email: c.inbox_from_email, owner_user_id: c.inbox_owner_user_id });
  if (groupKey) {
    if (await canAccessDepartmentalGroup({ agencyId: c.agency_id, userId: uid, groupKey })) return c;
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (role === 'super_admin') return c;
  const agencies = await User.getAgencies(uid);
  if (!(agencies || []).some((a) => Number(a.id) === Number(c.agency_id))) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if(['shared','support'].includes(c.inbox_kind) && !c.inbox_owner_user_id){
    const [[group]]=await pool.execute(`SELECT 1 FROM managed_workspace_groups g JOIN chat_thread_participants p ON p.thread_id=g.chat_thread_id AND p.user_id=?
      WHERE g.agency_id=? AND CONVERT(LOWER(TRIM(g.email)) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(LOWER(TRIM(?)) USING utf8mb4) COLLATE utf8mb4_unicode_ci LIMIT 1`,[uid,c.agency_id,c.inbox_from_email || '']);
    if(group)return c;
  }
  const ownsInbox = c.inbox_kind === 'personal' && Number(c.inbox_owner_user_id) === uid;
  if (c.inbox_kind === 'personal' && !ownsInbox) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (ownsInbox || Number(c.owner_user_id) === uid || ['admin', 'support'].includes(role)) return c;
  if (c.channel === 'sms') {
    const [assigned] = await pool.execute(`SELECT c.id FROM communication_conversations c
      WHERE c.id = ? AND ${assignedSmsConversationSql} LIMIT 1`, [id, uid, uid, uid]);
    if (assigned.length) return c;
  }
  if (c.channel === 'sms' && String(c.external_thread_id || '').startsWith('sms:v2:')) {
    const [sms] = await pool.execute(`SELECT id FROM message_logs WHERE agency_id = ? AND sms_thread_key = ?
      AND (user_id = ? OR assigned_user_id = ? OR number_id IN (SELECT number_id FROM twilio_number_assignments WHERE user_id = ? AND is_active = 1 AND sms_access_enabled = 1)) LIMIT 1`, [c.agency_id, c.external_thread_id, uid, uid, uid]);
    if (sms.length) return c;
  }
  const [authored] = await pool.execute('SELECT id FROM communication_messages WHERE conversation_id = ? AND author_user_id = ? LIMIT 1', [id, uid]);
  if (authored.length) return c;
  throw Object.assign(new Error('Conversation not found'), { status: 404 });
}

export async function conversationAccessMiddleware(req, res, next) {
  try {
    req.communicationConversation = await requireConversationAccess(req.user, req.params.id);
    next();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}
