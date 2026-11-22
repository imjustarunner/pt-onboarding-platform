import pool from '../config/database.js';
import { guardianContactContext } from './guardianContactContext.service.js';
import { requireConversationAccess } from './communicationAccess.service.js';
import { canReadSharedClientConversation } from './clientConversationRecord.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { privateMailboxVisibilitySql } from './privateMailboxPolicy.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';

const recordRoles = new Set(['admin','super_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant']);
const fail = (status, message) => Object.assign(new Error(message), { status });
const placeholders = values => values.map(() => '?').join(',');
const asIso = value => value instanceof Date ? value.toISOString() : utcMysqlToIso(value);
const stamp = row => new Date(asIso(row.last_message_at)).getTime();
const key = row => `${row.kind}-${row.id}`;
const compare = (a, b) => stamp(b) - stamp(a) || (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0);

// Messages remain in their original stores. This index adds no participants,
// changes no clinical permissions, and never guesses which sibling an email concerns.
export function createGuardianCommunications(overrides = {}) {
  const d = { db: pool, context: guardianContactContext, conversationAccess: requireConversationAccess,
    sharedAccess: canReadSharedClientConversation, recordAccess: resolveClientRecordAccess, ...overrides };

  async function scope(user, guardianId, query = {}) {
    const context = await d.context({ userId: user.id, guardianId, includePast: true });
    const agencyId = query.agencyId ? Number(query.agencyId) : null;
    const clientId = query.clientId ? Number(query.clientId) : null;
    if (agencyId && !context.clients.some(c => c.agencyId === agencyId)) throw fail(404, 'Organization not found');
    if (clientId && !context.clients.some(c => c.id === clientId && (!agencyId || c.agencyId === agencyId))) throw fail(404, 'Client not found');
    const clients = context.clients.filter(c => (!agencyId || c.agencyId === agencyId) && (!clientId || c.id === clientId));
    return { ...context, clients, agencyIds: [...new Set(clients.map(c => c.agencyId))], clientId };
  }

  function recipient(guardian, alias = 'ml') {
    const phone = normalizeSmsPhone(guardian.phone);
    return { sql: `(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata,'$.guardianUserId'))=?
      OR (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata,'$.guardianUserId')),'null') IN ('null','')
        AND (EXISTS (SELECT 1 FROM client_parent_contact_events historical WHERE historical.source_type='sms' AND historical.source_id=${alias}.id AND historical.guardian_user_id=?)
          OR ? IS NOT NULL AND IF(UPPER(${alias}.direction)='INBOUND',${alias}.from_number,${alias}.to_number)=?)))`,
    params: [String(guardian.id), Number(guardian.id), phone, phone] };
  }

  function cursor(raw) {
    if (!raw) return null;
    let value;
    try { value = JSON.parse(raw); } catch { throw fail(400, 'Invalid history cursor'); }
    if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value.at || '') || !Number.isFinite(Date.parse(value.at)) || !/^(conversation|secure)-\d+$/.test(value.key || '')) throw fail(400, 'Invalid history cursor');
    return value;
  }

  async function list({ user, guardianId, query = {} }) {
    if (query.channel && !['email', 'sms', 'secure'].includes(query.channel)) throw fail(400, 'Choose email, SMS, or secure messages');
    const context = await scope(user, guardianId, query);
    if (!context.agencyIds.length) return { ...context, conversations: [], nextCursor: null };
    const after = cursor(query.cursor);
    const date = after ? new Date(after.at).toISOString().slice(0, 23).replace('T', ' ') : null;
    const pageWhere = (column, prefix, id) => after ? ` AND (${column} < ? OR (${column} = ? AND CONCAT('${prefix}-',${id}) < ?))` : '';
    const pageParams = after ? [date, date, after.key] : [];
    let rows = [];
    if (!query.channel || query.channel !== 'secure') {
      const target = recipient(context.guardian);
      const [conversations] = await d.db.execute(`SELECT c.id,'conversation' AS kind,c.channel,c.subject,c.agency_id,c.last_message_at
        FROM communication_conversations c LEFT JOIN communication_inboxes i ON i.id=c.inbox_id
        WHERE ${privateMailboxVisibilitySql(user.id, 'i')} AND c.agency_id IN (${placeholders(context.agencyIds)})
        AND (c.channel='email' AND (EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id=c.id AND LOWER(p.email)=?)
          OR EXISTS (SELECT 1 FROM communication_links g WHERE g.conversation_id=c.id AND g.entity_type='guardian' AND g.entity_id=?)
          OR EXISTS (SELECT 1 FROM client_parent_contact_events historical JOIN communication_messages m ON m.id=historical.source_id
            WHERE historical.source_type='email' AND historical.guardian_user_id=? AND m.conversation_id=c.id))
          OR c.channel='sms' AND EXISTS (SELECT 1 FROM message_logs ml WHERE ml.agency_id=c.agency_id AND ml.sms_thread_key=c.external_thread_id
            AND ml.client_id IN (${placeholders(context.clients.map(c => c.id))}) AND ${target.sql}))
        ${context.clientId ? "AND EXISTS (SELECT 1 FROM communication_links selected WHERE selected.conversation_id=c.id AND selected.entity_type='client' AND selected.entity_id=?)" : ''}
        ${query.channel ? 'AND c.channel=?' : ''}${pageWhere('c.last_message_at', 'conversation', 'c.id')}
        ORDER BY c.last_message_at DESC,CONCAT('conversation-',c.id) DESC LIMIT 200`,
      [...context.agencyIds, String(context.guardian.email || '').toLowerCase(), Number(guardianId), Number(guardianId), ...context.clients.map(c => c.id), ...target.params,
        ...(context.clientId ? [context.clientId] : []), ...(query.channel ? [query.channel] : []), ...pageParams]);
      rows.push(...conversations);
    }
    if (recordRoles.has(user.role) && (!query.channel || query.channel === 'secure')) {
      const [records] = await d.db.execute(`SELECT r.message_id AS id,'secure' AS kind,'secure' AS channel,'Secure message' AS subject,
          r.client_id,r.agency_id,m.created_at AS last_message_at
        FROM client_secure_message_records r JOIN chat_messages m ON m.id=r.message_id
        WHERE r.client_id IN (${placeholders(context.clients.map(c => c.id))}) AND r.agency_id IN (${placeholders(context.agencyIds)})
          AND (r.sender_user_id=? OR JSON_CONTAINS(r.audience_json,JSON_OBJECT('id',CAST(? AS UNSIGNED))))
          ${pageWhere('m.created_at', 'secure', 'r.message_id')}
        ORDER BY m.created_at DESC,CONCAT('secure-',r.message_id) DESC LIMIT 200`,
      [...context.clients.map(c => c.id), ...context.agencyIds, Number(guardianId), Number(guardianId), ...pageParams]);
      rows.push(...records);
    }
    rows.sort(compare);
    const scanned = rows.slice(0, 50), last = scanned.at(-1), page = [], access = new Map();
    for (const row of scanned) {
      if (row.kind === 'secure') {
        const clientId = Number(row.client_id);
        if (!access.has(clientId)) access.set(clientId, await d.recordAccess({ userId: user.id, role: user.role, clientId }));
        if (!access.get(clientId)?.ok) continue;
        row.clients = context.clients.filter(c => c.id === clientId && c.agencyId === Number(row.agency_id));
        if (row.clients.length) page.push(row);
      } else {
        try {
          await d.conversationAccess(user, row.id);
          const [links] = await d.db.execute("SELECT l.entity_id AS id FROM communication_links l WHERE l.conversation_id=? AND l.entity_type='client'", [row.id]);
          if (links.length && !await d.sharedAccess(user.id, row.id)) continue;
          row.clients = links.map(link => context.clients.find(c => c.id === Number(link.id))).filter(Boolean);
          if (links.length && !row.clients.length) continue;
          if (!context.clientId || row.clients.some(c => c.id === context.clientId)) page.push(row);
        } catch (error) { if (![403, 404].includes(error.status)) throw error; }
      }
    }
    // Cursor follows the scanned window even when a private mailbox or a chart
    // permission excludes a row; older authorized records remain reachable.
    const nextCursor = rows.length > 50 && last ? JSON.stringify({ at: asIso(last.last_message_at), key: key(last) }) : null;
    return { guardian: context.guardian, clients: context.clients, conversations: page.map(row => ({
      key: key(row), id: Number(row.id), channel: row.channel, subject: row.subject,
      agencyId: Number(row.agency_id), lastMessageAt: asIso(row.last_message_at), clients: row.clients,
      ...(row.kind === 'secure' ? { clientId: Number(row.client_id), messageId: Number(row.id) } : {})
    })), nextCursor };
  }

  async function smsDetail({ user, guardianId, conversationId, beforeId }) {
    if (beforeId && (!Number.isSafeInteger(Number(beforeId)) || Number(beforeId)<1)) throw fail(400, 'Invalid message cursor');
    const context = await scope(user, guardianId);
    const conversation = await d.conversationAccess(user, conversationId);
    if (!context.clients.length || conversation.channel !== 'sms' || !context.agencyIds.includes(Number(conversation.agency_id))) throw fail(404, 'Text conversation not found');
    const target = recipient(context.guardian);
    const [messages] = await d.db.execute(`SELECT ml.id,ml.body,ml.direction,ml.delivery_status,ml.created_at,ml.from_number,ml.to_number,ml.sms_thread_key,ml.client_id
      FROM message_logs ml WHERE ml.agency_id=? AND ml.sms_thread_key=? AND ml.client_id IN (${placeholders(context.clients.map(c => c.id))})
      AND ${target.sql} ${beforeId ? 'AND ml.id < ?' : ''} ORDER BY ml.id DESC LIMIT 100`,
    [conversation.agency_id, conversation.external_thread_id, ...context.clients.map(c => c.id), ...target.params, ...(beforeId ? [Number(beforeId)] : [])]);
    if (!messages.length && !beforeId) throw fail(404, 'Text conversation not found for this guardian');
    return { conversation: { id: Number(conversation.id), subject: 'Text conversation', channel: 'sms' },
      clientId: Number(messages[0]?.client_id), threadKey: conversation.external_thread_id,
      nextBeforeId: messages.length === 100 ? Number(messages.at(-1).id) : null,
      messages: messages.reverse().map(m => ({ id: m.id, direction: m.direction.toLowerCase(), body_text: m.body,
        send_status: m.delivery_status, created_at: asIso(m.created_at), from: { name: m.direction.toUpperCase() === 'INBOUND' ? context.guardian.name : 'Care team', email: m.from_number }, to: [{ email: m.to_number }] })) };
  }
  async function smsEligibility({user, guardianId, clientId, numberId, threadKey}) {
    const context = await d.context({userId:user.id, guardianId});
    if (!context.clients.some(client => client.id === Number(clientId) && !client.isHistorical)) throw fail(404, 'Current guardian relationship not found');
    const sendSms = d.sendSms || (await import('./clinicalSmsSend.service.js')).sendClinicalSms;
    return sendSms({userId:user.id, guardianUserId:Number(guardianId), clientId:Number(clientId), numberId,
      threadKey, body:'Text eligibility check', preview:true});
  }
  return { list, smsDetail, smsEligibility };
}
export const guardianCommunications = createGuardianCommunications();
