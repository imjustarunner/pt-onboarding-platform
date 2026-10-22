import pool from '../config/database.js';
import { encryptChatText } from './chatEncryption.service.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const emails = value => {
  const parsed = parse(value);
  return (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).map(v => String(v.email || '').trim().toLowerCase()).filter(Boolean);
};
const phone = value => String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

// A delivery/open receipt is not evidence of a conversation. Only a human
// response from a linked guardian marks the parent-contact outcome successful.
export function emailParentContactOutcome(message, guardian, previousOutbound = []) {
  if (message.channel !== 'email' || Number(message.is_internal_note) || Number(message.is_auto_reply) || message.auto_reply_kind) return null;
  if (!['sent', 'received', 'delivered'].includes(String(message.send_status))) return null;
  const addresses = [guardian.email, guardian.personal_email].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
  const matches = values => values.some(value => addresses.includes(value));
  if (message.direction === 'outbound') {
    return message.author_user_id && matches([...emails(message.to_json), ...emails(message.cc_json), ...emails(message.bcc_json)]) ? { successful: false } : null;
  }
  if (message.direction !== 'inbound' || !matches(emails(message.from_json))) return null;
  const original = previousOutbound.find(m => m.author_user_id && !Number(m.is_auto_reply) && !Number(m.is_internal_note) && ['sent','delivered'].includes(m.send_status) && matches([...emails(m.to_json), ...emails(m.cc_json), ...emails(m.bcc_json)]));
  return original ? { successful: true, authorId: original.author_user_id } : null;
}

async function recordContact(db, { sourceType, sourceId, client, guardianId, authorId, direction, successful, occurredAt, conversationId, conversationKey }) {
  if (!authorId) return;
  if (direction === 'outbound' && conversationKey) {
    await db.execute(`INSERT IGNORE INTO client_parent_contact_attempts
      (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at) VALUES (?,?,?,?,?,?)`,
      [client.id,client.agency_id,sourceType,conversationKey,sourceId,occurredAt]);
  }
  const [inserted] = await db.execute(`INSERT IGNORE INTO client_parent_contact_events
    (source_type,source_id,client_id,agency_id,guardian_user_id,author_user_id,direction,successful,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, [sourceType,sourceId,client.id,client.agency_id,guardianId,authorId,direction,successful ? 1 : 0,occurredAt]);
  if (!inserted.affectedRows) return;
  // Keep the note limited to this client's contact event. Shared message bodies
  // remain in Communications, where access to every discussed client is checked.
  const channel = { email: 'email', sms: 'text message', secure: 'secure message' }[sourceType];
  const message = `Parent / guardian contact — ${channel}\n${successful ? 'Guardian replied. Contact successful.' : 'Message sent to the linked guardian. Awaiting a reply.'}\n${conversationId ? `Conversation #${conversationId}\n` : ''}Message #${sourceId}\nFull communication is available in the client’s Communications record.`;
  const enc = encryptChatText(message);
  const [note] = await db.execute(`INSERT INTO client_notes
    (client_id,author_id,category,urgency,message,message_ciphertext,message_iv,message_auth_tag,encryption_key_id,is_internal_only)
    VALUES (?,?,'contact','low',NULL,?,?,?,?,1)`, [client.id,authorId,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId]);
  await db.execute('UPDATE client_parent_contact_events SET note_id=? WHERE id=?', [note.insertId,inserted.insertId]);
  await db.execute(`UPDATE clients SET parents_contacted_at=COALESCE(parents_contacted_at,?),
    parents_contacted_successful=IF(?,1,parents_contacted_successful),
    checklist_updated_at=NOW(),checklist_updated_by_user_id=? WHERE id=? AND agency_id=?`,
    [occurredAt,successful ? 1 : 0,authorId,client.id,client.agency_id]);
}

async function syncSource(sourceType, sourceId, collect) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const events = await collect(db);
    if (events === null) { await db.rollback(); return; }
    for (const event of events) await recordContact(db, { ...event, sourceType, sourceId });
    await db.execute('INSERT IGNORE INTO parent_contact_sync_checks (source_type,source_id) VALUES (?,?)', [sourceType,sourceId]);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}

export async function syncEmailParentContact(messageId) {
  return syncSource('email', messageId, async db => {
    const [[m]] = await db.execute(`SELECT m.*,c.agency_id FROM communication_messages m
      JOIN communication_conversations c ON c.id=m.conversation_id WHERE m.id=?`, [messageId]);
    if (!m || !['sent','received','delivered'].includes(m.send_status)) return null;
    const [guardians] = await db.execute(`SELECT c.id,c.agency_id,cg.guardian_user_id,u.email,u.personal_email
      FROM communication_links l JOIN clients c ON c.id=l.entity_id AND c.agency_id=?
      JOIN client_guardians cg ON cg.client_id=c.id JOIN users u ON u.id=cg.guardian_user_id
      WHERE l.conversation_id=? AND l.entity_type='client' AND cg.relationship_type<>'self'`, [m.agency_id,m.conversation_id]);
    const [outbound] = m.direction === 'inbound' ? await db.execute(`SELECT * FROM communication_messages
      WHERE conversation_id=? AND id<? AND direction='outbound' AND send_status IN ('sent','delivered') ORDER BY id DESC`, [m.conversation_id,m.id]) : [[]];
    return guardians.flatMap(g => {
      const outcome = emailParentContactOutcome(m,g,outbound);
      return outcome ? [{client:g,guardianId:g.guardian_user_id,authorId:outcome.authorId || m.author_user_id,
        direction:m.direction,successful:outcome.successful,occurredAt:m.sent_at || m.created_at,conversationId:m.conversation_id,conversationKey:String(m.conversation_id)}] : [];
    });
  });
}

export async function syncSmsParentContact(messageId) {
  return syncSource('sms',messageId,async db => {
    const [[m]] = await db.execute('SELECT * FROM message_logs WHERE id=?',[messageId]);
    if (!m || !['sent','delivered','received'].includes(m.delivery_status) || !m.client_id) return null;
    const [guardians] = await db.execute(`SELECT c.id,c.agency_id,cg.guardian_user_id,COALESCE(NULLIF(u.personal_phone,''),NULLIF(u.phone_number,''),u.work_phone) AS phone_number
      FROM clients c JOIN client_guardians cg ON cg.client_id=c.id JOIN users u ON u.id=cg.guardian_user_id
      WHERE c.id=? AND c.agency_id=? AND cg.relationship_type<>'self'`,[m.client_id,m.agency_id]);
    const inbound=String(m.direction).toUpperCase()==='INBOUND';
    const guardian=guardians.find(g=>phone(g.phone_number) && phone(g.phone_number)===phone(inbound?m.from_number:m.to_number));
    if (!guardian) return [];
    const [[original]] = inbound ? await db.execute(`SELECT user_id FROM message_logs WHERE client_id=? AND agency_id=?
      AND sms_thread_key=? AND id<? AND direction='OUTBOUND' AND delivery_status IN ('sent','delivered') AND user_id IS NOT NULL ORDER BY id DESC LIMIT 1`,[m.client_id,m.agency_id,m.sms_thread_key,m.id]) : [[m]];
    if (!original?.user_id) return [];
    const [[start]] = !inbound && m.sms_thread_key ? await db.execute(`SELECT MAX(id) AS id FROM message_logs
      WHERE agency_id=? AND sms_thread_key=? AND id<=? AND direction='OUTBOUND' AND delivery_status IN ('sent','delivered')
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.startsParentContactConversation'))='true'`,[m.agency_id,m.sms_thread_key,m.id]) : [[null]];
    const conversationKey=`${m.sms_thread_key || `message:${m.id}`}:${start?.id || 'legacy'}`;
    return [{client:guardian,guardianId:guardian.guardian_user_id,authorId:original.user_id,direction:inbound?'inbound':'outbound',successful:inbound,occurredAt:m.created_at,conversationKey}];
  });
}

export async function syncSecureParentContact(messageId) {
  return syncSource('secure',messageId,async db => {
    const [[m]]=await db.execute('SELECT * FROM chat_messages WHERE id=?',[messageId]);
    if (!m) return null;
    const [guardians]=await db.execute(`SELECT c.id,c.agency_id,cg.guardian_user_id FROM guardian_client_threads t
      JOIN clients c ON c.id=t.client_id AND c.agency_id=t.agency_id
      JOIN client_guardians cg ON cg.client_id=c.id AND cg.relationship_type<>'self'
      JOIN chat_thread_participants p ON p.thread_id=t.thread_id AND p.user_id=cg.guardian_user_id
      WHERE t.thread_id=?`,[m.thread_id]);
    const [[sender]]=await db.execute('SELECT role FROM users WHERE id=?',[m.sender_user_id]);
    const isStaff=['provider','provider_plus','intern','intern_plus','supervisor','admin','support','super_admin','clinical_practice_assistant'].includes(sender?.role);
    const events=[];
    for(const g of guardians){
      const inbound=Number(g.guardian_user_id)===Number(m.sender_user_id);
      if(!inbound&&!isStaff)continue;
      const [[prior]]=inbound ? await db.execute(`SELECT m.sender_user_id FROM chat_messages m JOIN users u ON u.id=m.sender_user_id
        WHERE m.thread_id=? AND m.id<? AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','admin','support','super_admin','clinical_practice_assistant') ORDER BY m.id DESC LIMIT 1`,[m.thread_id,m.id]) : [[m]];
      if(!prior)continue;
      events.push({client:g,guardianId:g.guardian_user_id,authorId:prior.sender_user_id,direction:inbound?'inbound':'outbound',successful:inbound,occurredAt:m.created_at,conversationId:`secure-${m.thread_id}`,conversationKey:`${m.thread_id}:${m.topic_id || 'legacy'}`});
    }
    return events;
  });
}

export async function reconcileParentContacts({limit=50}={}) {
  const lim=Math.min(200,Math.max(1,Number(limit)||50));
  for(const [type,table,eligible,sync] of [
    ['email','communication_messages',"m.channel='email' AND m.send_status IN ('sent','received','delivered') AND COALESCE(m.is_internal_note,0)=0",syncEmailParentContact],
    ['sms','message_logs',"m.client_id IS NOT NULL AND m.delivery_status IN ('sent','delivered','received')",syncSmsParentContact],
    ['secure','chat_messages','EXISTS (SELECT 1 FROM guardian_client_threads g WHERE g.thread_id=m.thread_id)',syncSecureParentContact]
  ]) {
    const [rows]=await pool.execute(`SELECT m.id FROM ${table} m LEFT JOIN parent_contact_sync_checks s ON s.source_type=? AND s.source_id=m.id
      WHERE s.source_id IS NULL AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) AND ${eligible} ORDER BY m.id DESC LIMIT ${lim}`,[type]);
    for(const row of rows)await sync(row.id);
  }
}
