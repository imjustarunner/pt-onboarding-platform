<template>
  <main class="email-composer conversa-surface">
    <header><div class="composer-heading"><ConversaBrand compact /><h1>{{ title }}</h1></div><button type="button" :disabled="busy || loading" @click="saveAndClose">Save &amp; close ×</button></header>
    <p v-if="error" role="alert" class="error">{{ error }} <button v-if="record?.state==='editing'" type="button" :disabled="busy" @click="retrySave">Retry saving</button></p>
    <p v-if="loading" role="status">Opening draft…</p>
    <button v-else-if="!record" type="button" @click="openDraft">Try opening draft again</button>
    <template v-else-if="record">
      <p class="status" role="status">{{ status }}<span v-if="senderPreview?.fromEmail"> · From {{ senderPreview.fromEmail }} · Replies to {{ senderPreview.replyTo }}</span></p>
      <p v-if="senderPreviewUnavailable" role="status">Sender details are temporarily unavailable. Your draft can still be saved; sending will recheck the mailbox.</p>
      <template v-if="record.state === 'editing'">
        <form @submit.prevent="send"><fieldset :disabled="busy">
          <div class="to-row"><EmailRecipientField :agency-id="qv ? null : record.agency_id" v-model="draft.to" label="To" required /><button v-if="!draft.cc && !draft.bcc" type="button" :aria-expanded="showCopyFields" @click="showCopyFields=!showCopyFields">Cc / Bcc</button></div>
          <div v-show="showCopyFields || draft.cc || draft.bcc" class="recipients"><EmailRecipientField :agency-id="qv ? null : record.agency_id" v-model="draft.cc" label="Cc" /><EmailRecipientField :agency-id="qv ? null : record.agency_id" v-model="draft.bcc" label="Bcc" /></div>
          <label>Subject<input v-model="draft.subject" maxlength="998" /></label>
          <label>Your message<textarea ref="bodyInput" v-model="draft.text" placeholder="Write your message…" rows="12" /></label>
          <label class="files">Attach files<input type="file" multiple @change="attach" /></label>
          <ul v-if="draft.attachments.length"><li v-for="(a,i) in draft.attachments" :key="i">{{ a.filename }} <button type="button" @click="draft.attachments.splice(i,1)">Remove</button></li></ul>
          <div v-if="confirmAttachment" class="attachment-warning" role="alert">
            <p>Your message mentions an attachment, but no file is attached.</p>
            <button type="button" @click="send({confirmMissingAttachment:true})">Send without an attachment</button>
            <button type="button" @click="confirmAttachment=false">Keep editing</button>
          </div>
          <section v-if="filingChoices.length" role="alert" class="attachment-warning">
            <p>Which client or clients is this conversation about? Select every child discussed.</p>
            <label v-for="client in filingChoices" :key="client.id"><input type="checkbox" v-model="draft.clientIds" :value="client.id" /> {{ client.name }}</label>
            <button type="button" @click="draft.clientIds=filingChoices.map(c=>c.id)">Select all listed children</button>
            <button type="button" :disabled="!draft.clientIds?.length" @click="send({confirmMissingAttachment:true})">Continue sending</button>
            <button type="button" @click="deferFiling">Send and flag for filing review</button>
          </section>
          <EmailDeliveryChoice :info="availabilityPrompt" :busy="busy" @choose="send({confirmMissingAttachment:true,deliveryChoice:$event})" @cancel="availabilityPrompt=null" />
          <footer><button class="send" :disabled="busy" type="submit">{{ busy ? 'Working…' : 'Send' }}</button><button :disabled="busy" type="button" @click="discard">Discard draft</button></footer>
          <details v-if="draft.quotedText" open><summary>Original conversation — collapse or expand</summary><pre v-html="readableEmailHtml({body_text:draft.quotedText})" /></details>
        </fieldset></form>
      </template>
      <p v-else-if="record.state === 'sending'">Submission is awaiting confirmation. Check the conversation’s delivery status before sending another copy.</p>
      <div v-else><p role="status">{{ deliveryStatus }}</p><button v-if="sendResult?.conversationId && sendResult?.messageId" type="button" :disabled="busy" @click="checkDelivery">Check delivery status</button><button v-if="sendResult?.messageId && undoAvailable" type="button" :disabled="busy" @click="undo">Undo send</button><button type="button" @click="closeWindow">Close</button></div>
    </template>
  </main>
</template>
<script setup>
import ConversaBrand from '../components/conversa/ConversaBrand.vue';
import EmailRecipientField from '../components/messages/EmailRecipientField.vue';
import EmailDeliveryChoice from '../components/messages/EmailDeliveryChoice.vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import api, { messagingRequestOptions } from '../services/messagingApi';
import { emailReplyRecipients } from '../utils/messageThreads';
import { quoteEmailHistory } from '../utils/emailReading';
import { readableEmailHtml, emailDeliveryLabel } from '../utils/emailPresentation';
import { encodeEmailFiles } from '../utils/communicationAttachments';
const props=defineProps({composeContext:{type:Object,default:null}});
const emit=defineEmits(['close','composer-state']);
const route=useRoute(); const router=useRouter(); const context=props.composeContext || route.query; const qv=props.composeContext ? !!context.quickView : route.meta.publicQuickView === true;
const setDraftRoute=id=>props.composeContext ? Promise.resolve() : router.replace({query:{draftId:id}});
const record=ref(null),draft=ref({to:'',cc:'',bcc:'',subject:'',text:'',quotedText:'',attachments:[]});
const error=ref(''),status=ref(''),loading=ref(true),busy=ref(false),fromEmail=ref(''),bodyInput=ref(null),sendResult=ref(null),undoAvailable=ref(false);
const senderPreview=ref(null),senderPreviewUnavailable=ref(false);
const title=computed(()=>({new:'New email',reply:'Reply',reply_all:'Reply all',forward:'Forward'})[record.value?.mode || context.mode] || 'Email draft');
const filingChoices=ref([]);
async function deferFiling(){draft.value.deferClientFiling=true;draft.value.clientIds=[];await send({confirmMissingAttachment:true});}
const showCopyFields=ref(false),confirmAttachment=ref(false),availabilityPrompt=ref(null),confirmedDelivery=ref('');
const deliveryStatus=computed(()=>confirmedDelivery.value || (sendResult.value?.sent ? 'Sent' : sendResult.value?.scheduledSendAt ? `Queued for ${new Date(sendResult.value.scheduledSendAt).toLocaleString()}` : 'Email queued for delivery.'));
async function checkDelivery(){busy.value=true;try{const {data}=await request('get',`/conversations/${sendResult.value.conversationId}?markRead=0`);const message=data.messages?.find(m=>Number(m.id)===Number(sendResult.value.messageId));error.value='';confirmedDelivery.value=message?emailDeliveryLabel(message):'Open the conversation to check this email’s delivery status.';status.value=confirmedDelivery.value;notify('delivery');}catch{error.value='Could not check delivery. Please try again.';}finally{busy.value=false;}}
let saved='',timer=null,saveTask=null,undoTimer=null;
const config=()=>{const session=context.session || sessionStorage.getItem('plottwist.quickViewSession');return messagingRequestOptions({withCredentials:true,headers:qv && session && session!=='cookie' ? {'X-Quick-View-Session':session} : {}});};
const request=(method,path,data)=>qv ? axios({method,url:`/api/quick-view${path}`,data,...config()}) : api({method,url:`/communications${path}`,data,...config()});
const notify=(change='draft')=>{window.dispatchEvent(new CustomEvent('email-workspace-changed',{detail:{change,draft:record.value ? {id:record.value.id,agencyId:record.value.agency_id,mode:record.value.mode,state:record.value.state,to:draft.value.to,subject:draft.value.subject} : null}}));try{window.opener?.postMessage({type:'email-drafts-changed',change},window.location.origin);}catch{/* opener may be closed */}};
async function save() {
  clearTimeout(timer);
  if(saveTask) { await saveTask; return save(); }
  if(!record.value || record.value.state !== 'editing') return;
  const snapshot=JSON.stringify(draft.value); if(snapshot===saved)return;
  status.value='Saving…';
  saveTask=(async()=>{const {data}=await request('put',`/drafts/${record.value.id}`,{version:record.value.version,draft:JSON.parse(snapshot)});record.value.version=data.version;saved=snapshot;status.value='Draft saved';error.value='';notify();})();
  try { await saveTask; } catch(e) { status.value='Draft not saved';error.value=e.response?.data?.error?.message || 'Could not save. Keep this window open and retry.';throw e; } finally{saveTask=null;}
}
watch(()=>[draft.value.to,draft.value.cc,draft.value.bcc],(next,previous)=>{if(!loading.value && previous && next.some((v,i)=>v!==previous[i])){draft.value.clientIds=[];draft.value.deferClientFiling=false;filingChoices.value=[];}});
watch(draft,()=>{availabilityPrompt.value=null;confirmAttachment.value=false;if(loading.value||record.value?.state!=='editing')return;status.value='Unsaved changes';clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),500);},{deep:true});
async function attach(event){try{draft.value.attachments.push(...await encodeEmailFiles(event.target.files || []));await save();}catch(e){error.value=e.message;}finally{event.target.value='';}}
async function saveAndClose(){busy.value=true;try{await save();closeWindow();}catch{/* retain draft */}finally{busy.value=false;}}
function closeWindow(){notify();if(props.composeContext){emit('close');return;}if(window.opener){window.close();}else router.back();}
function beforeUnload(event){if(record.value?.state==='editing' && JSON.stringify(draft.value)!==saved){save().catch(()=>{});event.preventDefault();event.returnValue='';}}
function onHidden(){if(document.visibilityState==='hidden')save().catch(()=>{});}
function retrySave(){if(!busy.value)save().catch(()=>{});}
async function discard(){busy.value=true;try{clearTimeout(timer);if(saveTask)await saveTask;await request('delete',`/drafts/${record.value.id}`);record.value.state='discarded';saved=JSON.stringify(draft.value);closeWindow();}catch(e){error.value=e.response?.data?.error?.message || 'Could not discard draft';}finally{busy.value=false;}}
async function send({confirmMissingAttachment=false,deliveryChoice=null}={}){if(busy.value)return;if(!confirmMissingAttachment&&!draft.value.attachments.length&&/\battach(?:ed|ment|ments|ing)?\b/i.test(draft.value.subject+'\n'+draft.value.text)){confirmAttachment.value=true;return;}confirmAttachment.value=false;busy.value=true;error.value='';try{await save();const {data}=await request('post',`/drafts/${record.value.id}/send`,{version:record.value.version,deliveryChoice});availabilityPrompt.value=null;sendResult.value=data;confirmedDelivery.value='';record.value.state='sent';status.value=data.sent?'Sent':'Queued';undoAvailable.value=true;undoTimer=setTimeout(()=>undoAvailable.value=false,20000);notify('delivery');}catch(e){if(e.response?.data?.error?.code==='CLIENT_FILING_CHOICE_REQUIRED'){filingChoices.value=e.response.data.error.clients || [];if(!draft.value.clientIds)draft.value.clientIds=[];return;}if(e.response?.data?.error?.code==='RECIPIENT_AVAILABILITY_CHOICE_REQUIRED'){availabilityPrompt.value=e.response.data.error.availability;return;}error.value=e.response?.data?.error?.message || 'Could not confirm sending. Check the conversation before retrying.';try{const {data}=await request('get',`/drafts/${record.value.id}`);record.value.state=data.draft.state;}catch{/* retain original error */}}finally{busy.value=false;}}
async function undo(){busy.value=true;try{await request('post',`/conversations/${sendResult.value.conversationId}/messages/${sendResult.value.messageId}/undo`,{});const {data}=await request('post','/drafts',{agencyId:record.value.agency_id,conversationId:record.value.conversation_id,mode:record.value.mode,draft:draft.value});record.value=data.draft;saved=JSON.stringify(draft.value);undoAvailable.value=false;status.value='Send undone. Draft saved.';await setDraftRoute(record.value.id);notify('delivery');}catch(e){error.value=e.response?.data?.error?.message || 'The undo window has ended';}finally{busy.value=false;}}
async function openDraft(){
  loading.value=true;error.value='';
  try{
    if(context.draftId){const {data}=await request('get',`/drafts/${context.draftId}`);record.value=data.draft;draft.value={...draft.value,...data.draft.draft};}
    else {
      const mode=String(context.mode || 'new');let agencyId=Number(context.agencyId);const cid=Number(context.conversationId);draft.value.to=String(context.to || '');
      if(cid){const {data}=await request('get',`/conversations/${cid}?markRead=0`);const c=data.conversation;agencyId=c.agency_id;fromEmail.value=c.inbox_from_email || '';const addresses=emailReplyRecipients(data.messages,{mode,inboxEmail:fromEmail.value});draft.value.to=addresses.to.join(', ');draft.value.cc=addresses.cc.join(', ');draft.value.subject=`${mode==='forward'?'Fwd:':'Re:'} ${String(c.subject || '').replace(/^(?:(?:re|fwd?)\s*:\s*)+/i,'')}`;draft.value.quotedText=quoteEmailHistory(data.messages);}
      // Creating a draft must not wait for Workspace mailbox provisioning.
      // Sender validation runs independently after the draft is editable.
      const {data}=await request('post','/drafts',{agencyId,conversationId:cid || null,mode,draft:draft.value});record.value=data.draft;draft.value={...draft.value,...data.draft.draft};await setDraftRoute(record.value.id);notify();
    }
    fromEmail.value=record.value.from_email || fromEmail.value;sendResult.value=record.value.result || sendResult.value;
    if(String(record.value.id).startsWith('legacy-') && /<[^>]+>/.test(draft.value.text)){const doc=new DOMParser().parseFromString(draft.value.text,'text/html');doc.querySelectorAll('p,div,br').forEach(e=>e.append('\n'));draft.value.text=doc.body.textContent || '';}
    saved=JSON.stringify(draft.value);status.value=record.value.state==='editing'?(record.value.resumed?'Draft restored':'Draft saved'):'Submitted';
    if(record.value.state==='editing')void loadSenderPreview(record.value.id);
  }catch(e){error.value=e.response?.data?.error?.message || 'Could not open draft. Sign in again and retry.';}
  finally{loading.value=false;await nextTick();bodyInput.value?.focus();}
}
async function loadSenderPreview(id){
  senderPreview.value=null;senderPreviewUnavailable.value=false;
  try{const {data}=await request('get',`/drafts/${id}/sender`);if(record.value?.id===id)senderPreview.value=data;}
  catch{if(record.value?.id===id)senderPreviewUnavailable.value=true;}
}
onMounted(()=>{
  window.addEventListener('beforeunload',beforeUnload);window.addEventListener('online',retrySave);document.addEventListener('visibilitychange',onHidden);
  void openDraft();
});
onUnmounted(()=>{clearTimeout(timer);clearTimeout(undoTimer);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('online',retrySave);document.removeEventListener('visibilitychange',onHidden);});
async function preparePopout(){if(busy.value||loading.value)return null;busy.value=true;try{await save();return record.value?.id;}finally{busy.value=false;}}
watch([status,error,busy,loading,()=>record.value?.id,()=>draft.value.subject,()=>draft.value.to],()=>emit('composer-state',{draftId:record.value?.id,conversationId:record.value?.conversation_id,mode:record.value?.mode,subject:draft.value.subject,recipient:draft.value.to,status:error.value?'Needs attention':status.value,busy:busy.value,loading:loading.value}),{immediate:true});
defineExpose({save,saveAndClose,preparePopout});
</script>
<style scoped>
.composer-heading{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.composer-heading h1{font-size:18px}.email-composer header{flex-wrap:wrap;gap:12px}

fieldset{border:0;padding:0;margin:0;min-width:0}.email-composer{max-width:1050px;margin:auto;padding:24px;color:var(--text-primary,#20352b);background:var(--bg-primary,#fff);min-height:100vh}header,footer,.recipients,.to-row{display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}h1{font-size:1.5rem}label{display:flex;flex-direction:column;gap:6px;margin:12px 0;flex:1}input,textarea,button{font:inherit;color:inherit;border:1px solid #a5b9af;border-radius:6px;padding:10px;background:transparent}textarea{min-height:250px;resize:vertical;line-height:1.5;width:100%;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5}.send{background:#0047b3;color:white;min-width:120px}.error{color:#af2929}.status{font-size:.85rem;color:#47755f}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6}details{margin-top:24px;border-top:1px solid #a5b9af;padding-top:14px;opacity:.85}footer{justify-content:flex-start}@media(max-width:600px){.email-composer{padding:12px}.recipients{display:block}}
</style>
