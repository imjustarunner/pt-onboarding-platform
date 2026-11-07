import pool from '../../config/database.js';

export async function requireMobileThreadMembership(userId,threadId,db=pool){
  const [rows]=await db.execute(`SELECT 1 FROM chat_thread_participants p JOIN chat_threads t ON t.id=p.thread_id
    JOIN user_agencies ua ON ua.user_id=p.user_id AND ua.agency_id=t.agency_id AND COALESCE(ua.is_active,1)=1
    JOIN agencies a ON a.id=t.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    JOIN users actor ON actor.id=p.user_id AND (LOWER(actor.role)<>'school_staff' OR t.message_channel<>'secure')
    WHERE p.thread_id=? AND p.user_id=? LIMIT 1`,[threadId,userId]);
  if(!rows.length)throw Object.assign(new Error('Access denied to this conversation.'),{status:403});return true;
}

export const MOBILE_DESTINATIONS = ['calendar','home','tasks','mywork','noteaid','presence','contacts'];
export const DEFAULT_MOBILE_PREFERENCES = { swipeLeft:'archive', swipeRight:'read', navigationMode:'automatic', pinnedNavigation:['calendar','home','tasks'], usage:{} };
const actions = new Set(['archive','read','unread','none']);
export function normalizeMobilePreferences(value = {}) {
  const pinned = [...new Set((Array.isArray(value.pinnedNavigation) ? value.pinnedNavigation : []).filter(id => MOBILE_DESTINATIONS.includes(id)))].slice(0,4);
  const usage = Object.fromEntries(MOBILE_DESTINATIONS.map(id => [id,Math.max(0,Math.min(1000000,Number(value.usage?.[id]) || 0))]));
  return {swipeLeft:actions.has(value.swipeLeft)?value.swipeLeft:'archive',swipeRight:actions.has(value.swipeRight)?value.swipeRight:'read',navigationMode:value.navigationMode==='pinned'?'pinned':'automatic',pinnedNavigation:pinned.length?pinned:DEFAULT_MOBILE_PREFERENCES.pinnedNavigation,usage};
}
export function maskMobileName(value) { return String(value || 'Private conversation').split(/\s+/).map(word=>word.slice(0,Math.min(2,word.length))+'•••'+(word.match(/[,;:]$/)?.[0] || '')).join(' '); }
export function mobileThreadCategory(thread) {
  if(thread.message_channel==='secure')return 'secure';
  if(thread.thread_type==='channel')return 'channels';
  return thread.thread_type==='direct' && (thread.participants || []).length<=1?'direct':'groups';
}
// Portal provisioning can create a conversation before anyone sends a message.
// A changed membership/updated_at timestamp is not message activity.
export function hasMobileThreadActivity(thread) { return Number(thread.last_message?.id)>0; }
export function mobileMessagePreview(body,attachmentCount=0) {
  const text=typeof body==='string'?body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';
  if(text)return text.slice(0,240);
  const count=Math.max(0,Number(attachmentCount)||0);
  return count?`${count===1?'Attachment':`${count} attachments`} · open to view`:'Message · open to read';
}
export function mobileThreadItem(thread,userId) {
  const category=mobileThreadCategory(thread),secure=category==='secure',parts=thread.participants || [];
  const name=p=>[p?.first_name,p?.last_name].filter(Boolean).join(' ').trim() || p?.email;
  const names=parts.map(name).filter(Boolean);
  const title=(category==='direct'?names.join(', ') || name(thread.other_participant):thread.channel_name || (['Group chat','Shared care','Personal portal'].includes(thread.thread_label)?null:thread.thread_label) || names.join(', ')) || (secure?'Secure conversation':category==='direct'?'Direct conversation':'Team discussion');
  const author=parts.find(p=>Number(p.id)===Number(thread.last_message?.sender_user_id));
  const sender=Number(thread.last_message?.sender_user_id)===Number(userId)?'You':name(author) || title;
  return {key:`chat:${thread.thread_id}`,id:Number(thread.thread_id),kind:'chat',category,title:secure?maskMobileName(title):title,sender:secure?maskMobileName(sender):sender,preview:secure?'Secure message · tap to unlock':mobileMessagePreview(thread.last_message?.body,thread.last_message?.attachment_count),at:thread.last_message?.created_at || null,unread:Number(thread.unread_count)>0,unreadCount:Number(thread.unread_count)||0,needsReply:!!thread.last_message?.sender_user_id && Number(thread.last_message.sender_user_id)!==Number(userId),avatar:secure?null:author?.profile_photo_url || thread.other_participant?.profile_photo_url || null,lastReadMessageId:Number(thread.last_read_message_id)||0,participantCount:parts.length+1,secure};
}
// Preserve the personal mailbox and active-tenant checks used by Quick View.
export const MOBILE_EMAIL_ACCESS_SQL = `EXISTS (SELECT 1 FROM user_agencies member JOIN agencies active_agency ON active_agency.id=member.agency_id AND active_agency.is_active=1 AND COALESCE(active_agency.is_archived,0)=0 WHERE member.user_id=? AND member.agency_id=c.agency_id AND COALESCE(member.is_active,1)=1)
  AND ((c.owner_user_id=? AND NOT EXISTS(SELECT 1 FROM communication_inboxes private_box WHERE private_box.id=c.inbox_id AND private_box.kind='personal' AND private_box.owner_user_id<>c.owner_user_id))
    OR EXISTS(SELECT 1 FROM communication_inboxes mine WHERE mine.id=c.inbox_id AND mine.kind='personal' AND mine.owner_user_id=?)
    OR (c.channel='sms' AND EXISTS(SELECT 1 FROM message_logs sms WHERE sms.agency_id=c.agency_id AND sms.sms_thread_key=c.external_thread_id AND (sms.user_id=? OR sms.assigned_user_id=? OR sms.number_id IN(SELECT number_id FROM twilio_number_assignments WHERE user_id=? AND is_active=1 AND sms_access_enabled=1)))))`;
// Existing mailbox/user address columns can use different MySQL collations.
// Normalize each operand explicitly, including every value in the IN list.
const emailAddressSql=expression=>`(CONVERT(LOWER(TRIM(${expression})) USING utf8mb4) COLLATE utf8mb4_unicode_ci)`;
const senderAddress=emailAddressSql('(SELECT p.email FROM communication_participants p WHERE p.conversation_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1)');
// Registered app addresses, including managed groups, are known even for older mail.
const unknownSql=`(c.channel='email' AND COALESCE(c.is_unknown_sender,0)=1 AND NOT EXISTS(SELECT 1 FROM users known WHERE ${senderAddress} IN(${emailAddressSql('known.email')},${emailAddressSql('known.work_email')},${emailAddressSql('known.personal_email')}))
  AND NOT EXISTS(SELECT 1 FROM managed_workspace_groups known_group WHERE ${emailAddressSql('known_group.email')}=${senderAddress})
  AND NOT EXISTS(SELECT 1 FROM email_sender_identities known_sender WHERE known_sender.is_active=1 AND ${emailAddressSql('known_sender.from_email')}=${senderAddress})
  AND NOT EXISTS(SELECT 1 FROM communication_inboxes known_box WHERE ${emailAddressSql('known_box.from_email')}=${senderAddress}))`;
const unreadSql=`(COALESCE(r.forced_unread,0)=1 OR EXISTS(SELECT 1 FROM communication_messages incoming WHERE incoming.conversation_id=c.id AND incoming.direction='inbound' AND COALESCE(incoming.is_internal_note,0)=0 AND COALESCE(incoming.send_status,'sent') NOT IN('cancelled','preparing') AND (r.last_read_at IS NULL OR r.last_read_at<COALESCE(incoming.sent_at,incoming.created_at))))`;
export function createMobileConversaStore(db=pool) {
  async function preferences(userId) {
    const [[row]]=await db.execute('SELECT preferences_json FROM mobile_workspace_preferences WHERE user_id=?',[userId]);
    let value=row?.preferences_json || {};if(typeof value==='string')try{value=JSON.parse(value);}catch{value={};}
    return normalizeMobilePreferences(value);
  }
  async function savePreferences(userId,body) {
    const current=await preferences(userId);const next=normalizeMobilePreferences({...current,...body});
    await db.execute('INSERT INTO mobile_workspace_preferences(user_id,preferences_json) VALUES(?,?) ON DUPLICATE KEY UPDATE preferences_json=VALUES(preferences_json)',[userId,JSON.stringify(next)]);return next;
  }
  async function archives(userId) {
    const [rows]=await db.execute('SELECT source_kind,source_id,archived_at FROM mobile_message_archives WHERE user_id=?',[userId]);
    return new Map(rows.map(r=>[`${r.source_kind}:${r.source_id}`,r.archived_at]));
  }
  async function archive(userId,kind,id,active) {
    if(active)await db.execute('INSERT INTO mobile_message_archives(user_id,source_kind,source_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE archived_at=CURRENT_TIMESTAMP',[userId,kind,id]);
    else await db.execute('DELETE FROM mobile_message_archives WHERE user_id=? AND source_kind=? AND source_id=?',[userId,kind,id]);
  }
  function emailScope(userId,includeArchived,agencyId=null) {return {where:`c.channel IN('email','sms') AND COALESCE(c.is_spam,0)=0 AND ${MOBILE_EMAIL_ACCESS_SQL} ${includeArchived?'':'AND c.archived_at IS NULL AND archive.archived_at IS NULL'} ${agencyId?'AND c.agency_id=?':''}`,params:[...Array(6).fill(userId),...(agencyId?[agencyId]:[])]};}
  async function emails(userId,{includeArchived=false,beforeAt=null,beforeKey=null,suite='all',filter='all',agencyId=null}={}) {
    const scope=emailScope(userId,includeArchived,agencyId);
    const [rows]=await db.execute(`SELECT c.id,c.channel,c.subject,c.status,c.last_message_preview,COALESCE(c.last_message_at,c.created_at) AS sort_at,
      COALESCE(archive.archived_at,c.archived_at) AS archived_at,${unreadSql} AS is_unread,${unknownSql} AS is_unknown_sender,
      (SELECT p.display_name FROM communication_participants p WHERE p.conversation_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1) AS sender_name,
      ${senderAddress} AS sender_email,
      (SELECT m.from_json FROM communication_messages m WHERE m.conversation_id=c.id AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN('cancelled','preparing') ORDER BY m.id DESC LIMIT 1) AS latest_from
      FROM communication_conversations c LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=?
      LEFT JOIN mobile_message_archives archive ON archive.user_id=? AND archive.source_kind=c.channel AND archive.source_id=c.id
      WHERE ${scope.where} ${['email','sms'].includes(suite)?`AND c.channel='${suite}' AND NOT ${unknownSql}`:suite==='unknown'?`AND ${unknownSql}`:''} ${filter==='unread'?`AND ${unreadSql}`:filter==='needs'?"AND c.status IN('new','needs_reply')":''} ${beforeAt?(beforeKey?"AND (COALESCE(c.last_message_at,c.created_at)<? OR (COALESCE(c.last_message_at,c.created_at)=? AND CONCAT(c.channel,':',LPAD(c.id,20,'0'))<?))":'AND COALESCE(c.last_message_at,c.created_at)<=?'):''}
      ORDER BY COALESCE(c.last_message_at,c.created_at) DESC,c.channel DESC,c.id DESC LIMIT 101`,[userId,userId,...scope.params,...(beforeAt?(beforeKey?[new Date(beforeAt),new Date(beforeAt),beforeKey]:[new Date(beforeAt)]):[])]);
    return rows.map(r=>{
      let from=r.latest_from || {};if(typeof from==='string')try{from=JSON.parse(from);}catch{from={};}
      return {key:`${r.channel}:${r.id}`,kind:r.channel,category:r.channel,id:Number(r.id),title:r.subject || '(No subject)',sender:from.name || r.sender_name || from.email || r.sender_email || 'Sender',senderEmail:from.email || r.sender_email,preview:r.last_message_preview || '',at:r.sort_at,archived:!!r.archived_at,unread:!!Number(r.is_unread),unreadCount:r.is_unread?1:0,needsReply:['new','needs_reply'].includes(r.status),unknown:!!Number(r.is_unknown_sender)};
    });
  }
  async function emailCounts(userId,includeArchived=false,agencyId=null) {
    const scope=emailScope(userId,includeArchived,agencyId);
    const [rows]=await db.execute(`SELECT c.channel,${unknownSql} AS effective_unknown,COUNT(*) AS total,SUM(${unreadSql}) AS unread,SUM(c.status IN('new','needs_reply')) AS needs FROM communication_conversations c
      LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=?
      LEFT JOIN mobile_message_archives archive ON archive.user_id=? AND archive.source_kind=c.channel AND archive.source_id=c.id
      WHERE ${scope.where} GROUP BY c.channel,effective_unknown`,[userId,userId,...scope.params]);
    return rows.map(r=>({category:r.channel,unknown:!!Number(r.effective_unknown),total:Number(r.total),unread:Number(r.unread)||0,needs:Number(r.needs)||0}));
  }
  async function extraCounts(userId,threadIds) {
    const result=Object.fromEntries(['threads','mentions','files'].map(key=>[key,{total:0,unread:0,needs:0}]));if(!threadIds.length)return result;
    const placeholders=threadIds.map(()=>'?').join(',');
    const unread=`(m.sender_user_id<>? AND (r.last_read_message_id IS NULL OR m.id>r.last_read_message_id) AND NOT EXISTS(SELECT 1 FROM chat_message_views v WHERE v.message_id=m.id AND v.user_id=?))`;
    for(const kind of ['threads','mentions','files']){
      let join='',where='',target='m.id',whereParams=[];
      if(kind==='threads'){
        join='JOIN chat_messages root ON root.id=m.parent_message_id';target='root.id';
        where='AND root.parent_message_id IS NULL AND (root.sender_user_id=? OR EXISTS(SELECT 1 FROM chat_messages mine WHERE mine.parent_message_id=root.id AND mine.sender_user_id=?)) AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=root.id AND d.user_id=?)';whereParams=[userId,userId,userId];
      }else if(kind==='mentions'){
        join='JOIN chat_message_mentions mention ON mention.message_id=m.id';where='AND mention.mentioned_user_id=?';whereParams=[userId];
      }else{join='JOIN chat_message_attachments file ON file.message_id=m.id';target='file.id';}
      const needs=kind==='files'?'0':kind==='threads'?`COUNT(DISTINCT CASE WHEN m.sender_user_id<>? AND m.id=(SELECT MAX(latest.id) FROM chat_messages latest WHERE latest.parent_message_id=m.parent_message_id AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=latest.id AND d.user_id=?)) THEN root.id END)`:`COUNT(DISTINCT CASE WHEN ${unread} THEN ${target} END)`;
      const [[row]]=await db.execute(`SELECT COUNT(DISTINCT ${target}) AS total,COUNT(DISTINCT CASE WHEN ${unread} THEN ${target} END) AS unread,${needs} AS needs FROM chat_messages m ${join} LEFT JOIN chat_thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN(${placeholders}) AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?) ${where}`,[userId,userId,...(kind==='files'?[]:[userId,userId]),userId,...threadIds,userId,...whereParams]);
      result[kind]={total:Number(row.total)||0,unread:Number(row.unread)||0,needs:Number(row.needs)||0};
    }
    return result;
  }
  return {preferences,savePreferences,archives,archive,emails,emailCounts,extraCounts};
}
export const mobileConversaStore=createMobileConversaStore();
