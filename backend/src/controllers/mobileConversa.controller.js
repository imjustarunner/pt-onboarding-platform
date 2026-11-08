import {mobileAgencyIcon} from '../services/mobile/agencyBrand.service.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import {assertThreadAccess,markRead,markUnread} from './chat.controller.js';
import {updateConversation} from '../services/unifiedInbox.service.js';
import {qvListChatThreads,qvListChatChannels,qvListThreadsInbox,qvListMentions,qvListFiles} from './quickViewSurfaces.controller.js';
import {requireConversationAccess} from '../services/communicationAccess.service.js';
import {mobileConversaStore,mobileThreadItem,hasMobileThreadActivity} from '../services/mobile/conversa.service.js';
import {publicUploadsUrlFromStoredPath} from '../utils/uploads.js';
import {downloadSecureChatAttachment} from './chatAttachments.controller.js';
import StorageService from '../services/storage.service.js';
import fs from 'node:fs/promises';
import {getMobileDocumentationQueue} from '../services/mobile/documentationQueue.service.js';
import {mobileQaAgencyId,assertMobileQaThread,assertMobileQaConversation} from '../services/mobile/qaConversaScope.service.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const mobile=fn=>async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{if(!req.quickView.mobileDeviceSessionId)throw fail(403,'Sign into Auricwell mobile to use this feature.');await fn(req,res,next);}
  catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
};
// Reuse the existing role, membership, secure-audience and deleted-message checks.
function invoke(handler,request,query={}) {
  const req=Object.assign(Object.create(request),{query:{...request.query,...query},params:{...request.params},headers:{...request.headers}});
  return new Promise((resolve,reject)=>{
    let status=200;const res={set(){return this;},status(value){status=value;return this;},json(body){if(status>=400)reject(fail(status,body?.error?.message || 'This view is unavailable.'));else resolve(body);return this;}};
    Promise.resolve(handler(req,res,reject)).catch(reject);
  });
}
function parseCursor(value) {
  if(!value)return null;
  try{const c=JSON.parse(Buffer.from(String(value),'base64url').toString());if(!Number.isFinite(new Date(c.at).getTime()) || !/^(chat|email|sms|threads|mentions|files):\d+$/.test(c.key))throw 0;return c;}catch{throw fail(400,'Invalid inbox cursor.');}
}
function countsFor(items) {return {total:items.length,unread:items.filter(i=>i.unread).length,needs:items.filter(i=>i.needsReply).length,sent:items.filter(i=>i.hasSent).length};}
const sortKey=item=>{const [kind,id]=String(item.key).split(':');return `${kind}:${String(id).padStart(20,'0')}`;};
const matches=(item,filter)=>filter==='unread'?item.unread:filter==='needs'?item.needsReply:filter==='sent'?item.hasSent:true;
export const getMobileInbox=mobile(async(req,res)=>{
  const userId=req.quickView.userId,includeArchived=req.query.includeArchived==='1',cursor=parseCursor(req.query.cursor);
  const suite=String(req.query.suite || 'all'),filter=String(req.query.filter || 'all');
  const qaAgencyId=mobileQaAgencyId(req);
  const [rawThreads,emails,emailCounts,archives]=await Promise.all([
    invoke(qvListChatThreads,req,{agencyId:qaAgencyId || 'all'}),mobileConversaStore.emails(userId,{includeArchived,beforeAt:cursor?.at,beforeKey:cursor?.key,suite,filter,agencyId:qaAgencyId}),mobileConversaStore.emailCounts(userId,includeArchived,qaAgencyId),mobileConversaStore.archives(userId)
  ]);
  let chats=(Array.isArray(rawThreads)?rawThreads:rawThreads.threads || []).filter(thread=>(!qaAgencyId||Number(thread.agency_id)===qaAgencyId)&&hasMobileThreadActivity(thread)).map(thread=>({...mobileThreadItem(thread,userId),archived:archives.has(`chat:${thread.thread_id}`)}));
  if(!includeArchived)chats=chats.filter(item=>!item.archived);
  const counts=await mobileConversaStore.extraCounts(userId,chats.filter(item=>!item.secure).map(item=>item.id));
  for(const category of ['direct','groups','channels','secure'])counts[category]=countsFor(chats.filter(i=>i.category===category));
  for(const category of ['email','sms','unknown'])counts[category]={total:0,unread:0,needs:0,sent:0};
  for(const row of emailCounts){const key=row.unknown && row.category!=='groups'?'unknown':row.category;for(const field of ['total','unread','needs','sent'])counts[key][field]+=(row[field]||0);}
  counts.all=['direct','groups','channels','secure','email','sms','unknown'].map(key=>counts[key]).reduce((sum,c)=>({total:sum.total+c.total,unread:sum.unread+c.unread,needs:sum.needs+c.needs,sent:sum.sent+(c.sent||0)}),{total:0,unread:0,needs:0,sent:0});
  // Unknown mail remains in its own folder, while All really includes every source.
  let availableChannels=[];
  if(['all','channels'].includes(suite)&&!qaAgencyId){
    const {listMobileAgencies}=await import('../services/mobile/agencyScope.service.js');const {agencies}=await listMobileAgencies(await User.findById(userId,{raw:true}));
    const data={channels:[]};for(const agency of agencies){const result=await invoke(qvListChatChannels,req,{agencyId:String(agency.id)});data.channels.push(...(result.channels || []).map(channel=>({...channel,agency_id:Number(agency.id),agency_name:agency.name,agency_logo_path:mobileAgencyIcon(agency)})));}
    availableChannels=(data.channels || []).filter(channel=>!chats.some(item=>item.id===Number(channel.thread_id || channel.id)) && (includeArchived || !archives.has(`chat:${channel.thread_id || channel.id}`))).map(channel=>({...mobileThreadItem({...channel,thread_id:channel.thread_id || channel.id,thread_type:'channel',channel_name:channel.name || channel.channel_name},userId),at:channel.updated_at || channel.created_at || null,preview:channel.description || 'Open this channel',join:!(channel.is_member===true || Number(channel.is_member)===1 || channel.isMember===true)}));
    counts.channels.total+=availableChannels.length;counts.all.total+=availableChannels.length;
  }
  let items=[...emails,...chats,...availableChannels].filter(item=>suite==='all' || suite==='unknown'?suite==='all' || item.unknown:item.category===suite && !item.unknown).filter(i=>matches(i,filter));
  if(['threads','mentions','files'].includes(suite)){
    const body=await invoke(suite==='threads'?qvListThreadsInbox:suite==='mentions'?qvListMentions:qvListFiles,req,{agencyId:'all',beforeAt:cursor?.at,beforeId:cursor?Number(cursor.key.split(':')[1]):undefined,limit:'100'});
    const byThread=new Map(chats.map(i=>[i.id,i]));
    const source=body.items || body.files || [];const ids=source.map(item=>Number(item.message_id)).filter(Number.isSafeInteger);const [views]=ids.length?await pool.execute(`SELECT message_id FROM chat_message_views WHERE user_id=? AND message_id IN(${ids.map(()=>'?').join(',')})`,[userId,...ids]):[[]];const viewed=new Set(views.map(row=>Number(row.message_id)));
    items=source.filter(i=>byThread.has(Number(i.thread_id))).map(item=>{
      const thread=byThread.get(Number(item.thread_id));
      const name=suite==='files'?item.original_filename:thread.title;
      return {...thread,...item,id:item.id || item.root_message_id || item.message_id,key:`${suite}:${item.id || item.root_message_id || item.message_id}`,threadId:Number(item.thread_id),kind:suite,title:name || thread.title,hasSent:suite==='threads'?!!item.has_sent:Number(item.sender?.id)===Number(userId),
        sender:suite==='files'?[item.sender?.first_name,item.sender?.last_name].filter(Boolean).join(' '):thread.title,
        preview:suite==='threads'?item.latest_reply?.body || item.root_body:suite==='files'?item.body_preview:item.body,
        at:item.latest_reply?.created_at || item.mentioned_at || item.created_at || thread.at,unread:suite==='threads'?Number(item.unread_reply_count)>0:!viewed.has(Number(item.message_id)) && !item.is_read && Number(item.message_id)>thread.lastReadMessageId && Number(item.sender?.id)!==Number(userId),needsReply:suite==='files'?false:suite==='threads'?Number(item.latest_reply?.sender?.id)!==Number(userId):!viewed.has(Number(item.message_id)) && !item.is_read && Number(item.message_id)>thread.lastReadMessageId};
    });
    items=items.filter(i=>matches(i,filter));
  }
  if(suite==='drafts'){
    const {listMobileAgencies}=await import('../services/mobile/agencyScope.service.js');const {listEmailDrafts}=await import('../services/emailDraft.service.js');
    const {agencies}=await listMobileAgencies(await User.findById(userId,{raw:true}));items=[];
    for(const agency of agencies)for(const draft of await listEmailDrafts({id:userId,role:'provider',mobileDevice:true},agency.id))items.push({key:`draft:${draft.id}`,id:draft.id,kind:'draft',category:'drafts',agencyId:Number(agency.id),title:draft.subject || 'Untitled email',sender:draft.recipient || 'No recipient yet',preview:draft.preview,at:draft.updated_at,agencyName:agency.name});
    items.sort((a,b)=>new Date(b.at)-new Date(a.at));counts.drafts=countsFor(items);return res.json({items,counts,nextCursor:null});
  }
  items.sort((a,b)=>new Date(b.at)-new Date(a.at) || sortKey(b).localeCompare(sortKey(a)));
  if(cursor)items=items.filter(i=>new Date(i.at)<new Date(cursor.at) || new Date(i.at).getTime()===new Date(cursor.at).getTime() && sortKey(i).localeCompare(cursor.key)<0);
  const page=items.slice(0,50),last=page.at(-1);
  res.json({items:page,counts,nextCursor:items.length>50 && last?Buffer.from(JSON.stringify({at:last.at,key:sortKey(last)})).toString('base64url'):null});
});
export const getMobileChannels=mobile(async(req,res)=>{
 if(mobileQaAgencyId(req))return res.json({channels:[]});
 const {listMobileAgencies}=await import('../services/mobile/agencyScope.service.js');
 const {agencies}=await listMobileAgencies(await User.findById(req.quickView.userId,{raw:true}));const channels=[];
 for(const agency of agencies){const result=await invoke(qvListChatChannels,req,{agencyId:String(agency.id)});channels.push(...(result.channels || []).map(channel=>({...channel,agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency)})));}
 res.json({channels});
});
export const getMobilePreferences=mobile(async(req,res)=>res.json({preferences:await mobileConversaStore.preferences(req.quickView.userId)}));
export const patchMobilePreferences=mobile(async(req,res)=>res.json({preferences:await mobileConversaStore.savePreferences(req.quickView.userId,req.body || {})}));
export const patchMobileArchive=mobile(async(req,res)=>{
  const id=Number(req.params.id),kind=req.params.kind;if(!Number.isSafeInteger(id)||id<=0 || !['chat','email','sms'].includes(kind))throw fail(400,'Invalid conversation.');
  if(kind==='chat'){await assertMobileQaThread(req,id);await assertThreadAccess(req.quickView.userId,id,{requireActiveAgency:true});}
  else {const conversation=assertMobileQaConversation(req,await requireConversationAccess({id:req.quickView.userId,role:'provider',mobileDevice:true},id));if(conversation.channel!==kind)throw fail(400,'Conversation does not match this category.');}
  await mobileConversaStore.archive(req.quickView.userId,kind,id,req.body.archived!==false);res.json({ok:true});
});
export const getMobileChatContext=mobile(async(req,res)=>{
  const id=Number(req.params.threadId);if(!Number.isSafeInteger(id)||id<=0)throw fail(400,'Invalid conversation.');
  await assertMobileQaThread(req,id);
  await assertThreadAccess(req.quickView.userId,id,{requireActiveAgency:true});
  const [[thread]]=await pool.execute(`SELECT t.id,t.name,t.agency_id,t.thread_type,t.message_channel,r.last_read_message_id,a.name AS agency_name,a.slug AS agency_slug,a.logo_path AS agency_logo_path FROM chat_threads t JOIN agencies a ON a.id=t.agency_id LEFT JOIN chat_thread_reads r ON r.thread_id=t.id AND r.user_id=? WHERE t.id=?`,[req.quickView.userId,id]);
  const [participants]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.work_email,u.email,u.profile_photo_path FROM chat_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.thread_id=?`,[id]);
  const others=participants.filter(p=>Number(p.id)!==Number(req.quickView.userId));
  res.json({...thread,agencyLogoUrl:mobileAgencyIcon({name:thread.agency_name,slug:thread.agency_slug,logo_path:thread.agency_logo_path}),title:thread.name || others.map(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')).join(', ') || 'Conversation',participants:participants.map(p=>({...p,profile_photo_url:publicUploadsUrlFromStoredPath(p.profile_photo_path)}))});
});
export const getMobileFile=mobile(async(req,res,next)=>{
  const [[file]]=await pool.execute(`SELECT a.*,m.thread_id,t.message_channel FROM chat_message_attachments a JOIN chat_messages m ON m.id=a.message_id JOIN chat_threads t ON t.id=m.thread_id WHERE a.id=? AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?)`,[req.params.attachmentId,req.quickView.userId]);
  if(!file)throw fail(404,'File unavailable.');
  await assertMobileQaThread(req,file.thread_id);
  await assertThreadAccess(req.quickView.userId,file.thread_id,{requireActiveAgency:true});
  if(file.message_channel==='secure'){
    const user=await User.findById(req.quickView.userId);req.user={id:req.quickView.userId,role:user.role};return downloadSecureChatAttachment(req,res,next);
  }
  const path=String(file.file_path || '').replace(/^\/?uploads\//,'');
  if(!path || path.startsWith('/') || path.split('/').includes('..') || path.includes('\\'))throw fail(404,'File unavailable.');
  const bytes=process.env.PTONBOARDFILES?await StorageService.readObjectBuffer(`uploads/${path}`):await fs.readFile(new URL(`../../uploads/${path}`,import.meta.url));
  res.set('X-Content-Type-Options','nosniff');res.attachment(file.original_filename || 'attachment');res.type(file.mime_type || 'application/octet-stream');res.send(bytes);
});

export const patchMobileMessageState=mobile(async(req,res,next)=>{
  const id=Number(req.params.id),kind=req.params.kind;if(!Number.isSafeInteger(id)||id<=0 || !['chat','email','sms'].includes(kind))throw fail(400,'Invalid conversation.');
  if(kind==='chat'){
    await assertMobileQaThread(req,id);
    await assertThreadAccess(req.quickView.userId,id,{requireActiveAgency:true});req.params.threadId=String(id);req.user={id:req.quickView.userId};
    if(req.body.read===false)await pool.execute('DELETE v FROM chat_message_views v JOIN chat_messages m ON m.id=v.message_id WHERE m.thread_id=? AND v.user_id=?',[id,req.quickView.userId]);
    return (req.body.read===false?markUnread:markRead)(req,res,next);
  }
  assertMobileQaConversation(req,await requireConversationAccess({id:req.quickView.userId,role:'provider',mobileDevice:true},id));
  res.json({conversation:await updateConversation(id,{markRead:req.body.read!==false,markUnread:req.body.read===false},{userId:req.quickView.userId})});
});
export const postMobileViewed=mobile(async(req,res)=>{
  const threadId=Number(req.params.threadId),ids=req.body.messageIds;
  if(!Number.isSafeInteger(threadId)||threadId<=0 || !Array.isArray(ids)||ids.length>200 || !ids.length || ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw fail(400,'Valid message IDs are required.');
  await assertMobileQaThread(req,threadId);
  await assertThreadAccess(req.quickView.userId,threadId,{requireActiveAgency:true});
  await pool.execute(`INSERT IGNORE INTO chat_message_views(message_id,user_id) SELECT m.id,? FROM chat_messages m WHERE m.thread_id=? AND m.id IN(${ids.map(()=>'?').join(',')}) AND m.sender_user_id<>? AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?)`,[req.quickView.userId,threadId,...ids,req.quickView.userId,req.quickView.userId]);
  res.json({ok:true});
});

export const getMobileMyWork=mobile(async(req,res)=>res.json(await getMobileDocumentationQueue(req)));

// Client composers use care assignments, never the staff directory or supplied addresses.
async function clinicalContactRequest(request,agencyId,clientId){
 const {listMobileAgencies}=await import('../services/mobile/agencyScope.service.js');
 const user=await User.findById(request.quickView.userId,{raw:true}),{agencies}=await listMobileAgencies(user);
 if(!agencies.some(agency=>Number(agency.id)===Number(agencyId)))throw fail(403,'This workspace is unavailable.');
 return Object.assign(Object.create(request),{user,quickView:{...request.quickView,agencyId:Number(agencyId)},mobileClinical:undefined,
  query:{agencyId:Number(agencyId)},body:{...request.body,agencyId:Number(agencyId)},params:{clientId:String(clientId)},headers:{...request.headers,'x-agency-id':String(agencyId)}});
}
export const getMobileClientRecipients=mobile(async(req,res)=>{
 const channel=String(req.query.channel || 'secure');if(!['secure','sms'].includes(channel))throw fail(400,'Choose Secure messages or Texts.');
 const query=String(req.query.q || '').trim().slice(0,100),user=await User.findById(req.quickView.userId,{raw:true});
 const {listMobileAgencies}=await import('../services/mobile/agencyScope.service.js');const {agencies}=await listMobileAgencies(user);
 const {requireNarrivaAgency}=await import('../services/narrivaAccess.service.js');
 const {getMobileClientSummary}=await import('./mobileClinical.controller.js');const contacts=[];
 const page=Math.max(0,Math.min(1000,Number(req.query.page)||0));if(!Number.isInteger(page))throw fail(400,'Invalid client page.');let more=false;
 for(const agency of agencies){
  try{await requireNarrivaAgency({...user},agency.id);}catch(error){if([403,404].includes(error.status))continue;throw error;}
  const [clients]=await pool.execute(`SELECT c.id FROM clients c WHERE c.client_type IN('clinical','school')
   AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
   AND (c.provider_id=? OR EXISTS(SELECT 1 FROM client_provider_assignments p WHERE p.client_id=c.id AND p.provider_user_id=? AND p.is_active=1))
   AND (?='' OR LOCATE(?,c.full_name)>0) ORDER BY c.id DESC LIMIT 21 OFFSET ${page*20}`,[agency.id,agency.id,user.id,user.id,query,query]);
  if(clients.length>20)more=true;
  for(const client of clients.slice(0,20)){
   try{const summary=await invoke(getMobileClientSummary,await clinicalContactRequest(req,agency.id,client.id));
    const choices=(summary.contacts || []).filter(person=>person.channels?.[channel]);
    if(channel==='secure'&&!choices.length)choices.push({key:'review',relationship:'Portal access needs review',secureReason:summary.secureMessaging?.reason});
    for(const person of choices)contacts.push({id:`${agency.id}:${client.id}:${person.key}`,clientId:client.id,agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency),recipientKey:person.key,displayName:summary.client.maskedName,age:summary.client.age,relationship:person.relationship,contactName:person.maskedName,requiresInvitation:person.secureInvitation===true,unavailable:person.key==='review',reason:person.secureReason || null});
   }catch(error){if(![403,404].includes(error.status))throw error;}
  }
 }
 res.json({contacts,limit:20,nextPage:more?page+1:null});
});
export const postMobileClientContact=mobile(async(req,res,next)=>{
 const {resolveMobileClientContact,sendMobileClientContact}=await import('./mobileClinical.controller.js');
 const scoped=await clinicalContactRequest(req,req.body.agencyId,req.params.clientId);
 return (req.params.action==='send'?sendMobileClientContact:resolveMobileClientContact)(scoped,res,next);
});

export const postMobileKnownSender=mobile(async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)throw fail(400,'Choose an email conversation.');
 const conversation=assertMobileQaConversation(req,await requireConversationAccess({id:req.quickView.userId,role:'provider',mobileDevice:true},id));
 if(conversation.channel!=='email')throw fail(400,'Choose an email sender.');
 const [[sender]]=await pool.execute('SELECT email,display_name FROM communication_participants WHERE conversation_id=? ORDER BY is_primary DESC,id LIMIT 1',[id]);
 if(!sender?.email)throw fail(422,'This email has no sender address to save.');
 const {default:Contact}=await import('../models/UserCommunicationContact.model.js');
 const contact=await Contact.upsertSafe({agencyId:conversation.agency_id,ownerUserId:req.quickView.userId,email:sender.email,displayName:sender.display_name || null,source:'mark_known'});
 if(contact?.trust_status==='blocked')throw fail(409,'This sender is blocked. Review the blocked-contact setting before making them known.');
 res.json({ok:true,contact:{id:contact.id,email:contact.email,displayName:contact.display_name}});
});
