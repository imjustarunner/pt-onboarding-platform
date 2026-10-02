import pool from '../config/database.js';
import {hubClientScope} from './hubPeopleAccess.service.js';
import {clientEmailThread, clientSecureThreads} from './clientConversationRecord.service.js';
import {encryptChatText, decryptChatText} from './chatEncryption.service.js';

const failure = (message,status=400) => Object.assign(new Error(message),{status});
const allowedTypes = new Set(['email','secure']);
const delivered = "COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','preparing','failed','scheduled','queued')";

// Tasks are derived from durable messages, not inserted for each reply. The unique
// identity is (staff member, channel, thread); a newer message reopens the same task.
export async function contactSources(userId,agencyId,{sourceType=null,sourceId=null}={}) {
  const scope=hubClientScope(userId);
  const emailScope=hubClientScope(userId,'cl');
  const emailFilter=sourceId ? ' AND c.id=?' : '';
  const secureFilter=sourceId ? ' AND t.id=?' : '';
  const items=[];
  if(!sourceType || sourceType==='email') {
    const [rows]=await pool.execute(`SELECT 'email' AS source_type,c.id AS source_id,c.agency_id,c.subject,
      MAX(m.id) AS latest_message_id,MAX(COALESCE(m.sent_at,m.created_at)) AS last_message_at,COUNT(*) AS message_count
      FROM communication_conversations c JOIN communication_messages m ON m.conversation_id=c.id AND ${delivered}
      WHERE c.channel='email' AND c.agency_id=?
        AND (c.owner_user_id=? OR EXISTS (SELECT 1 FROM communication_messages own WHERE own.conversation_id=c.id AND own.author_user_id=?)
          OR EXISTS (SELECT 1 FROM communication_inboxes i WHERE i.id=c.inbox_id AND i.kind='personal' AND i.owner_user_id=?))
        AND EXISTS (SELECT 1 FROM communication_links l JOIN clients cl ON cl.id=l.entity_id AND cl.agency_id=c.agency_id
          WHERE l.conversation_id=c.id AND l.entity_type='client' AND ${emailScope.sql})${emailFilter}
      GROUP BY c.id,c.agency_id,c.subject`,[agencyId,userId,userId,userId,...scope.params,...(sourceId?[sourceId]:[])]);
    items.push(...rows);
  }
  if(!sourceType || sourceType==='secure') {
    const [rows]=await pool.execute(`SELECT 'secure' AS source_type,t.id AS source_id,g.agency_id,t.name AS subject,
      MAX(m.id) AS latest_message_id,MAX(m.created_at) AS last_message_at,COUNT(*) AS message_count
      FROM guardian_client_threads g JOIN clients c ON c.id=g.client_id AND c.agency_id=g.agency_id
      JOIN chat_threads t ON t.id=g.thread_id JOIN chat_messages m ON m.thread_id=t.id
      WHERE g.agency_id=? AND ${scope.sql}
        AND EXISTS (SELECT 1 FROM chat_thread_participants p WHERE p.thread_id=t.id AND p.user_id=?)${secureFilter}
      GROUP BY t.id,g.agency_id,t.name`,[agencyId,...scope.params,userId,...(sourceId?[sourceId]:[])]);
    items.push(...rows);
  }
  return items;
}

async function latestReview(userId,type,id) {
  const [[row]]=await pool.execute('SELECT * FROM contact_documentation_reviews WHERE user_id=? AND source_type=? AND source_id=? ORDER BY revision DESC LIMIT 1',[userId,type,id]);
  return row || null;
}
export function reviewState(source,review) {
  return {...source,key:`${source.source_type}:${source.source_id}`,revision:Number(review?.revision || 0),
    reviewedThroughId:Number(review?.reviewed_through_id || 0),
    needsReview:Number(source.latest_message_id)>Number(review?.reviewed_through_id || 0),
    purpose:review?.purpose_enc ? decryptChatText(JSON.parse(review.purpose_enc)) : '',completedAt:review?.completed_at || null};
}
async function linkedClients(source,userId) {
  const scope=hubClientScope(userId);
  const sql=source.source_type==='email'
    ? "JOIN communication_links l ON l.entity_type='client' AND l.entity_id=c.id WHERE l.conversation_id=?"
    : 'JOIN guardian_client_threads l ON l.client_id=c.id WHERE l.thread_id=?';
  const [rows]=await pool.execute(`SELECT c.id,COALESCE(c.full_name,c.initials) AS name FROM clients c ${sql} AND c.agency_id=? AND ${scope.sql}`,[source.source_id,source.agency_id,...scope.params]);
  return rows;
}
export async function listContactDocumentation(userId,agencyId) {
  const sources=await contactSources(userId,agencyId);
  // One batched review read; source access has already been checked above.
  const [reviews]=await pool.execute(`SELECT r.* FROM contact_documentation_reviews r JOIN
    (SELECT source_type,source_id,MAX(revision) AS revision FROM contact_documentation_reviews WHERE user_id=? GROUP BY source_type,source_id) last
    ON last.source_type=r.source_type AND last.source_id=r.source_id AND last.revision=r.revision WHERE r.user_id=?`,[userId,userId]);
  const byKey=new Map(reviews.map(r=>[`${r.source_type}:${r.source_id}`,r]));
  return sources.map(s=>reviewState(s,byKey.get(`${s.source_type}:${s.source_id}`))).sort((a,b)=>Number(b.needsReview)-Number(a.needsReview) || new Date(b.last_message_at)-new Date(a.last_message_at));
}
export async function contactDocumentationDetail(userId,agencyId,type,id) {
  if(!allowedTypes.has(type) || !Number.isSafeInteger(Number(id)) || Number(id)<1)throw failure('Invalid conversation');
  const [source]=await contactSources(userId,agencyId,{sourceType:type,sourceId:Number(id)});
  if(!source)throw failure('Conversation not found',404);
  const clients=await linkedClients(source,userId);
  if(!clients.length)throw failure('Conversation not found',404);
  const thread=type==='email' ? await clientEmailThread(clients[0].id,id) : (await clientSecureThreads(clients[0].id)).find(t=>t.id===`secure-${id}`);
  return {...reviewState(source,await latestReview(userId,type,id)),clients,thread};
}
export async function saveContactDocumentation(userId,agencyId,type,id,{purpose,revision,reviewedThroughId,complete=false}={}) {
  const current=await contactDocumentationDetail(userId,agencyId,type,id);
  const value=String(purpose || '').trim();
  if(value.length>10000)throw failure('Keep the contact purpose under 10,000 characters.');
  if(complete && !value)throw failure('Add the reason or purpose for this contact before completing it.');
  if(Number(revision)!==current.revision)throw failure('This task changed in another window. Reload it before saving.',409);
  const through=Number(reviewedThroughId);
  if(complete && (!Number.isSafeInteger(through) || through<1 || through>Number(current.latest_message_id) || !current.thread.messages.some(m=>Number(m.id)===through)))throw failure('Reload the conversation before completing it.',409);
  // A reply arriving during editing stays unreviewed. Never silently include it.
  const reviewed=complete ? Math.max(current.reviewedThroughId,through) : current.reviewedThroughId;
  try {
    await pool.execute(`INSERT INTO contact_documentation_reviews
      (user_id,source_type,source_id,revision,reviewed_through_id,purpose_enc,completed_at) VALUES (?,?,?,?,?,?,?)`,
      [userId,type,id,current.revision+1,reviewed,JSON.stringify(encryptChatText(value)),complete?new Date():null]);
  }catch(e){if(e.code==='ER_DUP_ENTRY')throw failure('This task changed in another window. Reload it before saving.',409);throw e;}
  return contactDocumentationDetail(userId,agencyId,type,id);
}

export async function contactPurposeHistory(type,id) {
  const [rows]=await pool.execute(`SELECT r.*,u.first_name,u.last_name FROM contact_documentation_reviews r
    LEFT JOIN users u ON u.id=r.user_id WHERE r.source_type=? AND r.source_id=? 
    ORDER BY r.id`,[type,id]);
  return rows.map(r=>({author:[r.first_name,r.last_name].filter(Boolean).join(' '),purpose:decryptChatText(JSON.parse(r.purpose_enc)),createdAt:r.created_at,completed:!!r.completed_at,reviewedThroughId:r.reviewed_through_id}));
}
