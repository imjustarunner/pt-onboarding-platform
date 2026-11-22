import pool from '../config/database.js';
import {familyMessageVisibilitySql,currentSecureThreadFilterSql} from './familySecureMessageAccess.service.js';

// Counts only inbound family messages addressed to this actor, never other staff inboxes.
export async function clientUnreadFamilyCounts({agencyId,clientIds,userId},db=pool,currentFilter=currentSecureThreadFilterSql) {
  if(!clientIds.length)return new Map();
  const filter=await currentFilter(userId);
  const [rows]=await db.execute(`SELECT r.client_id,COUNT(DISTINCT m.id) AS unread_count
    FROM client_secure_message_records r
    JOIN chat_messages m ON m.id=r.message_id AND m.thread_id=r.thread_id
    JOIN chat_threads t ON t.id=m.thread_id AND t.agency_id=? AND t.message_channel='secure'
    JOIN chat_thread_participants viewer ON viewer.thread_id=t.id AND viewer.user_id=?
    JOIN client_guardians sender ON sender.client_id=r.client_id AND sender.guardian_user_id=m.sender_user_id
      AND sender.access_enabled=1
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(sender.permissions_json,'$.relationshipRevoked')),'false')<>'true'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(sender.permissions_json,'$.revoked')),'false')<>'true'
    LEFT JOIN chat_thread_reads rd ON rd.thread_id=t.id AND rd.user_id=viewer.user_id
    LEFT JOIN chat_message_deletes deleted ON deleted.message_id=m.id AND deleted.user_id=viewer.user_id
    WHERE r.client_id IN (${clientIds.map(()=>'?').join(',')}) AND m.sender_user_id<>?
      AND m.id>COALESCE(rd.last_read_message_id,0) AND deleted.message_id IS NULL
      AND ${familyMessageVisibilitySql(userId)} AND ${filter}
    GROUP BY r.client_id`,[agencyId,userId,...clientIds,userId]);
  return new Map(rows.map(row=>[Number(row.client_id),Number(row.unread_count)]));
}

// Reuse inbox visibility, read state, shared-mailbox and correspondence policy.
// Only conversations explicitly filed against these charts are counted.
export async function clientUnreadCorrespondenceCounts({agencyId,clientIds,userId},{db=pool,list=null}={}) {
  if(!clientIds.length)return {counts:new Map(),partial:false};
  list ||= (await import('./unifiedInbox.service.js')).listConversations;
  const conversationIds=[];let partial=false;
  for(let offset=0;offset<1000;offset+=200){
    const rows=await list({agencyId,userId,scopeToUserId:userId,linkedClientIds:clientIds,filter:'unread',syncTickets:false,hideSupportReminderSms:true,limit:200,offset,isAdminViewer:false});
    conversationIds.push(...rows.filter(row=>row.is_unread).map(row=>Number(row.id)));
    if(rows.length<200)break;
    if(offset===800)partial=true;
  }
  if(!conversationIds.length)return {counts:new Map(),partial};
  const [rows]=await db.execute(`SELECT entity_id AS client_id,COUNT(DISTINCT conversation_id) AS unread_count FROM communication_links
    WHERE entity_type='client' AND entity_id IN (${clientIds.map(()=>'?').join(',')}) AND conversation_id IN (${conversationIds.map(()=>'?').join(',')}) GROUP BY entity_id`,[...clientIds,...conversationIds]);
  return {counts:new Map(rows.map(row=>[Number(row.client_id),Number(row.unread_count)])),partial};
}
