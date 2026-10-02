import pool from '../config/database.js';
import {canAccessHubClient} from './hubPeopleAccess.service.js';

const parse = value => { if(typeof value !== 'string') return value; try{return JSON.parse(value);}catch{return null;} };
const addresses = value => (Array.isArray(value) ? value : typeof value==='string' ? value.split(/[,;]/) : value ? [value] : []).map(v=>String(v?.email || v || '').trim().toLowerCase()).filter(v=>v.includes('@'));
export async function emailClientCandidates(agencyId, emails) {
  const values=[...new Set(addresses(emails))];
  if(!values.length) return [];
  const ph=values.map(()=>'?').join(',');
  const [rows]=await pool.execute(`SELECT DISTINCT c.id,c.full_name,c.initials FROM clients c
    WHERE c.agency_id=? AND (LOWER(c.email) IN (${ph})
      OR EXISTS (SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=c.id AND (LOWER(u.email) IN (${ph}) OR LOWER(u.personal_email) IN (${ph})))
      OR EXISTS (SELECT 1 FROM agency_contacts ac WHERE ac.client_id=c.id AND ac.agency_id=c.agency_id AND ac.is_active=1 AND LOWER(ac.email) IN (${ph})))
    ORDER BY COALESCE(c.full_name,c.initials),c.id`, [agencyId,...values,...values,...values,...values]);
  return rows;
}

// Called before claiming a draft for send. Selection never grants chart access.
export async function resolveEmailClientFiling({agencyId,userId,to,cc,bcc,clientIds=[],defer=false}) {
  const candidates=await emailClientCandidates(agencyId,[...addresses(to),...addresses(cc),...addresses(bcc)]);
  const ids=[...new Set((clientIds || []).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
  if(ids.length){
    for(const id of ids) if(!candidates.some(c=>Number(c.id)===id) || !await canAccessHubClient({userId,clientId:id,agencyId})) throw Object.assign(new Error('Choose a client linked to a recipient that you can access.'),{status:400});
    return {clientIds:ids,deferred:false};
  }
  if(candidates.length===1) return {clientIds:[Number(candidates[0].id)],deferred:false};
  if(candidates.length>1 && !defer){
    const choices=[];
    for(const c of candidates) if(await canAccessHubClient({userId,clientId:c.id,agencyId})) choices.push({id:c.id,name:c.full_name || c.initials || `Client #${c.id}`});
    if(choices.length) throw Object.assign(new Error('Which client or clients is this conversation about?'),{status:409,code:'CLIENT_FILING_CHOICE_REQUIRED',clients:choices});
  }
  return {clientIds:[],deferred:candidates.length>1};
}

export async function linkConversationClients(conversationId,clientIds,{deferred=false}={}) {
  for(const id of clientIds || []) await pool.execute("INSERT INTO communication_links (conversation_id,entity_type,entity_id,label) VALUES (?,'client',?,'Email conversation') ON DUPLICATE KEY UPDATE label=label",[conversationId,id]);
  if(deferred) await pool.execute("INSERT INTO communication_links (conversation_id,entity_type,entity_id,label) VALUES (?,'client_filing_review',1,'Choose client or clients for this thread') ON DUPLICATE KEY UPDATE label=label",[conversationId]);
  else if(clientIds?.length) await pool.execute("DELETE FROM communication_links WHERE conversation_id=? AND entity_type='client_filing_review'",[conversationId]);
}

// Inbound messages and scheduled sends reach this through the message model.
// The message itself remains the durable record; links add chart attribution.
export async function autoFileEmailMessage(messageId) {
  const [[m]]=await pool.execute(`SELECT m.*,c.agency_id FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id WHERE m.conversation_id=(SELECT conversation_id FROM communication_messages WHERE id=?) AND m.channel='email' AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','preparing','failed') ORDER BY m.id LIMIT 1`,[messageId]);
  if(!m || ['cancelled','preparing'].includes(m.send_status)) return;
  const [linked]=await pool.execute("SELECT entity_type FROM communication_links WHERE conversation_id=? AND entity_type IN ('client','client_filing_review')",[m.conversation_id]);
  if(linked.length) return;
  const emails=m.direction==='inbound' ? addresses(parse(m.from_json)) : [...addresses(parse(m.to_json)),...addresses(parse(m.cc_json)),...addresses(parse(m.bcc_json))];
  const clients=await emailClientCandidates(m.agency_id,emails);
  if(clients.length===1) await linkConversationClients(m.conversation_id,[Number(clients[0].id)]);
  else if(clients.length>1) await linkConversationClients(m.conversation_id,[],{deferred:true});
}

export async function listClientEmailThreads(clientId) {
  const [rows]=await pool.execute(`SELECT c.id,c.subject,c.channel,c.last_message_at,
    (SELECT COUNT(*) FROM communication_messages m WHERE m.conversation_id=c.id AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','preparing')) AS message_count
    FROM communication_conversations c JOIN communication_links l ON l.conversation_id=c.id AND l.entity_type='client' AND l.entity_id=?
    JOIN clients cl ON cl.id=l.entity_id AND cl.agency_id=c.agency_id
    WHERE c.channel='email' ORDER BY c.last_message_at DESC,c.id DESC`,[clientId]);
  return rows.filter(r=>Number(r.message_count)>0);
}

export async function clientEmailThread(clientId,conversationId) {
  const [[linked]]=await pool.execute(`SELECT c.id,c.subject FROM communication_conversations c JOIN communication_links l ON l.conversation_id=c.id AND l.entity_type='client' AND l.entity_id=? JOIN clients cl ON cl.id=l.entity_id AND cl.agency_id=c.agency_id WHERE c.id=?`,[clientId,conversationId]);
  if(!linked) throw Object.assign(new Error('Conversation not found'),{status:404});
  const [messages]=await pool.execute(`SELECT m.id,m.direction,m.from_json,m.to_json,m.cc_json,m.bcc_json,m.subject,m.internet_message_id,m.body_text,m.body_html,m.sent_at,m.created_at,m.send_status,
    u.first_name AS author_first_name,u.last_name AS author_last_name
    FROM communication_messages m LEFT JOIN users u ON u.id=m.author_user_id
    WHERE m.conversation_id=? AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','preparing') ORDER BY m.id`,[conversationId]);
  const {contactPurposeHistory}=await import('./contactDocumentation.service.js');
  const documentation=await contactPurposeHistory('email',conversationId);
  return {...linked,documentation,messages:messages.map(m=>({...m,from:parse(m.from_json),to:parse(m.to_json),cc:parse(m.cc_json),bcc:parse(m.bcc_json)}))};
}

export async function clientSecureThreads(clientId) {
  const [rows]=await pool.execute(`SELECT g.thread_id,t.name FROM guardian_client_threads g JOIN chat_threads t ON t.id=g.thread_id JOIN clients c ON c.id=g.client_id AND c.agency_id=g.agency_id WHERE g.client_id=?`,[clientId]);
  const {decryptChatText}=await import('./chatEncryption.service.js');
  const threads=[];
  for(const row of rows){
    const [messages]=await pool.execute(`SELECT m.*,u.first_name AS author_first_name,u.last_name AS author_last_name FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_user_id WHERE m.thread_id=? ORDER BY m.id`,[row.thread_id]);
    const {contactPurposeHistory}=await import('./contactDocumentation.service.js');
    const [participants]=await pool.execute('SELECT u.first_name,u.last_name FROM chat_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.thread_id=?',[row.thread_id]);
    threads.push({documentation:await contactPurposeHistory('secure',row.thread_id),id:`secure-${row.thread_id}`,subject:row.name || 'Shared care messages',messages:messages.map(m=>({...m,from:{name:[m.author_first_name,m.author_last_name].filter(Boolean).join(' ')},to:participants.map(p=>({name:[p.first_name,p.last_name].filter(Boolean).join(' ')})),body_text:m.body_ciphertext?decryptChatText({ciphertextB64:m.body_ciphertext,ivB64:m.body_iv,authTagB64:m.body_auth_tag,keyId:m.encryption_key_id}):m.body || ''}))});
  }
  return threads;
}

export async function conversationFilingChoices(conversationId,userId) {
  const [[conv]]=await pool.execute('SELECT agency_id FROM communication_conversations WHERE id=?',[conversationId]);
  if(!conv)throw Object.assign(new Error('Conversation not found'),{status:404});
  const [participants]=await pool.execute('SELECT email FROM communication_participants WHERE conversation_id=?',[conversationId]);
  const candidates=await emailClientCandidates(conv.agency_id,participants);
  const choices=[];
  for(const c of candidates)if(await canAccessHubClient({userId,clientId:c.id,agencyId:conv.agency_id}))choices.push({id:c.id,name:c.full_name || c.initials || `Client #${c.id}`});
  const [links]=await pool.execute("SELECT entity_type,entity_id FROM communication_links WHERE conversation_id=? AND entity_type IN ('client','client_filing_review')",[conversationId]);
  return {clients:choices,clientIds:links.filter(l=>l.entity_type==='client' && choices.some(c=>Number(c.id)===Number(l.entity_id))).map(l=>Number(l.entity_id)),needsReview:links.some(l=>l.entity_type==='client_filing_review')};
}

export async function fileExistingConversation(conversationId,userId,clientIds) {
  const choices=await conversationFilingChoices(conversationId,userId);
  if(!Array.isArray(clientIds) || clientIds.length>50)throw Object.assign(new Error('Choose up to 50 available clients.'),{status:400});
  const ids=[...new Set(clientIds.map(Number))];
  if(!ids.length || ids.some(id=>!choices.clients.some(c=>Number(c.id)===id))) throw Object.assign(new Error('Choose at least one available client.'),{status:400});
  // Additive filing: never silently remove an existing medical record association.
  await linkConversationClients(conversationId,ids);
  return {ok:true};
}

// A bounded retry/backfill catches historical messages and transient filing errors.
// It never guesses among siblings. Checkpoints are separate from medical links.
export async function reconcileClientEmailFiling({limit=50}={}) {
  const lim=Math.min(200,Math.max(1,Number(limit)||50));
  const [rows]=await pool.execute(`SELECT m.id FROM communication_messages m
    LEFT JOIN communication_filing_checks checked ON checked.message_id=m.id
    WHERE m.channel='email' AND COALESCE(m.is_internal_note,0)=0
      AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','preparing','failed')
      AND checked.message_id IS NULL ORDER BY m.id DESC LIMIT ${lim}`);
  for(const row of rows){
    await autoFileEmailMessage(row.id);
    await pool.execute('INSERT IGNORE INTO communication_filing_checks (message_id) VALUES (?)',[row.id]);
  }
  return rows.length;
}

export async function listClientCommunicationThreads(clientId) {
  const emails=await listClientEmailThreads(clientId);
  const [secure]=await pool.execute(`SELECT CONCAT('secure-',t.id) AS id,t.name AS subject,'secure' AS channel,
    COUNT(m.id) AS message_count,MAX(m.created_at) AS last_message_at
    FROM guardian_client_threads g JOIN clients c ON c.id=g.client_id AND c.agency_id=g.agency_id
    JOIN chat_threads t ON t.id=g.thread_id JOIN chat_messages m ON m.thread_id=t.id
    WHERE g.client_id=? GROUP BY t.id,t.name`,[clientId]);
  return [...emails,...secure].sort((a,b)=>new Date(b.last_message_at)-new Date(a.last_message_at));
}
export async function clientCommunicationThread(clientId,key) {
  if(/^secure-[1-9][0-9]*$/.test(String(key))){
    const thread=(await clientSecureThreads(clientId)).find(t=>t.id===key);
    if(!thread)throw Object.assign(new Error('Conversation not found'),{status:404});
    return thread;
  }
  if(!/^[1-9][0-9]*$/.test(String(key)))throw Object.assign(new Error('Conversation not found'),{status:404});
  return clientEmailThread(clientId,Number(key));
}
