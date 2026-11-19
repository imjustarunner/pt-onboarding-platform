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
  const [automated]=await pool.execute(`SELECT uc.*,u.first_name AS author_first_name,u.last_name AS author_last_name FROM user_communications uc LEFT JOIN users u ON u.id=uc.generated_by_user_id WHERE uc.client_id=? AND ${appCommunicationVisibilitySql('uc')} ORDER BY COALESCE(uc.sent_at,uc.generated_at),uc.id`,[clientId]);
  const messageIds=new Set(threads.flatMap(t=>t.messages.map(m=>m.internet_message_id)).filter(Boolean));
  for(const m of automated) if(!m.external_message_id || !messageIds.has(m.external_message_id)) threads.push({subject:m.subject || 'Notification',messages:[{...m,body_text:String(m.body || '').replace(/<[^>]*>/g,' '),recipientAddress:m.recipient_address,sentAt:m.sent_at || m.generated_at,deliveryStatus:m.delivery_status}]});
  const [sms]=await pool.execute('SELECT ml.*,u.first_name AS author_first_name,u.last_name AS author_last_name FROM message_logs ml LEFT JOIN users u ON u.id=ml.user_id WHERE ml.client_id=? ORDER BY ml.created_at,ml.id',[clientId]);
  if(sms.length)threads.push({subject:'Text messages',messages:sms.map(m=>({...m,from:m.from_number,to:m.to_number,body_text:m.body,send_status:m.delivery_status}))});
  if (!singleClientOnly) return threads;
  const [multiEmail] = await pool.execute("SELECT DISTINCT conversation_id FROM communication_links WHERE entity_type='client' AND entity_id<>? AND conversation_id IN (SELECT conversation_id FROM communication_links WHERE entity_type='client' AND entity_id=?)", [clientId,clientId]);
  const [multiSecure] = await pool.execute("SELECT DISTINCT thread_id FROM guardian_client_threads WHERE client_id<>? AND thread_id IN (SELECT thread_id FROM guardian_client_threads WHERE client_id=?)", [clientId,clientId]);
  const shared = new Set([...multiEmail.map(row=>String(row.conversation_id)), ...multiSecure.map(row=>'secure-'+row.thread_id)]);
  return threads.filter(thread => !shared.has(String(thread.id)));
}
