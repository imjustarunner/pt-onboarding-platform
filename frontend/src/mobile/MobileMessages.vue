<script setup>
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import axios from 'axios';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {backInMobile,trackMobileNavigation} from './mobileNavigation.js';
import {ArrowLeft,ArrowUp,Archive,CheckCheck,LockKeyhole,Mail,MessageSquare,Users,Hash,Paperclip,RefreshCw,Plus,MoreHorizontal,Send,X,FilePenLine} from '@lucide/vue';
import MobileMessageText from './MobileMessageText.vue';
import MobileIdentityAvatar from './MobileIdentityAvatar.vue';
import ConversaBrand from '../components/conversa/ConversaBrand.vue';
const props=defineProps({apiBase:{type:String,required:true},sessionToken:{type:String,required:true},userId:[String,Number],visible:Boolean,preferences:{type:Object,default:()=>({swipeLeft:'archive',swipeRight:'read'})}});
const emit=defineEmits(['open-email','compose-email','counts','settings']);
const route=useRoute(),router=useRouter();trackMobileNavigation(router);
const items=ref([]),counts=ref({}),cursor=ref(null),loading=ref(false),error=ref(''),notice=ref(''),undoItem=ref(null);
const inboxReady=ref(false),inboxFailed=ref(false);let inboxScope='';
const chat=ref(null),messages=ref([]),chatLoading=ref(false),chatBusy=ref(false),reply=ref(''),firstUnreadId=ref(null),unreadAbove=ref(false),hasOlder=ref(false),secureOpen=ref(false),revealNames=ref(false),revealedMessages=ref(new Set()),timeline=ref(null),chatFiles=ref([]),uploading=ref(false);
const composeMenu=ref(false),recipientOpen=ref(false),recipientQuery=ref(''),recipients=ref([]),recipientLoading=ref(false),recipientError=ref(''),recipientBusy=ref(null);let recipientRequest=0;
const recipientNextPage=ref(null),recipientSendKey=ref('');
const recipientMode=ref('direct'),recipientSending=ref(false),recipientText=ref(''),selectedPeople=ref([]),channelQuery=ref('');
const recipientTitle=computed(()=>({secure:'New secure message',sms:'New text message',channels:'Browse channels',groups:'New group message'})[recipientMode.value] || 'New direct message');
const recipientMatches=computed(()=>['secure','sms'].includes(recipientMode.value)?recipients.value:recipients.value.filter(person=>`${person.displayName} ${person.email || ''} ${person.agencyName || ''}`.toLowerCase().includes(recipientQuery.value.toLowerCase())));
const composeLabel=computed(()=>suite.value==='direct'?'New direct message':suite.value==='email' || suite.value==='unknown'?'New email':suite.value==='secure'?'New secure message':suite.value==='sms'?'New text message':suite.value==='channels'?'Browse channels':'New message');
async function compose(){if(['direct','secure','sms','channels','groups'].includes(suite.value))await chooseRecipient(suite.value);else if(['email','unknown'].includes(suite.value))emit('compose-email');else composeMenu.value=!composeMenu.value;}
function trapRecipients(event){if(event.key!=='Tab')return;const nodes=[...event.currentTarget.querySelectorAll('button:not(:disabled),input,textarea')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
function closeRecipients(){clearTimeout(recipientSearchTimer);recipientOpen.value=false;++recipientRequest;recipients.value=[];recipientBusy.value=null;recipientText.value='';selectedPeople.value=[];}
async function chooseRecipient(mode='direct'){
 composeMenu.value=false;recipientMode.value=typeof mode==='string'?mode:'direct';recipientOpen.value=true;recipientQuery.value='';recipientError.value='';recipients.value=[];recipientNextPage.value=null;recipientLoading.value=true;recipientText.value='';selectedPeople.value=[];const request=++recipientRequest;await nextTick();if(request===recipientRequest)document.querySelector('.mm-recipient-sheet header button')?.focus({preventScroll:true});
 try{
  const clientMode=['secure','sms'].includes(recipientMode.value),channelMode=recipientMode.value==='channels';
  const path=clientMode?`/messages/clients?channel=${recipientMode.value}`:channelMode?'/messages/channels':'/directory';
  const {data}=await axios.get(`${props.apiBase}${path}`,{...config(),...(!clientMode && !channelMode?{params:{agencyId:'all'}}:{})});if(request!==recipientRequest)return;
  if(clientMode){recipients.value=data.contacts || [];recipientNextPage.value=data.nextPage??null;}
  else if(channelMode)recipients.value=(data.channels || []).map(channel=>({...channel,id:channel.thread_id || channel.id,displayName:channel.name || channel.channel_name}));
  else {const unique=new Map();for(const person of [...(data.providers || []),...(data.schoolStaff || [])]){if(Number(person.id)!==Number(props.userId))unique.set(`${person.agencyId}:${person.id}`,{...person,...(unique.get(`${person.agencyId}:${person.id}`)||{})});}recipients.value=[...unique.values()];}
 }catch{if(request===recipientRequest)recipientError.value='Your contacts could not be loaded. Try again.';}finally{if(request===recipientRequest)recipientLoading.value=false;}
}
async function startDirect(person){
 if(recipientMode.value==='groups'){const key=`${person.agencyId}:${person.id}`;selectedPeople.value=selectedPeople.value.some(p=>`${p.agencyId}:${p.id}`===key)?selectedPeople.value.filter(p=>`${p.agencyId}:${p.id}`!==key):[...selectedPeople.value,person];return;}
 if(person.unavailable)return;
 if((recipientMode.value==='sms'||recipientMode.value==='secure'&&person.requiresInvitation) && !recipientBusy.value){recipientBusy.value=person;recipientSendKey.value=crypto.randomUUID();return;}
 if(recipientBusy.value)return;recipientBusy.value=person.id;recipientError.value='';const request=recipientRequest;
 try{
  let target;
  if(recipientMode.value==='channels'){await axios.post(`${props.apiBase}/chat/channels/${person.id}/open`,{},config());target={suite:'channels',threadId:String(person.id)};}
  else if(recipientMode.value==='secure'){const {data}=await axios.post(`${props.apiBase}/messages/clients/${person.clientId}/contact`,{agencyId:person.agencyId,recipientKey:person.recipientKey,channel:'secure'},config());if(data.requiresInvitation){recipientBusy.value={...person,requiresInvitation:true};recipientSendKey.value=crypto.randomUUID();return;}target={suite:'secure',threadId:String(data.threadId),secure:'1'};}
  else {const {data}=await axios.post(`${props.apiBase}/chat/direct`,{otherUserId:person.id,...(person.agencyId?{agencyId:person.agencyId}:{})},config());target={suite:data.messageChannel==='secure'?'secure':'direct',threadId:String(data.threadId),secure:data.messageChannel==='secure'?'1':undefined};}
  if(request!==recipientRequest)return;closeRecipients();await go({view:'home',...target});
 }catch(e){if(request===recipientRequest)recipientError.value=e.response?.data?.error?.message || 'Could not open this conversation.';}finally{if(request===recipientRequest && !recipientBusy.value?.clientId)recipientBusy.value=null;}
}
async function sendNewText(){
 const person=recipientBusy.value;if(recipientSending.value || !person?.clientId || !recipientText.value.trim())return;recipientError.value='';recipientSending.value=true;
 try{const secureInvite=recipientMode.value==='secure';const {data}=await axios.post(`${props.apiBase}/messages/clients/${person.clientId}/contact/send`,{agencyId:person.agencyId,recipientKey:person.recipientKey,channel:secureInvite?'secure':'sms',text:recipientText.value,...(secureInvite?{invite:true,requestKey:recipientSendKey.value}:{})},config());closeRecipients();notice.value=secureInvite?(data.deliveryStatus==='sent'?'Secure message saved. Portal invitation sent.':`Secure message saved. Invitation: ${data.deliveryStatus || 'needs review'}. Check communication history before resending.`):'Text sent';await loadInbox();}
 catch(e){recipientError.value=e.response?.data?.error?.message || 'Message was not sent. Your draft is preserved.';}finally{recipientSending.value=false;}
}
async function startGroup(){
 const people=selectedPeople.value;if(people.length<2)return;
 if(new Set(people.map(p=>p.agencyId)).size!==1){recipientError.value='Choose teammates from the same agency for a group conversation.';return;}
 try{const {data}=await axios.post(`${props.apiBase}/chat/group`,{agencyId:people[0].agencyId,participantUserIds:people.map(p=>p.id)},config());closeRecipients();await go({view:'home',suite:'groups',threadId:String(data.threadId)});}catch(e){recipientError.value=e.response?.data?.error?.message || 'Could not create this group.';}
}
let recipientSearchTimer;
watch(recipientQuery,value=>{
 if(!recipientOpen.value || !['secure','sms'].includes(recipientMode.value))return;
 clearTimeout(recipientSearchTimer);recipientSearchTimer=setTimeout(async()=>{
  const request=++recipientRequest;recipientLoading.value=true;recipientError.value='';
  try{const {data}=await axios.get(`${props.apiBase}/messages/clients?channel=${recipientMode.value}`,{...config(),params:{q:value}});if(request===recipientRequest){recipients.value=data.contacts || [];recipientNextPage.value=data.nextPage??null;}}
  catch{if(request===recipientRequest)recipientError.value='Your clients could not be searched. Try again.';}finally{if(request===recipientRequest)recipientLoading.value=false;}
 },300);
});
async function loadMoreRecipients(){
 if(recipientNextPage.value===null || recipientLoading.value)return;const request=recipientRequest;recipientLoading.value=true;
 try{const {data}=await axios.get(`${props.apiBase}/messages/clients?channel=${recipientMode.value}`,{...config(),params:{q:recipientQuery.value,page:recipientNextPage.value}});if(request!==recipientRequest)return;recipients.value=[...recipients.value,...(data.contacts || [])];recipientNextPage.value=data.nextPage??null;}
 catch{recipientError.value='More clients could not be loaded. Try again.';}finally{if(request===recipientRequest)recipientLoading.value=false;}
}
const categoryNav=ref(null),filterNav=ref(null);let categoryLeft=0,filterLeft=0;
function rememberTabs(){if(categoryNav.value)categoryLeft=categoryNav.value.scrollLeft;if(filterNav.value)filterLeft=filterNav.value.scrollLeft;}
async function restoreTabs(reveal=false){await nextTick();for(const [node,left] of [[categoryNav.value,categoryLeft],[filterNav.value,filterLeft]]){if(!node)continue;node.scrollLeft=left;if(reveal){const selected=node.querySelector('[aria-pressed=true]');if(selected){const a=selected.getBoundingClientRect(),b=node.getBoundingClientRect();if(a.left<b.left)node.scrollLeft-=b.left-a.left;else if(a.right>b.right)node.scrollLeft+=a.right-b.right;}}}rememberTabs();}
const filePreview=ref(null),fileUrl=ref(''),fileData=ref(null),fileBusy=ref(false),drafts=new Map(),scrollPositions=new Map();
const baseCategories=[['all','All',MessageSquare],['email','Email',Mail],['direct','Direct',MessageSquare],['groups','Groups',Users],['channels','Channels',Hash],['secure','Secure',LockKeyhole],['sms','Texts',MessageSquare],['threads','Threads',MessageSquare],['mentions','Mentions',MessageSquare],['files','Files',Paperclip],['unknown','Unknown senders',Mail]];
// Freeze the category order for this mounted workspace. Quiet count refreshes
// never move a target under a finger; the next visit promotes unread categories.
const categoryOrder=ref(null);
const categories=computed(()=>categoryOrder.value || baseCategories);
function orderCategories(){if(categoryOrder.value)return;categoryOrder.value=[baseCategories[0],...baseCategories.slice(1).sort((a,b)=>Number((counts.value[b[0]]?.unread||0)>0)-Number((counts.value[a[0]]?.unread||0)>0))];}
const suite=computed(()=>String(route.query.suite || 'all'));
const filter=computed(()=>suite.value==='drafts'?'drafts':(route.query.filter==='needs'?'unread':String(route.query.filter || (suite.value==='all'?'unread':'all'))));
const showingDrafts=computed(()=>filter.value==='drafts');
const includeArchived=computed(()=>route.query.archived==='1');
const threadId=computed(()=>Number(route.query.threadId)||null),parentId=computed(()=>Number(route.query.parentId)||null);
const secure=computed(()=>chat.value?.message_channel==='secure' || route.query.secure==='1');
const parent=computed(()=>parentId.value?messages.value.find(m=>Number(m.id)===parentId.value):null);
const timelineMessages=computed(()=>messages.value.filter(m=>!parentId.value || Number(m.id)!==parentId.value));
const selectedCounts=computed(()=>counts.value[suite.value] || {total:0,unread:0,needs:0});
const date=computed(()=>new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}));
const config=()=>({headers:{'X-Quick-View-Session':props.sessionToken},withCredentials:true});
const draftKey=()=>`${threadId.value}:${parentId.value || 'root'}`;
let inboxRequest=0,chatRequest=0,timer,observer,scrollTimer;
let drag=null,suppressClickUntil=0;
const dragOffset=ref({key:null,x:0});
const swipeAction=item=>dragOffset.value.key===item.key?(dragOffset.value.x<0?props.preferences.swipeLeft:props.preferences.swipeRight):'none';
const swipeLabel=item=>({archive:item.archived?'Restore':'Archive',read:'Read',unread:'Unread',none:''}[swipeAction(item)] || '');
const failedPhotos=ref(new Set());
function photoFailed(key){failedPhotos.value=new Set([...failedPhotos.value,key]);}
const clean=query=>Object.fromEntries(Object.entries(query).filter(([,value])=>value!==undefined && value!==null && value!==''));
function go(query,{replace=false}={}) {return router[replace?'replace':'push']({path:'/mobile/workspace',query:clean(query)});}
function rememberDraft(){if(threadId.value)drafts.set(draftKey(),{text:reply.value,files:chatFiles.value,threadId:threadId.value,parentId:parentId.value,title:chatTitle.value,secure:secure.value,category:secure.value?'secure':chat.value?.thread_type==='channel'?'channels':chat.value?.thread_type==='direct'?'direct':'groups',agencyLogoUrl:chat.value?.agencyLogoUrl,at:new Date().toISOString()});}
function clearFile(){if(fileUrl.value)URL.revokeObjectURL(fileUrl.value);fileUrl.value='';fileData.value=null;filePreview.value=null;}
function clearChat(){++chatRequest;chatLoading.value=false;hasOlder.value=false;observer?.disconnect();chat.value=null;messages.value=[];secureOpen.value=false;revealNames.value=false;revealedMessages.value=new Set();firstUnreadId.value=null;unreadAbove.value=false;reply.value='';chatFiles.value=[];clearFile();}
async function changeSuite(value){rememberTabs();rememberListScroll();await go({view:'home',suite:value,filter:value==='all'?'unread':'all',archived:includeArchived.value?'1':undefined});}
async function changeFilter(value){rememberTabs();rememberListScroll();await go({view:'home',suite:suite.value,filter:value,archived:includeArchived.value?'1':undefined});}
function rememberListScroll(){const pane=document.getElementById('qv-workspace');if(pane)scrollPositions.set(`${suite.value}:${filter.value}`,pane.scrollTop);}
async function loadInbox({older=false,quiet=false}={}) {
  if(pendingRead.size || bulkBusy.value)return;
  const scope=`${suite.value}:${filter.value}:${includeArchived.value}`;
  if(scope!==inboxScope){inboxScope=scope;items.value=[];cursor.value=null;inboxReady.value=false;}
  const request=++inboxRequest;if(!quiet)loading.value=true;error.value='';
  try{
    const {data}=await axios.get(`${props.apiBase}/messages/inbox`,{...config(),params:{suite:showingDrafts.value?'drafts':suite.value,filter:showingDrafts.value?'all':filter.value,includeArchived:includeArchived.value?'1':'0',cursor:older?cursor.value:undefined}});
    if(request!==inboxRequest)return;
    inboxReady.value=true;inboxFailed.value=false;
    items.value=older?[...items.value,...data.items]:data.items || [];counts.value={...counts.value,...data.counts};orderCategories();cursor.value=data.nextCursor || null;
    if(showingDrafts.value){const local=[...drafts.values()].filter(d=>(d.text?.trim() || d.files?.length) && (suite.value==='all' || suite.value===d.category)).map(d=>({...d,id:d.threadId,key:`chat-draft:${d.threadId}:${d.parentId||0}`,kind:'chat-draft',preview:d.secure?'Unsent secure message':d.text}));items.value=[...local,...(['all','email','drafts'].includes(suite.value)?items.value:[])];counts.value.drafts={total:items.value.length};}emit('counts',counts.value);await restoreTabs();
  }catch(e){if(request===inboxRequest){inboxFailed.value=true;if([401,403].includes(e.response?.status)){items.value=[];counts.value={};cursor.value=null;inboxReady.value=false;}error.value=e.response?.status<500?e.response?.data?.error?.message || 'Messages are unavailable for this account.':inboxReady.value?'Messages could not be refreshed. Previously loaded conversations are shown.':'Messages could not be loaded. Try again.';}}
  finally{if(request===inboxRequest)loading.value=false;}
}
async function openItem(item){
  if(Date.now()<suppressClickUntil)return;
  if(selectionMode.value){toggleSelected(item);return;}
  rememberListScroll();
  if(item.kind==='chat-draft'){await go({...route.query,filter:'all',threadId:String(item.threadId),parentId:item.parentId?String(item.parentId):undefined,secure:item.secure?'1':undefined});return;}
  if(item.kind==='draft'){emit('compose-email',{draftId:item.id,agencyId:item.agencyId});return;}
  if(['email','sms'].includes(item.kind)){emit('open-email',item);return;}
  const id=item.threadId || item.id;
  if(item.join){try{await axios.post(`${props.apiBase}/chat/channels/${id}/open`,{},config());}catch(e){error.value=e.response?.data?.error?.message || 'Could not join this channel.';return;}}
  await go({...route.query,view:'home',threadId:String(id),parentId:item.root_message_id?String(item.root_message_id):undefined,messageId:item.message_id?String(item.message_id):undefined,secure:item.secure?'1':undefined});
}
async function back(){
  rememberDraft();
  const fallback={view:'home',suite:suite.value,filter:filter.value,archived:includeArchived.value?'1':undefined};
  if(parentId.value){delete fallback.parentId;fallback.threadId=String(threadId.value);if(secure.value)fallback.secure='1';}
  await backInMobile(router,{path:'/mobile/workspace',query:clean(fallback)});
}
const initials=name=>String(name || '?').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const masked=name=>String(name || 'Private conversation').split(/\s+/).map(w=>w.slice(0,2)+'•••').join(' ');
function senderName(m){const name=[m.sender_first_name,m.sender_last_name].filter(Boolean).join(' ') || (Number(m.sender_user_id)===Number(props.userId)?'You':'Teammate');return secure.value && !revealNames.value?masked(name):name;}
const chatTitle=computed(()=>{const title=chat.value?.title || (secure.value?'Secure conversation':'Conversation');return secure.value && !revealNames.value?masked(title):title;});
function imageUrl(path){if(!path)return '';if(/^https?:\/\//.test(path))return path;if(/^\/(assets|auricwell|email-signatures|branding)\//.test(path))return props.apiBase.replace(/\/api\/quick-view$/,'')+path;return `${props.apiBase.replace(/\/api\/quick-view$/,'')}/api/uploads/${String(path).replace(/^\/?(?:api\/)?uploads\//,'').replace(/^\//,'')}`;}
function photo(m){const person=chat.value?.participants?.find(p=>Number(p.id)===Number(m.sender_user_id));return imageUrl(m.sender_profile_photo_url || m.sender_profile_photo_path || person?.profile_photo_url || person?.profile_photo_path);}
function senderStyle(m){const palette=[['#5b38a4','#f5f1ff'],['#08776b','#edf9f6'],['#9b4d13','#fff6ec'],['#9c3470','#fff1f8'],['#236d9f','#eef8ff']];const [ink,bg]=Number(m.sender_user_id)===Number(props.userId)?['#184eaf','#e9f1ff']:palette[Number(m.sender_user_id)%palette.length];return {'--sender-ink':ink,'--sender-bg':bg};}
const time=value=>value?new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
const compact=text=>String(text || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const previewText=item=>item.secure?'Secure message · tap to unlock':compact(item.preview) || (item.kind==='files'?'Attachment · open to view':'Message · open to read');
const icon=item=>item.secure?LockKeyhole:item.kind==='email'?Mail:item.category==='channels'?Hash:item.category==='groups'?Users:MessageSquare;
async function archive(item,active=!item.archived){
  const kind=['email','sms'].includes(item.kind)?item.kind:'chat',id=item.threadId || item.thread_id || item.id;
  try{await axios.patch(`${props.apiBase}/messages/${kind}/${id}/archive`,{archived:active},config());notice.value=active?'Conversation archived':'Conversation restored';undoItem.value=active?{...item,archived:true}:null;await loadInbox({quiet:true});}
  catch(e){error.value=e.response?.data?.error?.message || 'Could not update this conversation.';}
}
const pendingRead=new Set();
async function markRead(item,read=true){
  const kind=['email','sms'].includes(item.kind)?item.kind:'chat',id=item.threadId || item.thread_id || item.id;
  if(pendingRead.has(item.key))return;pendingRead.add(item.key);++inboxRequest;
  const previous={unread:item.unread,unreadCount:item.unreadCount},previousItems=[...items.value],previousCounts=structuredClone(JSON.parse(JSON.stringify(counts.value))),scope=inboxScope;let failure='';loading.value=false;
  notice.value=read?'Marked as read':'Marked as unread';
  const delta=(read?0:1)-(item.unread?1:0);item.unread=!read;item.unreadCount=read?0:1;
  for(const key of new Set(['all',item.category]))if(counts.value[key])counts.value[key]={...counts.value[key],unread:Math.max(0,Number(counts.value[key].unread||0)+delta)};
  if(filter.value==='unread' && read)items.value=items.value.filter(row=>row.key!==item.key);emit('counts',counts.value);
  try{await axios.patch(`${props.apiBase}/messages/${kind}/${id}/state`,{read},config());}
  catch(e){if(scope===inboxScope){items.value=previousItems;Object.assign(item,previous);counts.value=previousCounts;emit('counts',counts.value);}failure=e.response?.data?.error?.message || 'Could not update read status.';notice.value='';}
  finally{pendingRead.delete(item.key);if(!threadId.value)await loadInbox({quiet:true});if(failure)error.value=failure;}

}
let bulkRequest=0;
const selectionMode=ref(false),selectedRows=ref(new Map()),rowMenu=ref(null),bulkBusy=ref(false);
const selectable=item=>['email','sms','chat'].includes(item.kind) && !item.join;
const shownSelectable=computed(()=>items.value.filter(selectable));
function toggleSelected(item){if(!selectable(item)||bulkBusy.value)return;const next=new Map(selectedRows.value);if(next.has(item.key))next.delete(item.key);else next.set(item.key,item);selectedRows.value=next;}
function beginSelection(item){rowMenu.value=null;selectionMode.value=true;selectedRows.value=new Map();suppressClickUntil=0;toggleSelected(item);}
function clearSelection(){if(bulkBusy.value)return;selectionMode.value=false;selectedRows.value=new Map();rowMenu.value=null;}
function showRowMenu(item){if(!selectable(item))return;cancelHold();cancelSwipe();suppressClickUntil=Date.now()+700;rowMenu.value=item;}
async function applyBulk(action){
 if(bulkBusy.value||!selectedRows.value.size)return;bulkBusy.value=true;rowMenu.value=null;error.value='';++inboxRequest;loading.value=false;const batch=++bulkRequest,token=props.sessionToken,scope=inboxScope,rows=[...selectedRows.value.values()];let succeeded=0;const failed=new Map();
 for(const item of rows){if(token!==props.sessionToken || scope!==inboxScope)break;try{await axios.patch(`${props.apiBase}/messages/${item.kind}/${item.id}/${action==='archive'?'archive':'state'}`,action==='archive'?{archived:true}:{read:true},config());succeeded++;}catch{failed.set(item.key,item);}}
 if(batch!==bulkRequest)return;bulkBusy.value=false;if(token!==props.sessionToken || scope!==inboxScope)return;selectedRows.value=failed;selectionMode.value=failed.size>0;notice.value=`${succeeded} conversation${succeeded===1?'':'s'} ${action==='archive'?'archived':'marked as read'}.`;await loadInbox({quiet:true});if(failed.size)error.value=`${failed.size} conversation${failed.size===1?' could':'s could'} not be updated. They remain selected; try again.${error.value?' '+error.value:''}`;
}
watch([suite,filter,includeArchived,()=>props.sessionToken],()=>{++bulkRequest;bulkBusy.value=false;selectionMode.value=false;selectedRows.value=new Map();rowMenu.value=null;});
const knownSender=ref(null),savingKnown=ref(false);let holdTimer=null;
watch(knownSender,async value=>{if(value){await nextTick();document.querySelector('[aria-label="Create known contact"] button')?.focus({preventScroll:true});}});
function cancelHold(){clearTimeout(holdTimer);holdTimer=null;}
function showKnownSender(item){if(item.kind!=='email' || !item.unknown)return;cancelHold();suppressClickUntil=Date.now()+600;knownSender.value=item;drag=null;dragOffset.value={key:null,x:0};}
async function saveKnownSender(){const item=knownSender.value;if(!item || savingKnown.value)return;savingKnown.value=true;try{await axios.post(`${props.apiBase}/messages/email/${item.id}/known-sender`,{},config());knownSender.value=null;notice.value='Contact saved. Emails from this sender now appear in your inbox.';await loadInbox({quiet:true});}catch(e){error.value=e.response?.data?.error?.message || 'The contact could not be saved.';}finally{savingKnown.value=false;}}
function cancelSwipe(){cancelHold();drag=null;dragOffset.value={key:null,x:0};}
function startSwipe(item,event){if(event.pointerType==='mouse' && event.button!==0)return;cancelHold();if(selectionMode.value)return;if(selectable(item))holdTimer=setTimeout(()=>showRowMenu(item),550);drag={key:item.key,x:event.clientX,y:event.clientY,target:event.currentTarget,pointerId:event.pointerId};}
function moveSwipe(event){
  if(!drag)return;const x=event.clientX-drag.x,y=event.clientY-drag.y;if(Math.abs(x)>8||Math.abs(y)>8)cancelHold();
  if(Math.abs(y)>Math.abs(x) && Math.abs(y)>12){drag=null;dragOffset.value={key:null,x:0};return;}
  if(Math.abs(x)>12){try{drag.target.setPointerCapture?.(drag.pointerId);}catch{/* The browser may cancel a pointer during a scroll. */}dragOffset.value={key:drag.key,x:Math.max(-120,Math.min(120,x))};}
}
async function finishSwipe(item){
  cancelHold();if(!drag)return;drag=null;const x=dragOffset.value.x;dragOffset.value={key:null,x:0};if(Math.abs(x)<65)return;
  suppressClickUntil=Date.now()+450;const action=x<0?props.preferences.swipeLeft:props.preferences.swipeRight;
  if(action==='archive')await archive(item);else if(action==='read' || action==='unread')await markRead(item,action==='read');
}
function saveScroll(){if(timeline.value && threadId.value)scrollPositions.set(`chat:${draftKey()}`,timeline.value.scrollTop);updateUnreadArrow();}
function updateUnreadArrow(){
  if(!timeline.value || !firstUnreadId.value){unreadAbove.value=false;return;}
  const first=timeline.value.querySelector(`[data-message-id="${firstUnreadId.value}"]`);
  unreadAbove.value=!first || first.getBoundingClientRect().top<timeline.value.getBoundingClientRect().top-8;
}
async function jumpUnread(){
  for(let page=0;page<20 && firstUnreadId.value && !messages.value.some(m=>Number(m.id)===Number(firstUnreadId.value)) && hasOlder.value;page++)await loadChat({older:true});
  await nextTick();const node=timeline.value?.querySelector(`[data-message-id="${firstUnreadId.value}"]`);node?.scrollIntoView?.({block:'start',behavior:'smooth'});updateUnreadArrow();
}
function observeMessages(){
  observer?.disconnect();if(typeof IntersectionObserver==='undefined' || !timeline.value)return;
  observer=new IntersectionObserver(entries=>{
    const ids=entries.filter(entry=>entry.isIntersecting && entry.intersectionRatio>=.55).map(entry=>Number(entry.target.dataset.messageId)).filter(id=>Number(messages.value.find(m=>Number(m.id)===id)?.sender_user_id)!==Number(props.userId));
    if(!ids.length)return;axios.post(`${props.apiBase}/messages/chat/${threadId.value}/viewed`,{messageIds:ids},config()).catch(()=>{});
  },{root:timeline.value,threshold:.55});
  timeline.value.querySelectorAll('[data-message-id]').forEach(node=>observer.observe(node));
}
async function loadChat({older=false,quiet=false,restore=false}={}){
  const id=threadId.value,pid=parentId.value;if(!id || secure.value && !secureOpen.value)return;
  const request=++chatRequest,container=timeline.value,wasBottom=!container || container.scrollHeight-container.scrollTop-container.clientHeight<70;
  const oldHeight=container?.scrollHeight || 0,oldTop=container?.scrollTop || 0;
  if(!quiet)chatLoading.value=true;error.value='';
  try{
    const [context,result]=await Promise.all([chat.value?Promise.resolve({data:chat.value}):axios.get(`${props.apiBase}/messages/chat/${id}`,config()),axios.get(`${props.apiBase}/chat/threads/${id}/messages`,{...config(),params:{parentMessageId:pid || undefined,beforeId:older?Math.min(...timelineMessages.value.map(m=>Number(m.id))):Number(route.query.messageId)>0?Number(route.query.messageId)+1:undefined}})]);
    if(request!==chatRequest || id!==threadId.value || pid!==parentId.value)return;
    chat.value=context.data;if(context.data.message_channel==='secure')secureOpen.value=true;const data=result.data,rows=Array.isArray(data)?data:data.messages || [];
    if(quiet || older){const map=new Map(messages.value.map(m=>[m.id,m]));rows.forEach(m=>map.set(m.id,m));messages.value=[...map.values()].sort((a,b)=>Number(a.id)-Number(b.id));}else messages.value=rows;
    if(!quiet)hasOlder.value=!!data.hasOlder;
    if(!quiet && !older)firstUnreadId.value=pid?null:data.firstUnreadId || null;
    await nextTick();
    if(timeline.value){if(older)timeline.value.scrollTop=timeline.value.scrollHeight-oldHeight+oldTop;
      else if(!quiet)timeline.value.scrollTop=restore && scrollPositions.has(`chat:${draftKey()}`)?scrollPositions.get(`chat:${draftKey()}`):timeline.value.scrollHeight;
      else if(wasBottom)timeline.value.scrollTop=timeline.value.scrollHeight;}
    if(!older && !quiet && route.query.messageId)timeline.value?.querySelector(`[data-message-id="${route.query.messageId}"]`)?.scrollIntoView?.({block:'center'});
    observeMessages();updateUnreadArrow();
  }catch(e){if(request===chatRequest){const message=e.response?.data?.error?.message || 'Could not open this conversation.';if([403,404].includes(e.response?.status))clearChat();error.value=message;}}
  finally{if(request===chatRequest)chatLoading.value=false;}
}
async function openReplies(message){rememberDraft();saveScroll();await go({...route.query,parentId:String(message.id)});}
function lockSecure(){rememberDraft();clearChat();notice.value='Secure conversation locked';}
async function unlockSecure(){secureOpen.value=true;const draft=drafts.get(draftKey());reply.value=draft?.text || '';chatFiles.value=draft?.files || [];await loadChat();}
function toggleMessage(id){const next=new Set(revealedMessages.value);if(next.has(id))next.delete(id);else next.add(id);revealedMessages.value=next;}
async function send(){
  if(chatBusy.value || uploading.value || !reply.value.trim() && !chatFiles.value.length)return;
  const id=threadId.value,pid=parentId.value,key=draftKey();chatBusy.value=true;error.value='';
  try{await axios.post(`${props.apiBase}/chat/threads/${id}/messages`,{body:reply.value.trim(),parentMessageId:pid,attachments:chatFiles.value},config());drafts.delete(key);if(id===threadId.value && pid===parentId.value){reply.value='';chatFiles.value=[];await loadChat({quiet:true});await nextTick();if(timeline.value)timeline.value.scrollTop=timeline.value.scrollHeight;}}
  catch(e){error.value=e.response?.data?.error?.message || 'Message was not sent. Try again.';}finally{chatBusy.value=false;}
}
async function like(message){try{const path=`${props.apiBase}/chat/messages/${message.id}/reactions`;if(message.reactions?.some(r=>r.code==='❤️' && r.mineActive))await axios.delete(`${path}/${encodeURIComponent('❤️')}`,config());else await axios.post(path,{code:'❤️'},config());await loadChat({quiet:true});}catch{error.value='Could not update your reaction.';}}
async function upload(event){const file=event.target.files?.[0];if(!file)return;uploading.value=true;const id=threadId.value;try{const form=new FormData();form.append('file',file);const {data}=await axios.post(`${props.apiBase}/chat/threads/${id}/attachments`,form,config());if(id===threadId.value)chatFiles.value.push(data);}catch(e){error.value=e.response?.data?.error?.message || 'Could not attach this file.';}finally{uploading.value=false;event.target.value='';}}
async function viewFile(file){clearFile();filePreview.value=file;fileBusy.value=true;try{const {data}=await axios.get(`${props.apiBase}/messages/files/${file.id}`,{...config(),responseType:'blob'});if(filePreview.value?.id===file.id){fileData.value=new Blob([data],{type:file.mime_type || file.mimeType || 'application/octet-stream'});fileUrl.value=URL.createObjectURL(fileData.value);}}catch{error.value='Could not open this file.';}finally{fileBusy.value=false;}}
async function openNativeFile(){if(!fileData.value || !filePreview.value)return;fileBusy.value=true;try{const bytes=new Uint8Array(await fileData.value.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));await registerPlugin('AuricwellDevice').shareFile({data:btoa(binary),filename:fileName(filePreview.value)});}catch{error.value='Could not open this file on the device.';}finally{fileBusy.value=false;}}
const fileName=file=>file.original_filename || file.originalFilename || file.filename || file.title || 'Attachment';
const fileSize=file=>file.byte_size || file.byteSize?`${Math.max(1,Math.round(Number(file.byte_size || file.byteSize)/1024))} KB`:'';
let routeKey='';
async function syncRoute(){
  composeMenu.value=false;closeRecipients();
  if(route.query.view && route.query.view!=='home')return;
  const key=`${threadId.value || ''}:${parentId.value || ''}:${suite.value}:${filter.value}:${includeArchived.value}:${route.query.messageId || ''}`;if(key===routeKey)return;routeKey=key;
  clearFile();error.value='';notice.value='';
  if(threadId.value){rememberTabs();const draft=drafts.get(draftKey());reply.value=draft?.text || '';chatFiles.value=draft?.files || [];const previous=chat.value?.id;chat.value=null;messages.value=[];revealNames.value=false;revealedMessages.value=new Set();secureOpen.value=route.query.secure==='1';await loadChat({restore:!!previous});}
  else{clearChat();await loadInbox();await restoreTabs(true);await nextTick();const pane=document.getElementById('qv-workspace');if(pane)pane.scrollTop=scrollPositions.get(`${suite.value}:${filter.value}`)||0;}
}
watch(()=>route.fullPath,syncRoute);
watch(()=>props.visible,async visible=>{if(visible){await restoreTabs(true);if(threadId.value){if(!chat.value)await syncRoute();else await loadChat({quiet:true});}else if(!threadId.value)await loadInbox({quiet:true});}else{knownSender.value=null;cancelHold();clearFile();composeMenu.value=false;closeRecipients();if(secure.value){rememberDraft();clearChat();}}});
defineExpose({refresh:()=>loadInbox()});
onMounted(async()=>{await syncRoute();timer=setInterval(()=>{if(!props.visible || document.hidden || chatBusy.value || uploading.value || pendingRead.size)return;if(threadId.value)loadChat({quiet:true});else loadInbox({quiet:true});},15000);});
let noticeTimer;watch(notice,value=>{clearTimeout(noticeTimer);if(value)noticeTimer=setTimeout(()=>{notice.value='';undoItem.value=null;},4500);});
onUnmounted(()=>{cancelHold();clearTimeout(noticeTimer);clearTimeout(recipientSearchTimer);++recipientRequest;++inboxRequest;clearChat();clearInterval(timer);clearTimeout(scrollTimer);drafts.clear();scrollPositions.clear();});
</script>

<template>


  <section class="mobile-messages" :class="{'is-chat':threadId}" aria-label="Messages by Conversa">
  <Teleport to="body"><div v-if="knownSender" class="mm-file-overlay" @click.self="!savingKnown && (knownSender=null)"><section role="dialog" aria-modal="true" aria-label="Create known contact" @keydown.esc="!savingKnown && (knownSender=null)"><h2>Create known contact</h2><p>{{ knownSender.sender }} · {{ knownSender.senderEmail }}</p><p>Save this sender to your external contacts. Their emails will appear in your regular inbox.</p><button :disabled="savingKnown" @click="saveKnownSender">{{ savingKnown?'Saving…':'Save contact' }}</button><button :disabled="savingKnown" @click="knownSender=null">Cancel</button></section></div></Teleport>
  <Teleport to="body"><div v-if="recipientOpen" class="mm-recipient-overlay" role="dialog" aria-modal="true" :aria-label="recipientTitle" @click.self="closeRecipients" @keydown.esc.stop="closeRecipients" @keydown="trapRecipients"><section class="mm-recipient-sheet"><header><h2>{{ recipientTitle }}</h2><button :aria-label="`Close ${recipientTitle.toLowerCase()}`" @click="closeRecipients"><X :size="20"/></button></header>
   <template v-if="['sms','secure'].includes(recipientMode) && recipientBusy?.clientId"><p>{{ recipientBusy.displayName }} · {{ recipientBusy.contactName }}</p><p v-if="recipientMode==='secure'">The message stays in the secure portal. An email from your agency will invite this contact to sign in or complete setup and verify the client’s birth date. Authorized care-team and family participants share this conversation.</p><form @submit.prevent="sendNewText"><label>Message<textarea v-model="recipientText" rows="5" maxlength="5000" required/></label><button type="submit" :disabled="recipientSending">{{ recipientSending?'Sending…':recipientMode==='secure'?'Send secure message & portal invitation':'Send text' }}</button></form></template>
   <template v-else><label>{{ ['secure','sms'].includes(recipientMode)?'Find one of my clients':recipientMode==='channels'?'Search channels':'Find a teammate' }}<input v-model="recipientQuery" type="search" :placeholder="['secure','sms'].includes(recipientMode)?'Client name':'Name or email'"/></label><p v-if="recipientLoading" role="status">Loading contacts…</p><button v-for="person in recipientMatches" :key="`${person.agencyId}:${person.id}`" class="mm-recipient" :aria-pressed="recipientMode==='groups'?selectedPeople.some(p=>p.id===person.id && p.agencyId===person.agencyId):undefined" :disabled="!!recipientBusy || person.unavailable" @click="startDirect(person)"><MobileIdentityAvatar :photo="imageUrl(person.profilePhotoUrl)" :agency-icon="imageUrl(person.agencyLogoUrl)" :name="person.displayName" :private-identity="['secure','sms'].includes(recipientMode)"/><span><strong>{{ person.displayName }}<template v-if="person.age!=null"> · Age {{ person.age }}</template></strong><small>{{ person.contactName || person.email || person.description }}</small><small>{{ person.agencyName }}</small><small v-if="person.requiresInvitation">Send &amp; invite to portal</small><small v-if="person.unavailable">{{ person.reason || 'Review Portal settings with support.' }}</small></span></button><button v-if="recipientNextPage!==null && ['secure','sms'].includes(recipientMode)" :disabled="recipientLoading" @click="loadMoreRecipients">Load more clients</button><p v-if="!recipientLoading && !recipientError && !recipientMatches.length">No matching authorized contacts.</p><button v-if="recipientMode==='groups'" :disabled="selectedPeople.length<2" @click="startGroup">Open group · {{ selectedPeople.length }} people</button></template>
   <p v-if="recipientError" role="alert">{{ recipientError }} <button v-if="!recipientBusy" @click="chooseRecipient(recipientMode)">Try again</button></p>
  </section></div></Teleport>
    <div v-if="error" class="mm-error" role="alert">{{ error }} <button @click="threadId?loadChat():loadInbox()">Try again</button></div>
    <div v-if="notice" class="mm-notice" role="status">{{ notice }} <button v-if="undoItem" @click="archive(undoItem,false)">Undo</button></div>
    <Teleport to="body"><div v-if="rowMenu" class="mm-selection-overlay" role="dialog" aria-modal="true" aria-label="Conversation actions" @click.self="rowMenu=null" @keydown.esc.stop="rowMenu=null"><section><button @click="rowMenu=null">Close</button><h3>{{ rowMenu.secure ? 'Secure conversation' : rowMenu.title }}</h3><button @click="beginSelection(rowMenu)">Select multiple</button><button v-if="rowMenu.kind==='email' && rowMenu.unknown" @click="showKnownSender(rowMenu);rowMenu=null">Create known contact</button><button @click="const item=rowMenu;rowMenu=null;suppressClickUntil=0;openItem(item)">Open conversation</button></section></div></Teleport>
    <template v-if="!threadId">
      <header class="mm-heading"><ConversaBrand compact/><time>{{ date }}</time></header>
      <nav ref="categoryNav" @scroll.passive="rememberTabs" class="mm-categories" aria-label="Message categories"><button v-for="[id,label,Icon] in categories" :key="id" :aria-pressed="suite===id" @click="changeSuite(id)"><component :is="Icon" :size="15"/>{{ label }}<span class="mm-count" :aria-label="`${counts[id]?.unread || 0} unread conversations`">{{ counts[id]?.unread ?? '—' }}</span></button></nav>
      <div class="mm-toolbar">
        <div ref="filterNav" @scroll.passive="rememberTabs" class="mm-filters" aria-label="Message filters"><button v-for="[id,label,field] in [['all','All',null],['unread','Unread','unread'],['sent','Sent','sent'],['drafts','Drafts','drafts']]" :key="id" :aria-pressed="filter===id" @click="changeFilter(id)">{{ label }} <span v-if="id!=='all'">{{ id==='drafts' ? counts.drafts?.total ?? '—' : inboxReady ? selectedCounts[field] || 0 : '—' }}</span></button></div>
        <button class="mm-icon" :aria-pressed="includeArchived" aria-label="Include archived conversations" title="Include archived" @click="go({...route.query,archived:includeArchived?undefined:'1'})"><Archive :size="18"/></button>
        <button class="mm-icon" aria-label="Refresh messages" @click="loadInbox()"><RefreshCw :size="17"/></button>
        <button class="mm-icon mm-primary" :aria-label="composeLabel" @click="compose"><Plus :size="19"/></button>
      </div>
      <div v-if="composeMenu" class="mm-compose-menu" role="group" aria-label="New message options"><button @click="chooseRecipient('direct')">New direct message</button><button @click="chooseRecipient('groups')">New group message</button><button @click="chooseRecipient('channels')">Browse channels</button><button @click="composeMenu=false;emit('compose-email')">New email</button><button @click="chooseRecipient('secure')">New secure message</button><button @click="chooseRecipient('sms')">New text message</button><button @click="composeMenu=false;changeSuite('drafts')">Drafts</button></div>
      <p v-if="suite==='all' && filter==='unread'" class="mm-filter-help">Showing unread conversations across your agencies. <button @click="changeFilter('all')">Show all conversations</button></p>
      <label v-if="suite==='channels'" class="mm-folder">Search channels<input v-model="channelQuery" type="search" placeholder="Channel name"/></label>
      <div v-if="includeArchived" class="mm-included">Showing active and archived conversations</div>
      <div v-if="suite==='email' || suite==='unknown'" class="mm-folder"><button :aria-pressed="suite==='unknown'" @click="changeSuite(suite==='unknown'?'email':'unknown')">Unknown senders <span>{{ inboxReady ? counts.unknown?.total || 0 : '—' }}</span></button><button @click="emit('settings')">Swipe settings</button></div>
      <div v-if="selectionMode" class="mm-bulk" role="toolbar" aria-label="Selected conversations"><strong>{{ selectedRows.size }} selected</strong><button :disabled="bulkBusy || !selectedRows.size" @click="applyBulk('read')">Read</button><button :disabled="bulkBusy || !selectedRows.size" @click="applyBulk('archive')">Archive</button><button :disabled="bulkBusy" @click="selectedRows=new Map(shownSelectable.map(item=>[item.key,item]))">Select all shown</button><button :disabled="bulkBusy" @click="clearSelection">Cancel</button><span v-if="bulkBusy" role="status">Updating…</span></div>
      <p v-if="loading && !items.length" class="mm-empty" role="status">Loading your conversations…</p>
      <article v-for="item in items.filter(item=>suite!=='channels' || item.title.toLowerCase().includes(channelQuery.toLowerCase()))" :key="item.key" class="mm-card" :class="{unread:item.unread,secure:item.secure,archived:item.archived,files:item.kind==='files'}">
        <div class="mm-swipe" :class="[`action-${swipeAction(item)}`,{'swipe-left':dragOffset.key===item.key && dragOffset.x<0}]"><span class="mm-swipe-label">{{ swipeLabel(item) }}</span>
          <button class="mm-row" :aria-pressed="selectionMode && selectable(item) ? selectedRows.has(item.key) : undefined" :disabled="bulkBusy" :style="{transform:`translateX(${dragOffset.key===item.key?dragOffset.x:0}px)`}" @pointerdown="startSwipe(item,$event)" @pointermove="moveSwipe" @pointerup="finishSwipe(item)" @pointercancel="cancelSwipe" @contextmenu.prevent="showRowMenu(item)" @click="openItem(item)">
            <span v-if="selectionMode && selectable(item)" class="mm-select-check" role="checkbox" :aria-checked="selectedRows.has(item.key)" :aria-label="`Select ${item.title}`">{{ selectedRows.has(item.key) ? '✓' : '' }}</span><MobileIdentityAvatar v-else :photo="imageUrl(item.avatar)" :agency-icon="imageUrl(item.agencyLogoUrl)" :name="item.title" :private-identity="item.secure"/>
            <span class="mm-meta"><span class="mm-row-top"><strong>{{ item.category==='groups' && item.groupName ? item.groupName : ['chat','threads','mentions','sms'].includes(item.kind)?item.title:(item.sender || item.title) }}</strong><time>{{ time(item.at) }}</time></span><strong v-if="item.kind==='email' || item.kind==='files' || ['draft','chat-draft'].includes(item.kind)" class="mm-subject">{{ item.title }}</strong><span class="mm-preview"><template v-if="item.kind==='chat' && item.sender && item.sender!==item.title && !item.secure">{{ item.sender }}: </template>{{ previewText(item) }}</span><span class="mm-category-label">{{ item.category==='groups' ? 'Groups' : item.category }}<template v-if="item.destinationAccount && item.category!=='groups'"> · To {{ item.destinationAccount }}</template><template v-if="item.agencyName"> · {{ item.agencyName }}</template><template v-if="item.reply_count"> · {{ item.reply_count }} replies</template><template v-if="item.kind==='files'"> · {{ fileSize(item) }}</template><template v-if="item.archived"> · Archived</template></span></span>
            <span v-if="item.unread" class="mm-unread" :aria-label="`${item.unreadCount || 1} unread`">{{ item.unreadCount || 1 }}</span>
          </button>
        </div>
        <div class="mm-row-tools"><template v-if="item.kind==='files'"><button @click="viewFile(item)">View</button><button @click="openItem(item)">Open message</button></template><button v-else-if="['draft','chat-draft'].includes(item.kind)" @click="openItem(item)">Open draft</button><span v-else-if="item.join" class="mm-join-label">Join</span><details v-else><summary :aria-label="`Actions for ${item.title}`"><MoreHorizontal :size="18"/></summary><div><button v-if="selectable(item)" @click="beginSelection(item)">Select multiple</button><button v-if="item.kind==='email' && item.unknown" @click="showKnownSender(item)">Create known contact</button><button @click="openItem(item)">Open conversation</button><button @click="archive(item)">{{ item.archived?'Restore':'Archive' }}</button><button @click="markRead(item,item.unread)">{{ item.unread?'Mark read':'Mark unread' }}</button></div></details></div>
      </article>
      <p v-if="!loading && inboxReady && !inboxFailed && !items.length" class="mm-empty">{{ filter==='unread'?'You’re caught up.':'No conversations in this view.' }}</p>
      <button v-if="cursor" class="mm-load" :disabled="loading" @click="loadInbox({older:true})">{{ loading?'Loading…':'Load more' }}</button>
    </template>
    <template v-else>
      <header class="mm-chat-header"><button class="mm-back" @click="back"><ArrowLeft :size="19"/>Back</button><div><strong>{{ chatTitle }}</strong><small>{{ parentId?'Thread replies':secure?'Secure conversation':chat?.thread_type==='direct'?'Direct message':'Group conversation' }}</small></div><button v-if="route.query.messageId" class="mm-latest" @click="go({...route.query,messageId:undefined})">Latest</button><button v-if="secure" class="mm-icon" :aria-label="secureOpen?'Lock secure conversation':'Unlock secure conversation'" @click="secureOpen?lockSecure():unlockSecure()"><LockKeyhole :size="19"/></button></header>
      <div v-if="secure && !secureOpen" class="mm-secure-gate"><LockKeyhole :size="30"/><h2>Secure conversation</h2><p>Tap to reveal messages. Lock it again when you’re finished.</p><button class="mm-primary" @click="unlockSecure">Unlock conversation</button></div>
      <template v-else>
        <div v-if="secure" class="mm-secure-notice"><LockKeyhole :size="14"/>Secure · tap a message to reveal or conceal it.<button @click="revealNames=!revealNames">{{ revealNames?'Hide names':'Reveal names' }}</button></div>
        <section v-if="parent" class="mm-parent" :style="senderStyle(parent)" aria-label="Original message"><span>Replying to {{ senderName(parent) }}</span><button v-if="secure" class="mm-secure-toggle" @click="toggleMessage(parent.id)">{{ revealedMessages.has(parent.id)?'Conceal original message':'Reveal original message' }}</button><p v-if="!secure || revealedMessages.has(parent.id)"><MobileMessageText :text="parent.body"/></p></section>
        <div class="mm-timeline-wrap"><button v-if="unreadAbove" class="mm-unread-jump" @click="jumpUnread"><ArrowUp :size="16"/>Unread</button>
          <div ref="timeline" class="mm-timeline" aria-label="Conversation messages" @scroll="saveScroll">
            <button v-if="hasOlder" class="mm-load" :disabled="chatLoading" @click="loadChat({older:true})">Load earlier messages</button><p v-if="chatLoading && !messages.length" role="status">Loading messages…</p>
            <article v-for="message in timelineMessages" :key="message.id" class="mm-message" :class="{mine:Number(message.sender_user_id)===Number(userId)}" :style="senderStyle(message)" :data-message-id="message.id">
              <MobileIdentityAvatar :photo="photo(message)" :agency-icon="imageUrl(chat?.agencyLogoUrl)" :name="senderName(message)" :private-identity="secure"/>
              <div class="mm-message-main"><div class="mm-message-by"><strong>{{ senderName(message) }}</strong><time>{{ time(message.created_at) }}</time></div>
                <div class="mm-bubble"><button v-if="secure" class="mm-secure-toggle" :aria-expanded="revealedMessages.has(message.id)" @click="toggleMessage(message.id)"><LockKeyhole :size="14"/>{{ revealedMessages.has(message.id)?'Conceal message':'Reveal secure message' }}</button><template v-if="!secure || revealedMessages.has(message.id)"><p><MobileMessageText :text="message.body"/></p><div v-if="message.attachments?.length" class="mm-attachments"><button v-for="file in message.attachments" :key="file.id" @click="viewFile(file)"><Paperclip :size="14"/>{{ fileName(file) }}</button></div></template>
                  <div class="mm-message-actions"><button class="mm-reaction" :aria-pressed="message.reactions?.some(r=>r.code==='❤️' && r.mineActive) || false" @click="like(message)">♥ <span>{{ message.reactions?.find(r=>r.code==='❤️')?.count || '' }}</span></button><button v-if="!parentId" class="mm-thread-link" :class="{'has-replies':message.reply_count>0}" @click="openReplies(message)">{{ message.reply_count?`${message.reply_count} ${message.reply_count===1?'reply':'replies'}`:'Reply in thread' }}</button></div>
                </div>
                <button v-if="!parentId && message.latest_reply && (!secure || revealedMessages.has(message.id))" class="mm-reply-preview" @click="openReplies(message)"><strong>{{ senderName(message.latest_reply) }}</strong><span>{{ message.latest_reply.body }}</span><small>Latest reply · {{ time(message.latest_reply.created_at) }}</small></button>
              </div>
            </article><p v-if="!chatLoading && !timelineMessages.length" class="mm-empty">{{ parentId?'No replies yet. Start below.':'No messages yet.' }}</p>
          </div>
        </div>
        <form class="mm-composer" @submit.prevent="send"><label class="mm-sr-only" for="mobile-chat-reply">{{ parentId?'Thread reply':'Message' }}</label><textarea id="mobile-chat-reply" v-model="reply" :placeholder="parentId?'Reply to this message…':'Write a message…'" rows="2"/><div class="mm-composer-actions"><label class="mm-attach" title="Attach photo or video"><Paperclip :size="19"/><span class="mm-sr-only">Photo or video</span><input type="file" accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" :disabled="uploading" @change="upload"/></label><small v-if="chatFiles.length">{{ chatFiles.length }} attached <button type="button" @click="chatFiles=[]">Remove</button></small><small v-if="uploading">Uploading…</small><button class="mm-send" :disabled="!chat || chatBusy || uploading || !reply.trim() && !chatFiles.length"><Send :size="17"/>{{ chatBusy?'Sending…':'Send' }}</button></div></form>
      </template>
    </template>
    <Teleport to="body"><div v-if="filePreview" class="mm-file-overlay" role="dialog" aria-modal="true" aria-label="File preview" @keydown.esc="clearFile"><section><header><strong>{{ fileName(filePreview) }}</strong><button aria-label="Close file preview" @click="clearFile"><X :size="22"/></button></header><p>{{ fileSize(filePreview) }}</p><p v-if="fileBusy" role="status">Loading file…</p><template v-if="fileUrl"><img v-if="String(filePreview.mime_type || filePreview.mimeType).startsWith('image/')" :src="fileUrl" :alt="fileName(filePreview)"/><video v-else-if="String(filePreview.mime_type || filePreview.mimeType).startsWith('video/')" :src="fileUrl" controls/><button v-if="Capacitor.isNativePlatform()" class="mm-file-open" :disabled="fileBusy" @click="openNativeFile">Open / share {{ fileName(filePreview) }}</button><a v-else :href="fileUrl" :download="fileName(filePreview)">Open / download {{ fileName(filePreview) }}</a></template></section></div></Teleport>
  </section>
</template>
<style scoped>
.mobile-messages{background:#fff;color:#193458;min-width:0;font:14px/1.45 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.mobile-messages button{font:inherit;color:inherit;cursor:pointer}.mm-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:19px 16px 15px}.mm-heading :deep(.conversa-brand){min-width:0}.mm-heading time{font-size:11px;color:#6d7f99;white-space:nowrap}.mm-categories{display:flex;gap:6px;padding:8px 12px 13px;overflow:auto;scrollbar-width:none;border-bottom:1px solid #e7edf5}.mm-categories button{flex:none;display:flex;align-items:center;gap:5px;border:0;border-radius:22px;background:#f3f6fb;padding:9px 11px;font-size:12px;min-height:40px;white-space:nowrap}.mm-categories button[aria-pressed=true]{background:#245be0;color:#fff}.mm-count{font-size:10px;font-weight:750;min-width:14px}.mm-toolbar{display:flex;align-items:center;gap:3px;padding:10px 9px;flex-wrap:wrap;border-bottom:1px solid #e7edf5}.mm-filters{display:flex;align-items:center;gap:3px;margin-right:auto}.mm-filters button{background:transparent;border:0;border-radius:8px;padding:8px 7px;font-size:11px;min-height:38px;white-space:nowrap}.mm-filters span{font-size:10px;padding:2px 4px;border-radius:5px;background:#eaf0f8}.mm-filters button[aria-pressed=true]{background:#edf3ff;color:#154cb6;font-weight:700}.mm-icon{border:0;background:#f3f6fc;border-radius:9px;display:inline-flex;justify-content:center;align-items:center;width:35px;height:38px;flex-shrink:0}.mm-icon.mm-primary{padding:0}.mm-icon[aria-pressed=true]{background:#dbe8ff;color:#194eaf}.mm-primary{background:#245be0!important;color:white!important;border:0;border-radius:10px;padding:12px 17px}.mm-card{position:relative;border-bottom:1px solid #e8edf5;background:#fff}.mm-card.unread{background:#f2f6ff;border-left:3px solid #3269e8}.mm-card.secure{border-left:3px solid #6558a7;background:#f9f7ff}.mm-card.archived{opacity:.72}.mm-swipe{position:relative;overflow:hidden;background:#e0edff}.mm-swipe-label{position:absolute;inset:0;padding:20px;display:flex;justify-content:flex-start;align-items:center;text-transform:capitalize;color:#2156a5;font-weight:700}.mm-swipe.swipe-left .mm-swipe-label{justify-content:flex-end}.mm-swipe.action-archive{background:#e5dcf4}.mm-swipe.action-archive .mm-swipe-label{color:#64428c}.mm-swipe.action-read{background:#dceefb}.mm-swipe.action-unread{background:#fff0cc}.mm-filter-help{font-size:12px;color:#566c89;padding:0 15px;line-height:1.5}.mm-compose-menu{display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-bottom:1px solid #e7edf5}.mm-compose-menu button{border:1px solid #dbe5f4;background:#f6f8fc;border-radius:9px;padding:10px}.mm-recipient-overlay{position:fixed;inset:0;background:#142c5066;backdrop-filter:blur(5px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}.mm-recipient-sheet{background:white;color:#193458;border-radius:18px;width:min(100%,520px);max-height:80dvh;overflow:auto;padding:20px;box-sizing:border-box}.mm-recipient-sheet header{display:flex;justify-content:space-between;align-items:center}.mm-recipient-sheet h2{font-size:19px}.mm-recipient-sheet button,.mm-recipient-sheet input{font:inherit;color:inherit}.mm-recipient-sheet header button{border:0;background:transparent;padding:10px}.mm-recipient-sheet label{display:grid;gap:8px;font-size:13px}.mm-recipient-sheet input{padding:12px;border:1px solid #d8e3f6;border-radius:9px;width:100%;box-sizing:border-box}.mm-recipient{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:white;border:0;border-bottom:1px solid #e7edf5;padding:14px 0;cursor:pointer}.mm-recipient strong,.mm-recipient small{display:block}.mm-recipient small{font-size:12px;color:#647b9b;margin-top:5px}.mm-row{position:relative;display:flex;align-items:flex-start;gap:10px;text-align:left;width:100%;padding:16px 37px 16px 13px;border:0;background:inherit;touch-action:pan-y;will-change:transform}.mm-row{background:#fff}.unread .mm-row{background:#f2f6ff}.secure .mm-row{background:#f9f7ff}.mm-avatar,.mm-person-avatar{width:39px;height:39px;display:flex;align-items:center;justify-content:center;border-radius:13px;background:#e9effa;color:#3765a7;font-size:12px;font-weight:700;flex-shrink:0;overflow:hidden}.mm-avatar img,.mm-person-avatar img{width:100%;height:100%;object-fit:cover}.mm-avatar.locked{background:#eee9ff;color:#62509b}.mm-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.mm-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.mm-row-top strong{font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mm-row-top time{font-size:9px;white-space:nowrap;color:#71839d;flex-shrink:0}.mm-subject{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}.mm-preview{color:#667a97;font-size:12px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.mm-category-label{font-size:10px;color:#7d8aa1;text-transform:capitalize}.mm-unread{position:absolute;right:12px;bottom:14px;display:grid;place-items:center;min-width:19px;height:19px;background:#3265cf;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:0 4px}.mm-card.files .mm-row{padding-right:13px}.mm-card.files .mm-row-tools{position:static;display:flex;justify-content:flex-end;gap:7px;padding:0 13px 12px}.mm-card.files .mm-row-tools button{display:inline-flex;width:auto;min-height:35px;border:1px solid #dbe5f4;border-radius:8px;padding:7px 12px;font-size:11px}.mm-row-tools{position:absolute;right:7px;top:6px}.mm-row-tools details{position:relative}.mm-row-tools summary{display:flex;justify-content:center;list-style:none;cursor:pointer;min-width:30px;min-height:30px;align-items:center;color:#7b8da5}.mm-row-tools details>div{position:absolute;right:0;top:32px;background:#fff;box-shadow:0 4px 25px #18345d30;border:1px solid #dee7f4;border-radius:10px;min-width:135px;z-index:6;padding:5px}.mm-row-tools button{display:block;border:0;background:#fff;padding:11px;text-align:left;width:100%;font-size:12px;white-space:nowrap}.mm-join-label{font-size:10px;color:#4f71a2;padding:9px}.mm-folder,.mm-included{display:flex;gap:10px;padding:8px 14px;font-size:11px;background:#fafcff}.mm-folder button{border:0;background:transparent;font-size:11px;color:#536c8f;padding:5px}.mm-included{color:#655a83}.mm-empty{padding:30px 18px;color:#72819a;text-align:center;font-size:13px}.mm-load{display:block;border:1px solid #dbe5f4;border-radius:9px;background:#fff;padding:10px 17px;margin:12px auto;font-size:12px}.mm-error,.mm-notice{padding:12px 16px;background:#fff0f2;color:#a0354d;font-size:12px}.mm-notice{background:#edf8f3;color:#28705a}.mm-error button,.mm-notice button{background:transparent;border:0;font-weight:700;text-decoration:underline}.is-chat{height:calc(100dvh - 160px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;min-height:300px}.mm-chat-header{display:flex;gap:8px;align-items:center;padding:11px 10px;border-bottom:1px solid #e5eaf3;flex-shrink:0;background:#fff;min-height:62px}.mm-chat-header>div{display:flex;flex-direction:column;min-width:0;flex:1}.mm-chat-header strong{font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mm-latest{border:0;background:#edf3ff;border-radius:8px;padding:7px;font-size:10px!important;color:#315c9a!important}.mm-chat-header small{font-size:10px;color:#74839a}.mm-back{display:flex;align-items:center;gap:4px;border:0;background:transparent;padding:8px 5px;color:#46648b!important;font-size:12px!important;min-height:40px}.mm-timeline-wrap{position:relative;flex:1;min-height:0;display:flex}.mm-timeline{flex:1;min-width:0;overflow:auto;overscroll-behavior:contain;padding:20px 11px;scroll-padding-top:40px}.mm-message{display:flex;gap:8px;margin-bottom:22px;scroll-margin-top:45px}.mm-person-avatar{width:31px;height:31px;border-radius:11px;background:var(--sender-bg);color:var(--sender-ink);font-size:10px}.mm-message-main{flex:1;min-width:0}.mm-message-by{display:flex;justify-content:space-between;gap:8px;margin:1px 2px 6px;align-items:baseline}.mm-message-by strong{color:var(--sender-ink);font-size:12px}.mm-message-by time{font-size:9px;color:#7b8ba0;white-space:nowrap}.mm-bubble{border:1px solid color-mix(in srgb,var(--sender-ink) 20%,white);border-left:3px solid var(--sender-ink);border-radius:3px 14px 14px 14px;background:var(--sender-bg);padding:11px 12px}.mine .mm-bubble{border-radius:14px 3px 14px 14px}.mm-bubble p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 7px;font-size:14px;line-height:1.65}.mm-message-actions{display:flex;gap:8px;align-items:center;margin-top:8px}.mm-message-actions button{border:0;min-height:32px;border-radius:7px;font-size:10px;padding:5px 9px}.mm-reaction{background:#fff9;color:#ad325b!important}.mm-thread-link{background:#fff9;color:#566d8c!important}.mm-thread-link.has-replies{background:#245be0;color:#fff!important;font-weight:700}.mm-reply-preview{display:flex;flex-direction:column;gap:3px;width:calc(100% - 27px);margin:5px 0 0 27px;text-align:left;border:1px solid #dce5f2;border-left:3px solid #9bb7df;border-radius:3px 11px 11px 11px;padding:9px 11px;background:#f8faff}.mm-reply-preview strong{font-size:10px;color:#355c93}.mm-reply-preview span{font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mm-reply-preview small{font-size:9px;color:#7a8ca5}.mm-parent{padding:12px 16px;background:#f2f6fd;border-bottom:1px solid #dce5f4;flex-shrink:0;max-height:27vh;overflow:auto}.mm-parent>span{font-size:11px;font-weight:700;color:var(--sender-ink)}.mm-parent p{font-size:12px;white-space:pre-wrap;line-height:1.5;margin:7px 0}.mm-unread-jump{position:absolute;z-index:3;top:7px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;padding:7px 13px;border:1px solid #cbdcf8;border-radius:20px;background:#fff;box-shadow:0 3px 10px #18365d20;color:#2557a4!important;font-size:11px!important}.mm-composer{border-top:1px solid #dce5f2;padding:10px 12px;background:#fff;flex-shrink:0}.mm-composer textarea{font:inherit;font-size:14px;line-height:1.5;box-sizing:border-box;width:100%;padding:11px;border:1px solid #d5e0ef;border-radius:12px;resize:vertical;min-height:63px;max-height:24vh;background:#fafcff;color:#193458}.mm-composer-actions{display:flex;gap:9px;align-items:center;padding-top:5px;min-height:34px}.mm-composer-actions small{font-size:10px;color:#6a7e99}.mm-composer-actions small button{border:0;background:transparent;font-size:10px}.mm-attach{display:flex;align-items:center;justify-content:center;min-height:34px;width:34px;border-radius:9px;background:#f1f5fc;color:#557198;cursor:pointer}.mm-attach input{display:none}.mm-send{margin-left:auto;display:flex;gap:6px;align-items:center;border:0;background:#245be0;color:#fff!important;border-radius:10px;min-height:36px;padding:8px 13px;font-size:12px!important}.mm-send:disabled{opacity:.5;cursor:default}.mm-secure-gate{padding:40px 24px;text-align:center;color:#655687}.mm-secure-gate>svg{margin:auto}.mm-secure-gate h2{font-size:18px}.mm-secure-gate p{font-size:13px;line-height:1.6}.mm-secure-notice{display:flex;align-items:center;gap:5px;padding:8px 12px;background:#f5f1ff;font-size:10px;color:#68528b;flex-shrink:0}.mm-secure-notice button{margin-left:auto;border:0;background:transparent;color:#5d3e94;font-size:10px;padding:6px;white-space:nowrap}.mm-secure-toggle{display:flex;align-items:center;gap:6px;background:#fff9;border:0;border-radius:7px;font-size:11px;padding:7px;margin-bottom:6px}.mm-attachments button{display:flex;gap:5px;align-items:center;max-width:100%;overflow-wrap:anywhere;background:#fff9;border:1px solid #d2dfee;border-radius:6px;padding:7px;font-size:11px}.mm-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.mm-file-overlay{position:fixed;inset:0;z-index:200;background:#16305099;display:grid;place-items:center;padding:16px;font-family:Inter,-apple-system,sans-serif}.mm-file-overlay>section{background:#fff;border-radius:15px;padding:18px;max-width:700px;width:100%;max-height:90dvh;overflow:auto;box-sizing:border-box}.mm-file-overlay header{display:flex;align-items:center;justify-content:space-between;gap:12px}.mm-file-overlay header button{border:0;background:transparent;padding:7px}.mm-file-overlay img,.mm-file-overlay video{max-width:100%;max-height:65dvh;display:block;margin:15px auto}.mm-file-open{border:1px solid #d6e3f6;border-radius:9px;background:#edf4ff;padding:12px;font:inherit;color:#2258b8;cursor:pointer}.mm-file-overlay a{display:block;padding:12px;color:#2258b8}.mm-file-overlay p{font-size:12px;color:#657b99}:focus-visible{outline:3px solid #7aa5f3;outline-offset:2px}@media(min-width:761px){.is-chat{height:calc(100dvh - 210px);min-height:450px}.mm-timeline{padding:24px 28px}.mm-message-main{max-width:850px}.mm-heading{padding:22px}.mm-row{padding:20px 45px 20px 22px}.mm-filters button{font-size:12px}.mm-toolbar{padding:12px 20px}}
</style>

<style scoped>.mm-recipient-sheet textarea{display:block;width:100%;box-sizing:border-box;padding:12px;font:inherit;border:1px solid #cad8ea;border-radius:8px}.mm-recipient[aria-pressed=true]{background:#edf3ff}.mm-filter-help button{border:0;background:transparent;color:#245be8;text-decoration:underline;font:inherit}.mm-folder input{min-width:0;flex:1;padding:9px;border:1px solid #d8e1ef;border-radius:8px;font:inherit}</style>

<style scoped>
.mm-categories{overflow-anchor:none;scroll-behavior:auto}.mm-categories button{flex-shrink:0}.mm-count{min-width:3ch;text-align:center;font-variant-numeric:tabular-nums}.mm-filters{overflow-x:auto;min-width:0;flex:1;scrollbar-width:none;overscroll-behavior-x:contain}.mm-filters button{flex-shrink:0;white-space:nowrap}.mm-filters button span{display:inline-block;min-width:2ch;font-variant-numeric:tabular-nums}.mm-toolbar>.mm-icon{flex-shrink:0}.mm-recipient-sheet :is(input,textarea,select),.mm-composer textarea,.mm-folder input{font-size:16px!important}.mm-recipient-overlay{overflow:hidden}.mm-recipient-sheet{overscroll-behavior:contain}.mm-notice{position:fixed;top:max(80px,env(safe-area-inset-top));left:16px;right:16px;z-index:1100;border-radius:10px;box-shadow:0 4px 18px #16305020}
</style>

<style scoped>.mm-select-check{width:32px;height:32px;flex-shrink:0;align-self:center;display:grid;place-items:center;border:2px solid #7c98ca;border-radius:7px;color:#245bde;font-weight:750}.mm-select-check[aria-checked=true]{background:#eaf1ff;border-color:#245bde}.mm-bulk{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 12px;background:#edf3ff;position:sticky;top:0;z-index:5;border-bottom:1px solid #cfddf3}.mm-bulk strong{font-size:12px;margin-right:5px}.mm-bulk button{border:1px solid #c7d7ed;background:#fff;border-radius:8px;min-height:40px;padding:7px 10px;font:inherit;font-size:12px;color:#2052a3}.mm-bulk button:disabled{opacity:.5}.mm-selection-overlay{position:fixed;inset:0;z-index:3000;background:#19345080;display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box}.mm-selection-overlay>section{padding:18px;background:white;border-radius:16px;max-width:500px;width:100%;color:#193655}.mm-selection-overlay h3{font-size:16px;overflow-wrap:anywhere}.mm-selection-overlay button{display:block;width:100%;font:inherit;font-size:16px;padding:13px;margin-top:7px;border:1px solid #c8d9ef;background:#f4f7fc;color:#2051a3;border-radius:9px}</style>
