<template>
  <section class="guardian-messages" aria-label="Guardian communications">
    <header class="workspace-heading"><div><p class="eyebrow">Conversations & client records</p><h2>Communications</h2><p>Email, text, and secure conversations with {{ contact?.name || 'this guardian' }}.</p></div><button type="button" class="quiet-button" :disabled="loading || initialLoading" @click="refreshWorkspace()">Refresh history</button></header>
    <p v-if="initialLoading" role="status">Loading communication records…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="contact">
      <div class="contact-strip"><span><strong>{{contact.name}}</strong><small>{{contact.email || 'No email on file'}} · {{contact.phone || 'No phone on file'}}</small></span><label>Organization<select v-model="agencyId" :disabled="busy || !!emailContext"><option v-for="agency in agencies" :key="agency.id" :value="agency.id">{{agency.name}}</option></select></label></div>
      <div class="workspace-grid">
        <section class="compose-card" aria-label="Compose a message">
          <h3>New message</h3>
          <nav class="channel-picker" aria-label="Message channel"><button v-for="option in channels" :key="option.id" type="button" :aria-pressed="channel===option.id" :disabled="busy || !!emailContext" @click="chooseChannel(option.id)">{{option.label}}</button></nav>
          <p v-if="!currentClients.length" class="help">No current client relationship is available in this organization. Past communication history remains below.</p>
          <template v-else>
            <fieldset :disabled="viewOnly || busy || !!emailContext"><legend>{{channel==='email'?'Regarding these clients':'Regarding this client'}}</legend><label v-for="client in currentClients" :key="client.id" class="client-choice"><input v-if="channel==='email'" v-model="selectedIds" type="checkbox" :value="client.id"/><input v-else v-model="selectedClientId" type="radio" name="guardian-message-client" :value="client.id"/><span>{{client.name}}</span></label></fieldset>
            <p class="help">{{channel==='email'?'One email is filed in every selected client’s record.':'Choose one client so this conversation stays in the correct record.'}}</p>
            <p v-for="client in selectedClients.filter(c=>c.contactPreferences?.alternativeContactInstructions || c.contactPreferences?.noAutomaticEmail)" :key="`contact-choice-${client.id}`" class="contact-instructions"><strong>{{client.name}}:</strong> {{client.contactPreferences.alternativeContactInstructions || 'This family has asked for no automatic email. Review their contact preferences before outreach.'}}</p>
            <template v-if="channel==='email'">
              <p class="recipient-label">To: <strong>{{contact.email || 'Add an email on the Account tab'}}</strong></p>
              <button v-if="!emailContext" type="button" class="primary-button" :disabled="viewOnly || !contact.email || !selectedIds.length" @click="writeEmail()">Write email</button>
            </template>
            <template v-else-if="channel==='sms'">
              <p v-if="smsReply" class="help">Replying on the original texting line. <button type="button" class="text-button" :disabled="busy" @click="smsReply=null">Start a new text instead</button></p>
              <label v-else>Send from<select v-model="numberId" :disabled="busy || viewOnly"><option value="" disabled>Choose a texting line</option><option v-for="line in agencyLines" :key="line.numberId" :value="line.numberId">{{line.phoneNumber}}</option></select></label>
              <p v-if="smsChecking" role="status">Checking this parent’s text eligibility…</p><p v-if="smsError" role="alert">{{smsError}}</p><p v-if="smsReady" class="recipient-label">From {{smsReady.from}} → {{smsReady.to}}</p>
            </template>
            <template v-else>
              <SecureFamilyAudience v-if="selectedClientId" :key="`audience-${agencyId}-${selectedClientId}-${secureReply?.threadId || 'new'}`" ref="audience" required :agency-id="agencyId" :client-id="selectedClientId" :thread-id="secureReply?.threadId" :person-key="secureReply ? undefined : personKey" :me-id="auth.user?.id" :scope-key="`${guardianId}:${selectedClientId}`"/>
            </template>
            <template v-if="channel!=='email'">
              <label v-if="channel==='secure'">Subject<input v-model="subject" type="text" maxlength="180" placeholder="What is this conversation about?" :disabled="busy || viewOnly"/></label>
              <label>Message<textarea ref="messageInput" v-model="body" rows="7" :maxlength="channel==='sms'?1600:20000" :disabled="busy || viewOnly" :placeholder="channel==='sms'?'Write a text to this parent…':'Write a secure message…'"/></label>
              <MessageLinkControl :textarea="messageInput" :disabled="busy || viewOnly" />
              <div class="compose-footer"><small>{{body.length.toLocaleString()}} characters</small><button type="button" class="primary-button" :disabled="!canSend" @click="send">{{busy?'Submitting…':channel==='sms'?'Send text':'Send secure message'}}</button></div>
            </template>
          </template>
          <p v-if="pendingSecure" class="help">Secure message queued{{pendingSecure.scheduledSendAt?` for ${date(pendingSecure.scheduledSendAt)}`:''}}. <button type="button" class="text-button" :disabled="busy" @click="undoSecure">Undo queued message</button></p>
          <p v-if="actionError" role="alert">{{actionError}}</p><p v-if="notice" role="status">{{notice}}</p>
        </section>
        <aside class="filing-card"><p class="eyebrow">Filed where it belongs</p><h3>One parent. Each child’s record.</h3><p>Select the clients an email concerns. SMS and secure messages use one client at a time.</p><p>Email and SMS are addressed to this parent. Secure messages show all authorized recipients before sending.</p><p>Disabling a relationship preserves its past records. A past relationship cannot be selected for a new message.</p></aside>
      </div>
      <section v-if="emailContext" class="inline-email" aria-label="Email composer"><header><div><h3>Email {{contact.name}}</h3><p>Regarding {{emailClientNames}}</p></div><button type="button" class="quiet-button" @click="emailEditor?.saveAndClose()">Save & close</button></header><EmailComposer ref="emailEditor" :key="emailSerial" :compose-context="emailContext" @close="emailContext=null;loadHistory()"/></section>
      <section class="history-card" aria-label="Communication history">
        <header class="history-heading"><div><h3>Communication history</h3><p>Replies, delivery status, and client filing stay with the original conversation.</p></div><div class="history-filters"><label>Client<select v-model="historyClientId"><option value="">All clients</option><option v-for="client in agencyClients" :key="client.id" :value="client.id">{{client.name}}{{client.isHistorical?' · past relationship':''}}</option></select></label><label>Channel<select v-model="historyChannel"><option value="">All channels</option><option v-for="option in channels" :key="option.id" :value="option.id">{{option.label}}</option></select></label></div></header>
        <p v-if="loading" role="status">Updating history…</p><p v-if="historyError" role="alert">{{historyError}}</p>
        <p v-if="!loading && !historyError && !threads.length" class="help">No conversations match these filters.</p>
        <ol class="thread-list"><li v-for="thread in threads" :key="thread.key"><button type="button" :aria-current="selectedThread?.key===thread.key?'true':undefined" @click="openThread(thread)"><span class="channel-badge">{{channelLabel(thread.channel)}}</span><span class="thread-summary"><strong>{{thread.subject || 'Conversation'}}</strong><small>{{thread.clients.length ? thread.clients.map(c=>c.name).join(' · ') : 'Account communication · no client filing'}}</small></span><time>{{date(thread.lastMessageAt)}}</time></button></li></ol>
        <button v-if="nextCursor" type="button" class="quiet-button" :disabled="loading" @click="loadHistory(true)">Load older conversations</button>
      </section>
      <section v-if="selectedThread" class="thread-detail" aria-label="Open conversation"><header><div><h3>{{selectedThread.subject}}</h3><p>Filed with {{selectedThread.clients.map(c=>c.name).join(', ') || 'this account'}}</p></div><button type="button" class="quiet-button" @click="closeThread">Close conversation</button></header><p v-if="detailLoading" role="status">Opening conversation…</p><p v-if="detailError" role="alert">{{detailError}}</p>
        <template v-if="detail">
          <template v-if="selectedThread.channel==='secure'"><p>From {{detail.message.senderName}} · {{date(detail.message.createdAt)}}</p><p>Shared with {{detail.message.recipients.map(p=>p.name).join(', ')}}</p><h4>{{detail.message.subject}}</h4><p class="message-body"><MessageLinkText :text="detail.message.body" /></p><button v-for="file in detail.message.attachments||[]" :key="file.id" type="button" class="quiet-button" @click="downloadAttachment(file.downloadPath,file.original_filename)">{{file.original_filename}}</button><details v-if="detail.events?.length"><summary>Message activity</summary><p v-for="event in detail.events" :key="event.id">{{event.event_type.replaceAll('_',' ')}} · {{event.actor_name || 'Notification visitor'}} · {{date(event.created_at)}}</p></details></template>
          <section v-else-if="selectedThread.channel==='sms'" class="sms-history" aria-label="Text history"><button v-if="detail.nextBeforeId" type="button" class="quiet-button" :disabled="detailLoading" @click="openThread(selectedThread,true)">Load earlier texts</button><article v-for="message in detail.messages" :key="message.id" :class="{'outbound-text':message.direction==='outbound'}"><header><strong>{{message.from.name}}</strong><time>{{date(message.created_at)}}</time></header><p class="message-body"><MessageLinkText :text="message.body_text" /></p><small>{{smsStatus(message.send_status)}}</small></article></section>
          <EmailThreadReader v-else :conversation="detail.conversation" :messages="detail.messages" read-only :has-older="!!detail.nextBeforeId" :loading-older="detailLoading" @older="openThread(selectedThread,true)" @attachment="file=>downloadAttachment(file.downloadPath || `/communications/conversations/${selectedThread.id}/attachments/${file.id}`,file.filename)"/>
          <div class="detail-actions"><button v-if="!viewOnly && selectedThread.channel==='email'" type="button" class="primary-button" :disabled="!!emailContext" @click="replyEmail">Reply by email</button><button v-else-if="!viewOnly && currentClients.some(c=>c.id===(detail.clientId || selectedThread.clientId))" type="button" class="primary-button" :disabled="busy || !!emailContext" @click="replyToSelected">{{selectedThread.channel==='sms'?'Reply by text':'Reply securely'}}</button></div>
        </template>
      </section>
    </template>
  </section>
</template>
<script setup>
import MessageLinkText from '../messages/MessageLinkText.vue';
import MessageLinkControl from '../messages/MessageLinkControl.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import EmailComposer from '../../views/EmailComposerView.vue';
import EmailThreadReader from '../messages/EmailThreadReader.vue';
import SecureFamilyAudience from '../session-comments/SecureFamilyAudience.vue';
import { downloadAttachment } from '../../utils/communicationAttachments';

const messageInput = ref(null);
const props=defineProps({guardianId:{type:Number,required:true},viewOnly:Boolean});
const auth=useAuthStore(),contact=ref(null),clients=ref([]),agencyId=ref(''),initialLoading=ref(false),error=ref('');
const drafts=new Map(),pendingSecure=ref(null);
const channel=ref('email'),selectedIds=ref([]),selectedClientId=ref(null),body=ref(''),subject=ref(''),busy=ref(false),actionError=ref(''),notice=ref('');
const channels=[{id:'email',label:'Email'},{id:'sms',label:'Text (SMS)'},{id:'secure',label:'Secure message'}];
const agencies=computed(()=>[...new Map(clients.value.map(c=>[c.agencyId,{id:c.agencyId,name:c.agencyName}])).values()]);
const agencyClients=computed(()=>clients.value.filter(c=>c.agencyId===Number(agencyId.value))),currentClients=computed(()=>agencyClients.value.filter(c=>!c.isHistorical));
const selectedClients=computed(()=>currentClients.value.filter(c=>channel.value==='email'?selectedIds.value.includes(c.id):c.id===selectedClientId.value));
const personKey=computed(()=>`user:${props.guardianId}@${agencyId.value}`);
const emailContext=ref(null),emailSerial=ref(0),emailEditor=ref(null),emailClientNames=ref('');
const audience=ref(null),secureReply=ref(null),smsReply=ref(null),lines=ref([]),numberId=ref(''),smsChecking=ref(false),smsError=ref(''),smsReady=ref(null);
const agencyLines=computed(()=>lines.value.filter(l=>Number(l.agencyId)===Number(agencyId.value)));
const canSend=computed(()=>!props.viewOnly&&!busy.value&&!!selectedClientId.value&&!!body.value.trim()&&(channel.value==='sms'?!!smsReady.value&&!smsChecking.value:!!subject.value.trim()&&audience.value?.canSend));
const threads=ref([]),nextCursor=ref(null),loading=ref(false),historyError=ref(''),historyClientId=ref(''),historyChannel=ref('');
const selectedThread=ref(null),detail=ref(null),detailLoading=ref(false),detailError=ref('');
let generation=0,historyGeneration=0,detailGeneration=0,smsGeneration=0,linesLoaded=false,alive=true;
const root=()=>`/communications/guardian-contacts/${props.guardianId}`;
const date=value=>value?new Date(value).toLocaleString():'';
const smsStatus=value=>({received:'Received',delivered:'Delivered',sent:'Sent to carrier',submitted:'Submitted to carrier',accepted:'Accepted by carrier',pending:'Delivery pending',failed:'Delivery failed',undelivered:'Undelivered'}[value] || value || 'Status unavailable');
const channelLabel=value=>channels.find(c=>c.id===value)?.label || value;
function chooseChannel(value){channel.value=value;notice.value='';actionError.value='';}
function closeThread(){detailGeneration++;selectedThread.value=null;detail.value=null;detailLoading.value=false;detailError.value='';}
function writeEmail(context={}){emailSerial.value++;emailClientNames.value=selectedClients.value.map(c=>c.name).join(', ');emailContext.value={mode:'new',agencyId:Number(agencyId.value),to:contact.value.email,clientIds:selectedIds.value.join(','),...context};}
function replyEmail(){writeEmail({mode:'reply',conversationId:selectedThread.value.id,agencyId:selectedThread.value.agencyId,clientIds:selectedThread.value.clients.map(c=>c.id).join(',')});emailClientNames.value=selectedThread.value.clients.map(c=>c.name).join(', ');}
async function loadHistory(older=false){const own=++historyGeneration;loading.value=true;historyError.value='';try{const {data}=await api.get(`${root()}/conversations`,{params:{agencyId:agencyId.value||undefined,clientId:historyClientId.value||undefined,channel:historyChannel.value||undefined,cursor:older?nextCursor.value:undefined},skipGlobalLoading:true});if(own!==historyGeneration||!alive)return;threads.value=older?[...threads.value,...data.conversations]:data.conversations;nextCursor.value=data.nextCursor;}catch(e){if(own===historyGeneration)historyError.value=e.response?.data?.error?.message||'Could not load communication history.';}finally{if(own===historyGeneration)loading.value=false;}}
async function openThread(thread,older=false){const own=++detailGeneration;selectedThread.value=thread;detailLoading.value=true;detailError.value='';if(!older)detail.value=null;try{const path=thread.channel==='secure'?`/clients/${thread.clientId}/secure-messages/${thread.messageId}`:thread.channel==='sms'?`${root()}/conversations/${thread.id}/sms`:`/communications/conversations/${thread.id}${older?'/messages':''}`;const {data}=await api.get(path,{params:{agencyId:thread.agencyId,markRead:'0',...(older?{beforeId:detail.value?.nextBeforeId}: {})},skipGlobalLoading:true});if(own!==detailGeneration||!alive)return;detail.value=older?{...detail.value,...data,messages:[...data.messages,...detail.value.messages]}:data;}catch(e){if(own===detailGeneration)detailError.value=e.response?.data?.error?.message||'Could not open this conversation.';}finally{if(own===detailGeneration)detailLoading.value=false;}}
async function checkSms(){const own=++smsGeneration;smsReady.value=null;smsError.value='';smsChecking.value=false;if(channel.value!=='sms'||!selectedClientId.value)return;smsChecking.value=true;try{if(!linesLoaded){const {data}=await api.get('/messages/hub/sms-lines',{skipGlobalLoading:true});if(own!==smsGeneration||!alive)return;lines.value=data.lines||[];linesLoaded=true;}if(!smsReply.value&&!numberId.value&&agencyLines.value.length){numberId.value=agencyLines.value[0].numberId;return;}if(!smsReply.value&&!numberId.value){smsError.value='No texting line is available to your account in this organization.';return;}const {data}=await api.post(`${root()}/sms-eligibility`,{clientId:selectedClientId.value,...(smsReply.value?{threadKey:smsReply.value.threadKey}:{numberId:numberId.value})},{skipGlobalLoading:true});if(own===smsGeneration)smsReady.value=data;}catch(e){if(own===smsGeneration)smsError.value=e.response?.data?.error?.message||'Could not check text eligibility.';}finally{if(own===smsGeneration)smsChecking.value=false;}}
async function send(){if(!canSend.value)return;const own=generation;busy.value=true;actionError.value='';notice.value='';try{let result;const written={body:body.value,subject:subject.value,clientId:selectedClientId.value,agencyId:agencyId.value};if(channel.value==='sms'){result=await api.post('/messages/send',{clientId:selectedClientId.value,guardianUserId:props.guardianId,body:body.value.trim(),...(smsReply.value?{smsThreadKey:smsReply.value.threadKey}:{numberId:Number(numberId.value),startNewConversation:true})},{skipGlobalLoading:true});}else{if(!await audience.value?.prepareSend())return;if(own!==generation)return;result=await api.post('/messages/hub/send',{agencyId:Number(agencyId.value),personKey:personKey.value,method:'secure',clientId:selectedClientId.value,serviceId:audience.value.serviceId||undefined,subject:subject.value.trim(),body:body.value.trim(),newTopic:!secureReply.value,...(secureReply.value?{parentMessageId:secureReply.value.messageId}:{}),expectedRecipientUserIds:[...audience.value.recipientUserIds]},{skipGlobalLoading:true});}if(own!==generation||!alive)return;if(channel.value==='secure'&&result.data.queueId)pendingSecure.value={...written,queueId:result.data.queueId,scheduledSendAt:result.data.scheduledSendAt};body.value='';notice.value=channel.value==='sms'?'Text accepted by the carrier. Delivery status appears in the conversation.':result.data.queued?'Secure message queued for delivery.':'Secure message submitted.';await loadHistory();}catch(e){if(own===generation){actionError.value=e.response?.data?.error?.message||'Could not submit this message. Your draft is preserved.';if(e.response?.data?.error?.code==='FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED')audience.value?.refreshAfterAudienceChange();}}finally{if(own===generation)busy.value=false;}}
async function undoSecure(){
  if(busy.value||!pendingSecure.value)return;
  const pending=pendingSecure.value,own=generation;busy.value=true;actionError.value='';
  try{await api.post(`/messages/hub/queued/${pending.queueId}/undo`,{},{skipGlobalLoading:true});if(own!==generation||!alive)return;
    const saved={body:pending.body,subject:pending.subject};drafts.set(JSON.stringify(['secure',pending.agencyId,pending.clientId]),saved);
    if(channel.value==='secure'&&selectedClientId.value===pending.clientId&&agencyId.value===pending.agencyId&&!body.value){body.value=saved.body;subject.value=saved.subject;}
    pendingSecure.value=null;notice.value='Queued message cancelled. Its draft is available for that client.';await loadHistory();
  }catch(e){if(own===generation)actionError.value=e.response?.data?.error?.message||'Could not cancel this message. Check its delivery status before retrying.';}
  finally{if(own===generation)busy.value=false;}
}
async function replyToSelected(){const thread=selectedThread.value;channel.value=thread.channel;await nextTick();selectedClientId.value=detail.value.clientId||thread.clientId;await nextTick();if(thread.channel==='sms')smsReply.value={threadKey:detail.value.threadKey};else{subject.value=detail.value.message.subject||'Follow-up';secureReply.value={threadId:detail.value.message.threadId,messageId:detail.value.message.id};}}
watch([agencyId,historyClientId,historyChannel],()=>{if(contact.value){threads.value=[];nextCursor.value=null;closeThread();void loadHistory();}});
watch(agencyId,()=>{selectedIds.value=[];selectedClientId.value=currentClients.value.length===1?currentClients.value[0].id:null;historyClientId.value='';numberId.value='';smsReply.value=null;secureReply.value=null;});
watch([channel,agencyId,selectedClientId],(next,previous)=>{
  const draftKey=value=>JSON.stringify(value);
  if(previous)drafts.set(draftKey(previous),{body:body.value,subject:subject.value});
  const draft=drafts.get(draftKey(next));body.value=draft?.body||'';subject.value=draft?.subject||'';
  smsReply.value=null;secureReply.value=null;
});
watch([channel,selectedClientId,numberId,smsReply],()=>{void checkSms();});
async function loadContact(){
 const own=generation;initialLoading.value=true;error.value='';
 try{
  const {data}=await api.get(`${root()}/context`,{skipGlobalLoading:true});
  if(own!==generation||!alive)return;
  clients.value=data.clients||[];contact.value=data.guardian;
  const nextAgency=clients.value[0]?.agencyId||'';
  if(agencyId.value===nextAgency)void loadHistory();
  else agencyId.value=nextAgency;
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Could not load guardian contact details.';}
 finally{if(own===generation)initialLoading.value=false;}
}
function refreshWorkspace(){if(contact.value)void loadHistory();else void loadContact();}
watch(()=>props.guardianId,()=>{
 generation++;drafts.clear();pendingSecure.value=null;historyGeneration++;detailGeneration++;smsGeneration++;
 smsReady.value=null;smsError.value='';smsReply.value=null;secureReply.value=null;selectedIds.value=[];selectedClientId.value=null;
 historyClientId.value='';historyChannel.value='';contact.value=null;clients.value=[];threads.value=[];nextCursor.value=null;historyError.value='';loading.value=false;
 body.value='';subject.value='';emailContext.value=null;closeThread();agencyId.value='';error.value='';notice.value='';actionError.value='';busy.value=false;
 void loadContact();
},{immediate:true});
function onEmailChanged(event){if(event.detail?.change==='delivery'&&contact.value)void loadHistory();}
onMounted(()=>window.addEventListener('email-workspace-changed',onEmailChanged));
onBeforeUnmount(()=>{alive=false;generation++;historyGeneration++;detailGeneration++;smsGeneration++;window.removeEventListener('email-workspace-changed',onEmailChanged);});
</script>
<style scoped>
.guardian-messages{color:var(--text-primary,#20354f);width:100%;min-width:0}.workspace-heading,.contact-strip,.history-heading,.thread-detail>header,.inline-email>header{display:flex;align-items:start;justify-content:space-between;gap:20px;flex-wrap:wrap}.workspace-heading h2{margin:4px 0 10px;font-size:28px}.guardian-messages h3{margin:0 0 12px;font-size:19px}.guardian-messages p{line-height:1.65}.eyebrow{text-transform:uppercase;letter-spacing:.1em;font-weight:700;font-size:11px;color:#65778b;margin:0}.contact-strip{padding:18px 22px;background:#f3f7fb;border-radius:14px;margin:22px 0;align-items:center}.contact-strip small{display:block;margin-top:6px;overflow-wrap:anywhere;color:#5c6e85}.workspace-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(230px,1fr);gap:22px}.compose-card,.history-card,.thread-detail,.inline-email{padding:26px;border:1px solid #dce5ee;border-radius:18px;background:var(--bg-card,#fff);min-width:0}.filing-card{padding:24px;border-radius:18px;background:linear-gradient(150deg,#eef5fb,#f5f8fa);color:#405975;font-size:14px}.filing-card h3{margin-top:12px;line-height:1.5}.channel-picker{display:flex;gap:6px;padding:5px;background:#f0f4f8;border-radius:12px;margin:18px 0}.channel-picker button{flex:1;border:0;border-radius:8px;padding:12px;background:transparent;color:#536980;font:600 13px system-ui;cursor:pointer}.channel-picker button[aria-pressed=true]{background:white;box-shadow:0 2px 7px #18334b16;color:#174b78}.guardian-messages label{display:grid;gap:7px;font-size:13px;font-weight:600;margin:14px 0}.guardian-messages input:not([type=checkbox]):not([type=radio]),.guardian-messages select,.guardian-messages textarea{width:100%;max-width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd8e5;border-radius:10px;font:inherit;color:inherit;background:var(--bg-card,#fff)}.guardian-messages textarea{min-height:180px;resize:vertical;font-weight:400;line-height:1.65}.guardian-messages fieldset{border:1px solid #dce5ee;border-radius:12px;padding:12px 16px;margin:16px 0}.guardian-messages legend{font-size:12px;font-weight:650;color:#5c6e85;padding:0 6px}.guardian-messages .client-choice{display:flex;align-items:center;gap:9px;margin:9px 0;font-size:14px}.client-choice input{width:18px;height:18px;accent-color:#315f86}.help,.history-heading p{font-size:13px;color:#62748b}.recipient-label,.contact-instructions{padding:12px 14px;background:#f4f8fb;border-radius:10px;font-size:13px;overflow-wrap:anywhere}.compose-footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.compose-footer small{color:#6c7c91}.primary-button,.quiet-button{border:1px solid #c9d7e3;border-radius:10px;padding:11px 16px;color:#315574;background:#fff;font:600 13px system-ui;cursor:pointer}.primary-button{background:#315f86;color:#fff;border-color:#315f86}.guardian-messages button:disabled{opacity:.5;cursor:default}.text-button{border:0;background:transparent;color:#215987;text-decoration:underline;cursor:pointer}.history-card,.thread-detail,.inline-email{margin-top:24px}.history-filters{display:flex;gap:12px;flex-wrap:wrap}.history-filters label{min-width:150px;margin:0}.thread-list{list-style:none;padding:0;margin:18px 0}.thread-list li+li{border-top:1px solid #e4ebf2}.thread-list button{display:flex;align-items:center;gap:14px;padding:17px 10px;background:transparent;border:0;text-align:left;width:100%;color:inherit;cursor:pointer;border-radius:10px}.thread-list button:hover,.thread-list button[aria-current=true]{background:#f0f6fb}.channel-badge{background:#eaf1f8;color:#315c83;font-size:11px;font-weight:650;border-radius:8px;padding:7px 10px;white-space:nowrap}.thread-summary{flex:1;min-width:0}.thread-summary strong,.thread-summary small{display:block;overflow-wrap:anywhere}.thread-summary strong{font-size:14px}.thread-summary small{font-size:12px;color:#65778b;margin-top:7px}.thread-list time{font-size:11px;color:#65778b}.sms-history{display:grid;gap:14px;margin:20px 0}.sms-history article{padding:16px 18px;border-radius:12px;background:#f1f5f9;border:1px solid #e0e8f0;max-width:85%}.sms-history article.outbound-text{justify-self:end;background:#edf5fc}.sms-history article header{display:flex;gap:20px;justify-content:space-between;font-size:12px}.sms-history small,.sms-history time{color:#65778b;font-size:11px}.message-body{white-space:pre-wrap;overflow-wrap:anywhere}.detail-actions{margin-top:18px}.inline-email :deep(.email-composer){padding:0;max-width:none;width:100%;box-sizing:border-box}.inline-email :deep(.email-composer>header){display:none}.guardian-messages [role=alert]{color:#a12b30;background:#fff2f1;border-radius:10px;padding:12px 14px}.guardian-messages button:focus-visible,.guardian-messages input:focus-visible,.guardian-messages textarea:focus-visible,.guardian-messages select:focus-visible{outline:3px solid #80b0d7;outline-offset:2px}@media(max-width:900px){.workspace-grid{grid-template-columns:1fr}.filing-card{display:none}}@media(max-width:600px){.compose-card,.history-card,.thread-detail,.inline-email{padding:18px}.thread-list button{flex-wrap:wrap}.thread-list time{width:100%;padding-left:4px}.contact-strip>label{width:100%}.history-filters{width:100%}.history-filters label{flex:1}.channel-picker button{padding:12px 7px;font-size:12px}}
</style>
