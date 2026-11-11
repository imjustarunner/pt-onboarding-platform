import {mobileEmailSchoolIdentities,mobileEmailPersonIdentities} from './emailSchoolIdentity.service.js';
import {groupEmailIdentity,groupEmailNameSql} from '../groupEmailIdentity.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
import pool from '../../config/database.js';
import {publicUploadsUrlFromStoredPath} from '../../utils/uploads.js';

export async function requireMobileThreadMembership(userId,threadId,db=pool,verifyAccess=null){
  const base=`FROM chat_thread_participants p JOIN chat_threads t ON t.id=p.thread_id
    JOIN agencies a ON a.id=t.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    JOIN users actor ON actor.id=p.user_id AND (LOWER(actor.role)<>'school_staff' OR t.message_channel<>'secure')`;
  const [rows]=await db.execute(`SELECT 1 ${base}
    JOIN user_agencies ua ON ua.user_id=p.user_id AND ua.agency_id=t.agency_id AND COALESCE(ua.is_active,1)=1
    WHERE p.thread_id=? AND p.user_id=? LIMIT 1`,[threadId,userId]);
  if(rows.length)return true;
  if(db===pool || verifyAccess){
    const [threads]=await db.execute(`SELECT t.agency_id ${base} WHERE p.thread_id=? AND p.user_id=? LIMIT 1`,[threadId,userId]);
    const check=verifyAccess || (await import('../agencyAccessProfiles.service.js')).readAgencyAccess;
    if(threads.length && await check(userId,threads[0].agency_id,db))return true;
  }
  throw Object.assign(new Error('Access denied to this conversation.'),{status:403});
}

export const MOBILE_DESTINATIONS = ['calendar','home','tasks','mywork','noteaid','presence','contacts','notifications','clients','exchange','support','livechat','applicants'];
export const DEFAULT_MOBILE_PREFERENCES = { swipeLeft:'archive', swipeRight:'read', navigationMode:'pinned', navigationSlots:4, lockedNavigation:'calendar', pinnedNavigation:['calendar','mywork','tasks','home'], usage:{} };
const actions = new Set(['archive','read','unread','none']);
export function normalizeMobilePreferences(value = {}) {
  const pinned = [...new Set((Array.isArray(value.pinnedNavigation) ? value.pinnedNavigation : []).filter(id => MOBILE_DESTINATIONS.includes(id)))].slice(0,4);
  const usage = Object.fromEntries(MOBILE_DESTINATIONS.map(id => [id,Math.max(0,Math.min(1000000,Number(value.usage?.[id]) || 0))]));
  return {swipeLeft:actions.has(value.swipeLeft)?value.swipeLeft:'archive',swipeRight:actions.has(value.swipeRight)?value.swipeRight:'read',navigationMode:'pinned',navigationSlots:[2,3,4].includes(Number(value.navigationSlots))?Number(value.navigationSlots):4,lockedNavigation:value.lockedNavigation==='none' || MOBILE_DESTINATIONS.includes(value.lockedNavigation)?value.lockedNavigation:'calendar',pinnedNavigation:pinned.length?pinned:DEFAULT_MOBILE_PREFERENCES.pinnedNavigation,usage};
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
  return {key:`chat:${thread.thread_id}`,agencyId:Number(thread.agency_id),agencyName:thread.agency_name || null,agencyLogoUrl:mobileAgencyIcon({name:thread.agency_name,slug:thread.agency_slug,logo_path:thread.agency_logo_path}),id:Number(thread.thread_id),kind:'chat',category,title:secure?maskMobileName(title):title,sender:secure?maskMobileName(sender):sender,preview:secure?'Secure message · tap to unlock':mobileMessagePreview(thread.last_message?.body,thread.last_message?.attachment_count),at:thread.last_message?.created_at || null,unread:Number(thread.unread_count)>0,unreadCount:Number(thread.unread_count)||0,needsReply:!!thread.last_message?.sender_user_id && Number(thread.last_message.sender_user_id)!==Number(userId),avatar:secure?null:publicUploadsUrlFromStoredPath((category==='direct'?parts[0]:author)?.profile_photo_url || (category==='direct'?parts[0]:author)?.profile_photo_path || thread.other_participant?.profile_photo_url || thread.other_participant?.profile_photo_path),hasSent:!!thread.has_sent,lastReadMessageId:Number(thread.last_read_message_id)||0,participantCount:parts.length+1,secure};
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
const unknownSqlFor=userId=>`(c.channel='email' AND COALESCE(c.is_unknown_sender,0)=1 AND NOT EXISTS(SELECT 1 FROM users known WHERE ${senderAddress} IN(${emailAddressSql('known.email')},${emailAddressSql('known.work_email')},${emailAddressSql('known.personal_email')}))
  AND NOT EXISTS(SELECT 1 FROM user_communication_contacts saved WHERE saved.owner_user_id=${Number(userId)} AND saved.trust_status='safe' AND ${emailAddressSql('saved.email')}=${senderAddress})
  AND NOT EXISTS(SELECT 1 FROM managed_workspace_groups known_group WHERE ${emailAddressSql('known_group.email')}=${senderAddress})
  AND NOT EXISTS(SELECT 1 FROM email_sender_identities known_sender WHERE known_sender.is_active=1 AND ${emailAddressSql('known_sender.from_email')}=${senderAddress})
  AND NOT EXISTS(SELECT 1 FROM communication_inboxes known_box WHERE ${emailAddressSql('known_box.from_email')}=${senderAddress}))`;
const unreadSql=`(COALESCE(r.forced_unread,0)=1 OR EXISTS(SELECT 1 FROM communication_messages incoming WHERE incoming.conversation_id=c.id AND incoming.direction='inbound' AND COALESCE(incoming.is_internal_note,0)=0 AND COALESCE(incoming.send_status,'sent') NOT IN('cancelled','preparing') AND (r.last_read_at IS NULL OR r.last_read_at<COALESCE(incoming.sent_at,incoming.created_at))))`;
export function createMobileConversaStore(db=pool,{listAgencies=null,groupAccess=null}={}) {
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
  const spamSqlFor=userId=>`(COALESCE(c.is_spam,0)=1 OR EXISTS(SELECT 1 FROM user_communication_contacts blocked WHERE blocked.owner_user_id=${Number(userId)} AND blocked.agency_id=c.agency_id AND blocked.trust_status='blocked' AND CONVERT(LOWER(TRIM(blocked.email)) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(LOWER(TRIM(${senderAddress})) USING utf8mb4) COLLATE utf8mb4_unicode_ci))`;
  async function emailScope(userId,includeArchived,agencyId=null) {
    let access=MOBILE_EMAIL_ACCESS_SQL,params=Array(6).fill(userId),groupIds=[],agencyBrands=new Map();
    if(db===pool || listAgencies){
      const {default:User}=await import('../../models/User.model.js');const {listMobileAgencies}=await import('./agencyScope.service.js');const {groupKeyForIdentity,canAccessDepartmentalGroup}=await import('../departmentalGroupAccess.service.js');
      const user=listAgencies?{id:userId}:await User.findById(userId,{raw:true}),{agencies}=await (listAgencies || listMobileAgencies)(user);
      for(const agency of agencies)agencyBrands.set(Number(agency.id),{agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency)});
      const ids=agencies.map(a=>Number(a.id)).filter(id=>!agencyId || id===Number(agencyId));
      if(!ids.length)return {where:'1=0',params:[],groupIds,agencyBrands};
      const [boxes]=await db.execute(`SELECT * FROM communication_inboxes WHERE agency_id IN(${ids.map(()=>'?').join(',')}) AND kind<>'personal'`,ids);
      const [managed]=await db.execute(`SELECT g.* FROM managed_workspace_groups g JOIN chat_thread_participants p ON p.thread_id=g.chat_thread_id AND p.user_id=? WHERE g.agency_id IN(${ids.map(()=>'?').join(',')})`,[userId,...ids]);
      const denied=[];
      for(const box of boxes){const identity=groupEmailIdentity(box,managed),key=groupKeyForIdentity(box);if(!identity)continue;if(!key){groupIds.push(Number(box.id));continue;}if(await (groupAccess || canAccessDepartmentalGroup)({agencyId:box.agency_id,userId,groupKey:key,db}))groupIds.push(Number(box.id));else denied.push(Number(box.id));}
      const personal=MOBILE_EMAIL_ACCESS_SQL.slice(MOBILE_EMAIL_ACCESS_SQL.indexOf('AND (')+4);
      access=`c.agency_id IN(${ids.map(()=>'?').join(',')}) AND (${personal}${groupIds.length?` OR c.inbox_id IN(${groupIds.map(()=>'?').join(',')})`:''})${denied.length?` AND (c.inbox_id IS NULL OR c.inbox_id NOT IN(${denied.map(()=>'?').join(',')}))`:''}`;
      params=[...ids,...Array(5).fill(userId),...groupIds,...denied];
    }
    return {where:`c.channel IN('email','sms') AND ${access} ${includeArchived?'':`AND ((c.archived_at IS NULL AND archive.archived_at IS NULL) OR ${spamSqlFor(userId)})`} ${agencyId?'AND c.agency_id=?':''}`,params:[...params,...(agencyId?[agencyId]:[])],groupIds,agencyBrands};
  }
  function groupSql(scope){return scope.groupIds.length?`(c.inbox_id IN(${scope.groupIds.join(',')}))`:'0';}
  const sentSql=userId=>`EXISTS(SELECT 1 FROM communication_messages outbound WHERE outbound.conversation_id=c.id AND outbound.direction='outbound' AND COALESCE(outbound.is_internal_note,0)=0 AND COALESCE(outbound.send_status,'sent')='sent' AND outbound.author_user_id=${Number(userId)})`;
  // A group ticket's canonical claimant, not its historical conversation owner,
  // determines whose personal unread badge it belongs in. Visibility is unchanged.
   const effectiveUnread=(scope,userId)=>`(${unreadSql} AND (NOT ${groupSql(scope)} OR t.id IS NULL OR (t.claimed_by_user_id=${Number(userId)} AND t.status NOT IN('closed','resolved','done','answered','waiting','pending_external'))))`;
  const groupNameSql=groupEmailNameSql;
  async function emails(userId,{includeArchived=false,beforeAt=null,beforeKey=null,suite='all',filter='all',agencyId=null}={},resolvedScope=null) {
    const scope=resolvedScope || await emailScope(userId,includeArchived,agencyId),unknownSql=unknownSqlFor(userId),effectiveRead=effectiveUnread(scope,userId);
    const [rows]=await db.execute(`SELECT c.id,c.agency_id,c.inbox_id,${spamSqlFor(userId)} AS mobile_spam,${groupSql(scope)} AS is_group,c.channel,c.subject,c.status,${groupNameSql} AS group_name,i.from_email AS destination_account,c.last_message_preview,COALESCE(c.last_message_at,c.created_at) AS sort_at,
      COALESCE(archive.archived_at,c.archived_at) AS archived_at,${effectiveRead} AS is_unread,${sentSql(userId)} AS has_sent,${unknownSql} AS is_unknown_sender,
      (SELECT p.display_name FROM communication_participants p WHERE p.conversation_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1) AS sender_name,
      ${senderAddress} AS sender_email,
      (SELECT m.auto_reply_kind FROM communication_messages m WHERE m.conversation_id=c.id AND COALESCE(m.is_internal_note,0)=0 AND m.auto_reply_kind='school_group_notification' LIMIT 1) AS latest_kind,
      (SELECT m.from_json FROM communication_messages m WHERE m.conversation_id=c.id AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent') NOT IN('cancelled','preparing') ORDER BY m.id DESC LIMIT 1) AS latest_from
      FROM communication_conversations c LEFT JOIN communication_inboxes i ON i.id=c.inbox_id LEFT JOIN support_tickets t ON t.id=c.support_ticket_id AND t.agency_id=c.agency_id LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=?
      LEFT JOIN mobile_message_archives archive ON archive.user_id=? AND archive.source_kind=c.channel AND archive.source_id=c.id
      WHERE ${scope.where} AND ${spamSqlFor(userId)}=${suite==='spam'?1:0} ${suite==='groups'?`AND ${groupSql(scope)}`:['email','sms'].includes(suite)?`AND c.channel='${suite}' AND NOT ${unknownSql} AND NOT ${groupSql(scope)}`:suite==='unknown'?`AND ${unknownSql}`:''} ${filter==='unread'?`AND ${effectiveRead}`:filter==='needs'?"AND c.status IN('new','needs_reply')":filter==='sent'?`AND ${sentSql(userId)}`:''} ${beforeAt?(beforeKey?"AND (COALESCE(c.last_message_at,c.created_at)<? OR (COALESCE(c.last_message_at,c.created_at)=? AND CONCAT(c.channel,':',LPAD(c.id,20,'0'))<?))":'AND COALESCE(c.last_message_at,c.created_at)<=?'):''}
      ORDER BY COALESCE(c.last_message_at,c.created_at) DESC,c.channel DESC,c.id DESC LIMIT 101`,[userId,userId,...scope.params,...(beforeAt?(beforeKey?[new Date(beforeAt),new Date(beforeAt),beforeKey]:[new Date(beforeAt)]):[])]);
    const [schools,people]=await Promise.all([mobileEmailSchoolIdentities(rows,{db}),mobileEmailPersonIdentities(rows,{db})]);
    return rows.map(r=>{
      let from=r.latest_from || {};if(typeof from==='string')try{from=JSON.parse(from);}catch{from={};}
      return {...(scope.agencyBrands?.get(Number(r.agency_id))||{}),...(schools.get(Number(r.id))||{}),...(people.get(Number(r.id))||{}),key:`${r.channel}:${r.id}`,kind:r.channel,category:Number(r.mobile_spam)?'spam':Number(r.is_group)?'groups':r.channel,groupName:Number(r.is_group)?r.group_name || 'Group':null,destinationAccount:r.destination_account || null,agencyId:Number(r.agency_id),id:Number(r.id),title:r.subject || '(No subject)',sender:from.name || r.sender_name || from.email || r.sender_email || 'Sender',senderEmail:from.email || r.sender_email,preview:r.last_message_preview || '',at:r.sort_at,archived:!!r.archived_at,unread:!!Number(r.is_unread),unreadCount:r.is_unread?1:0,hasSent:!!Number(r.has_sent),needsReply:['new','needs_reply'].includes(r.status),unknown:!Number(r.mobile_spam) && !Number(r.is_group) && !!Number(r.is_unknown_sender)};
    });
  }
  async function emailCounts(userId,includeArchived=false,agencyId=null,resolvedScope=null) {
    const scope=resolvedScope || await emailScope(userId,includeArchived,agencyId),unknownSql=unknownSqlFor(userId),effectiveRead=effectiveUnread(scope,userId);
    const [rows]=await db.execute(`SELECT c.channel,${spamSqlFor(userId)} AS mobile_spam,${groupSql(scope)} AS is_group,${unknownSql} AS effective_unknown,COUNT(*) AS total,SUM(${effectiveRead}) AS unread,SUM(c.status IN('new','needs_reply')) AS needs,SUM(${sentSql(userId)}) AS sent FROM communication_conversations c
      LEFT JOIN communication_inboxes i ON i.id=c.inbox_id LEFT JOIN support_tickets t ON t.id=c.support_ticket_id AND t.agency_id=c.agency_id
      LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=?
      LEFT JOIN mobile_message_archives archive ON archive.user_id=? AND archive.source_kind=c.channel AND archive.source_id=c.id
      WHERE ${scope.where} GROUP BY c.channel,mobile_spam,is_group,effective_unknown`,[userId,userId,...scope.params]);
    return rows.map(r=>({category:Number(r.mobile_spam)?'spam':Number(r.is_group)?'groups':r.channel,unknown:!!Number(r.effective_unknown),total:Number(r.total),unread:Number(r.unread)||0,needs:Number(r.needs)||0,sent:Number(r.sent)||0}));
  }
  async function extraCounts(userId,threadIds) {
    const result=Object.fromEntries(['threads','mentions','files'].map(key=>[key,{total:0,unread:0,needs:0,sent:0}]));if(!threadIds.length)return result;
    const placeholders=threadIds.map(()=>'?').join(',');
    const unread=`(m.sender_user_id<>? AND (r.last_read_message_id IS NULL OR m.id>r.last_read_message_id) AND NOT EXISTS(SELECT 1 FROM chat_message_views v WHERE v.message_id=m.id AND v.user_id=?))`;
    for(const kind of ['threads','mentions','files']){
      let join='',where='',target='m.id',whereParams=[];
      if(kind==='threads'){
        join='JOIN chat_messages root ON root.id=m.parent_message_id';target='root.id';
        where='AND root.parent_message_id IS NULL AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=root.id AND d.user_id=?)';whereParams=[userId];
      }else if(kind==='mentions'){
        join='JOIN chat_message_mentions mention ON mention.message_id=m.id';where='AND mention.mentioned_user_id=?';whereParams=[userId];
      }else{join='JOIN chat_message_attachments file ON file.message_id=m.id';target='file.id';}
      const needs=kind==='files'?'0':kind==='threads'?`COUNT(DISTINCT CASE WHEN m.sender_user_id<>? AND m.id=(SELECT MAX(latest.id) FROM chat_messages latest WHERE latest.parent_message_id=m.parent_message_id AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=latest.id AND d.user_id=?)) THEN root.id END)`:`COUNT(DISTINCT CASE WHEN ${unread} THEN ${target} END)`;
      const [[row]]=await db.execute(`SELECT COUNT(DISTINCT ${target}) AS total,COUNT(DISTINCT CASE WHEN ${unread} THEN ${target} END) AS unread,${needs} AS needs,COUNT(DISTINCT CASE WHEN (m.sender_user_id=${Number(userId)}${kind==='threads'?` OR root.sender_user_id=${Number(userId)}`:''}) THEN ${target} END) AS sent FROM chat_messages m ${join} LEFT JOIN chat_thread_reads r ON r.thread_id=m.thread_id AND r.user_id=? WHERE m.thread_id IN(${placeholders}) AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?) ${where}`,[userId,userId,...(kind==='files'?[]:[userId,userId]),userId,...threadIds,userId,...whereParams]);
      result[kind]={total:Number(row.total)||0,unread:Number(row.unread)||0,needs:Number(row.needs)||0,sent:Number(row.sent)||0};
    }
    return result;
  }
  async function emailInbox(userId,options={}) {
    // This scope is shared only inside this request, never across users or requests.
    const scope=await emailScope(userId,options.includeArchived || false,options.agencyId || null);
    return Promise.all([emails(userId,options,scope),emailCounts(userId,options.includeArchived || false,options.agencyId || null,scope)]);
  }
  return {preferences,savePreferences,archives,archive,emails,emailCounts,emailInbox,extraCounts};
}
export const mobileConversaStore=createMobileConversaStore();
