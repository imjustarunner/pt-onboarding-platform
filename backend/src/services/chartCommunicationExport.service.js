import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import {canAccessHubClient} from './hubPeopleAccess.service.js';
import {listClientEmailThreads,clientEmailThread,clientSecureThreads} from './clientConversationRecord.service.js';
import {appCommunicationVisibilitySql} from '../utils/externalTestingEmail.js';

export const isBackofficeRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff';
};

/**
 * Mirrors `client.controller.js#ensureAgencyAccessToClient`. Duplicated locally
 * to keep this controller self-contained without exporting an internal helper
 * across module boundaries.
 */
export async function ensureClientAccess({ userId, role, clientId }) {
  const roleNorm = String(role || '').toLowerCase();
  if (roleNorm === 'school_staff') {
    return { ok: false, status: 403, message: 'School staff do not have access to family texts, emails, or secure messages', client: null };
  }
  if (roleNorm === 'client_guardian' || roleNorm === 'client') {
    return { ok: false, status: 403, message: 'Family texts, emails, and secure messages stay in the family portal', client: null };
  }
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) return { ok: false, status: 404, message: 'Client not found', client: null };
  if (!isBackofficeRole(role)) {
    const ok=await canAccessHubClient({userId,clientId,agencyId:client.agency_id});
    return {ok,client,status:ok?200:403,message:ok?null:'You do not have access to this client'};
  }
  if (String(role || '').toLowerCase() === 'super_admin') return { ok: true, client };

  const orgs = await User.getAgencies(userId);
  const userAgencyIds = (orgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean);

  let hasAgencyAccess = false;
  try {
    if (userAgencyIds.length) {
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT 1
           FROM client_agency_assignments
          WHERE client_id = ?
            AND is_active = TRUE
            AND agency_id IN (${placeholders})
          LIMIT 1`,
        [clientId, ...userAgencyIds]
      );
      hasAgencyAccess = (rows || []).length > 0;
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    hasAgencyAccess = userAgencyIds.includes(parseInt(client.agency_id, 10));
  }
  if (!hasAgencyAccess) {
    const legacy = parseInt(client?.agency_id, 10);
    if (Number.isFinite(legacy) && legacy > 0) {
      hasAgencyAccess = userAgencyIds.includes(legacy);
    }
  }
  if (!hasAgencyAccess) return { ok: false, status: 403, message: 'You do not have access to this client', client };
  return { ok: true, client };
}

export async function chartCommunicationThreads(clientId, userId, {singleClientOnly=false}={}) {
  const threads = [];
  const linked=await listClientEmailThreads(clientId,userId);
  for(const thread of linked)threads.push(await clientEmailThread(clientId,thread.id,userId));
  threads.push(...await clientSecureThreads(clientId,userId));
  const messageIds = new Set(threads.flatMap(t => t.messages.map(m => m.internet_message_id)).filter(Boolean));
  for (const source of ['email', 'ml', 'nsl']) {
    const messages = await chartMessages(clientId, source);
    for (const message of messages) {
      if (source === 'email' && message.external_message_id && messageIds.has(message.external_message_id)) continue;
      threads.push({subject:message.subject, messages:[message]});
    }
  }
  if (!singleClientOnly) return threads;
  const [multiEmail] = await pool.execute("SELECT DISTINCT conversation_id FROM communication_links WHERE entity_type='client' AND entity_id<>? AND conversation_id IN (SELECT conversation_id FROM communication_links WHERE entity_type='client' AND entity_id=?)", [clientId,clientId]);
  const [multiSecure] = await pool.execute("SELECT DISTINCT thread_id FROM guardian_client_threads WHERE client_id<>? AND thread_id IN (SELECT thread_id FROM guardian_client_threads WHERE client_id=?)", [clientId,clientId]);
  const shared = new Set([...multiEmail.map(row=>String(row.conversation_id)), ...multiSecure.map(row=>'secure-'+row.thread_id)]);
  return threads.filter(thread => !shared.has(String(thread.id)));
}

// The map keys are the three origins in the chart communications timeline.
// Scope every lookup to the client, including when exporting a single item.
const messageQueries = {
  email: {
    id:'uc.id', order:'COALESCE(uc.sent_at,uc.generated_at)',
    sql:`SELECT uc.id,uc.subject,uc.body,uc.external_message_id,uc.recipient_address AS recipientAddress,
      COALESCE(uc.sent_at,uc.generated_at) AS sentAt,uc.delivery_status AS deliveryStatus,
      u.first_name AS author_first_name,u.last_name AS author_last_name
      FROM user_communications uc LEFT JOIN users u ON u.id=uc.generated_by_user_id
      WHERE uc.client_id=? AND ${appCommunicationVisibilitySql('uc')}`
  },
  ml: {
    id:'ml.id', order:'ml.created_at',
    sql:`SELECT ml.id,ml.direction,ml.body AS body_text,ml.from_number AS fromNumber,ml.to_number AS recipientAddress,
      ml.created_at AS sentAt,ml.delivery_status AS deliveryStatus
      FROM message_logs ml WHERE ml.client_id=?`
  },
  nsl: {
    id:'nsl.id', order:'nsl.created_at',
    sql:`SELECT nsl.id,n.title AS subject,nsl.body AS body_text,nsl.from_number AS fromNumber,nsl.to_number AS recipientAddress,
      nsl.created_at AS sentAt,nsl.status AS deliveryStatus
      FROM notification_sms_logs nsl JOIN notifications n ON n.id=nsl.notification_id
      WHERE n.related_entity_type='client' AND n.related_entity_id=?
        AND EXISTS (SELECT 1 FROM client_guardians cg WHERE cg.client_id=n.related_entity_id AND cg.guardian_user_id=nsl.user_id)`
  }
};
async function chartMessages(clientId, source, id = null) {
  const query = messageQueries[source];
  const sql = query.sql + (id ? ' AND ' + query.id + '=?' : '') + ' ORDER BY ' + query.order + ',' + query.id;
  const [rows] = await pool.execute(sql, id ? [clientId, id] : [clientId]);
  return rows.map(row => ({...row, subject:row.subject || (source === 'email' ? 'Email notification' : 'Text message'),
    from:row.fromNumber, body_text:row.body_text ?? String(row.body || '').replace(/<[^>]*>/g,' ')}));
}
export async function chartCommunicationMessage(clientId, key) {
  const match = /^(email|ml|nsl)-([1-9][0-9]*)$/.exec(String(key));
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw Object.assign(new Error('Invalid chart message.'), {status:400});
  const [message] = await chartMessages(clientId, match[1], Number(match[2]));
  if (!message) throw Object.assign(new Error('Message not found on this chart.'), {status:404});
  return {subject:message.subject, messages:[message]};
}
