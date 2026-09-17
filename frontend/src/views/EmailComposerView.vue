<template>
  <main class="email-composer">
    <header><h1>{{ title }}</h1><button type="button" :disabled="busy || loading" @click="saveAndClose">Save &amp; close ×</button></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="loading" role="status">Opening draft…</p>
    <template v-else-if="record">
      <p class="status" role="status">{{ status }}<span v-if="fromEmail"> · From {{ fromEmail }}</span></p>
      <template v-if="record.state === 'editing'">
        <form @submit.prevent="send"><fieldset :disabled="busy">
          <label>To<input v-model="draft.to" type="text" inputmode="email" required placeholder="name@example.com, group@itsco.health" /></label>
          <div class="recipients"><label>Cc<input v-model="draft.cc" type="text" inputmode="email" /></label><label>Bcc<input v-model="draft.bcc" type="text" inputmode="email" /></label></div>
          <label>Subject<input v-model="draft.subject" maxlength="998" /></label>
          <label>Your message<textarea ref="bodyInput" v-model="draft.text" placeholder="Write your message…" rows="12" /></label>
          <label class="files">Attach files<input type="file" multiple @change="attach" /></label>
          <ul v-if="draft.attachments.length"><li v-for="(a,i) in draft.attachments" :key="i">{{ a.filename }} <button type="button" @click="draft.attachments.splice(i,1)">Remove</button></li></ul>
          <footer><button class="send" :disabled="busy" type="submit">{{ busy ? 'Working…' : 'Send' }}</button><button :disabled="busy" type="button" @click="discard">Discard draft</button></footer>
          <details v-if="draft.quotedText" open><summary>Previous emails included below your message</summary><pre>{{ draft.quotedText }}</pre></details>
        </fieldset></form>
      </template>
      <p v-else-if="record.state === 'sending'">Submission is awaiting confirmation. Check the conversation’s delivery status before sending another copy.</p>
      <div v-else><p>Email queued for delivery.</p><button v-if="sendResult?.messageId && undoAvailable" type="button" :disabled="busy" @click="undo">Undo send</button><button type="button" @click="closeWindow">Close</button></div>
    </template>
  </main>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import api from '../services/api';
import { emailReplyRecipients } from '../utils/messageThreads';
import { quoteEmailHistory } from '../utils/emailReading';
import { encodeEmailFiles } from '../utils/communicationAttachments';
const route=useRoute(); const router=useRouter(); const qv=route.meta.publicQuickView === true;
const record=ref(null),draft=ref({to:'',cc:'',bcc:'',subject:'',text:'',quotedText:'',attachments:[]});
const error=ref(''),status=ref(''),loading=ref(true),busy=ref(false),fromEmail=ref(''),bodyInput=ref(null),sendResult=ref(null),undoAvailable=ref(false);
const title=computed(()=>({new:'New email',reply:'Reply',reply_all:'Reply all',forward:'Forward'})[record.value?.mode || route.query.mode] || 'Email draft');
let saved='',timer=null,saveTask=null,undoTimer=null;
const config=()=>({withCredentials:true,skipGlobalLoading:true,headers:qv && sessionStorage.getItem('plottwist.quickViewSession') ? {'X-Quick-View-Session':sessionStorage.getItem('plottwist.quickViewSession')} : {}});
const request=(method,path,data)=>qv ? axios({method,url:`/api/quick-view${path}`,data,...config()}) : api({method,url:`/communications${path}`,data,...config()});
const notify=()=>{try{window.opener?.postMessage({type:'email-drafts-changed'},window.location.origin);}catch{/* opener may be closed */}};
async function save() {
  clearTimeout(timer);
  if(saveTask) { await saveTask; return save(); }
  if(!record.value || record.value.state !== 'editing') return;
  const snapshot=JSON.stringify(draft.value); if(snapshot===saved)return;
  status.value='Saving…';
  saveTask=(async()=>{const {data}=await request('put',`/drafts/${record.value.id}`,{version:record.value.version,draft:JSON.parse(snapshot)});record.value.version=data.version;saved=snapshot;status.value='Draft saved';error.value='';notify();})();
  try { await saveTask; } catch(e) { status.value='Draft not saved';error.value=e.response?.data?.error?.message || 'Could not save. Keep this window open and retry.';throw e; } finally{saveTask=null;}
}
watch(draft,()=>{if(loading.value||record.value?.state!=='editing')return;status.value='Unsaved changes';clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),500);},{deep:true});
async function attach(event){try{draft.value.attachments.push(...await encodeEmailFiles(event.target.files || []));await save();}catch(e){error.value=e.message;}finally{event.target.value='';}}
async function saveAndClose(){busy.value=true;try{await save();closeWindow();}catch{/* retain draft */}finally{busy.value=false;}}
function closeWindow(){notify();if(window.opener){window.close();}else router.back();}
function beforeUnload(event){if(record.value?.state==='editing' && JSON.stringify(draft.value)!==saved){save().catch(()=>{});event.preventDefault();event.returnValue='';}}
function onHidden(){if(document.visibilityState==='hidden')save().catch(()=>{});}
async function discard(){busy.value=true;try{clearTimeout(timer);if(saveTask)await saveTask;await request('delete',`/drafts/${record.value.id}`);record.value.state='discarded';saved=JSON.stringify(draft.value);closeWindow();}catch(e){error.value=e.response?.data?.error?.message || 'Could not discard draft';}finally{busy.value=false;}}
async function send(){busy.value=true;error.value='';try{await save();const {data}=await request('post',`/drafts/${record.value.id}/send`,{version:record.value.version});sendResult.value=data;record.value.state='sent';status.value='Queued';undoAvailable.value=true;undoTimer=setTimeout(()=>undoAvailable.value=false,20000);notify();}catch(e){error.value=e.response?.data?.error?.message || 'Could not confirm sending. Check the conversation before retrying.';try{const {data}=await request('get',`/drafts/${record.value.id}`);record.value.state=data.draft.state;}catch{/* retain original error */}}finally{busy.value=false;}}
async function undo(){busy.value=true;try{await request('post',`/conversations/${sendResult.value.conversationId}/messages/${sendResult.value.messageId}/undo`,{});const {data}=await request('post','/drafts',{agencyId:record.value.agency_id,conversationId:record.value.conversation_id,mode:record.value.mode,draft:draft.value});record.value=data.draft;saved=JSON.stringify(draft.value);undoAvailable.value=false;status.value='Send undone. Draft saved.';await router.replace({query:{draftId:record.value.id}});notify();}catch(e){error.value=e.response?.data?.error?.message || 'The undo window has ended';}finally{busy.value=false;}}
onMounted(async()=>{
  window.addEventListener('beforeunload',beforeUnload);document.addEventListener('visibilitychange',onHidden);
  try{
    if(route.query.draftId){const {data}=await request('get',`/drafts/${route.query.draftId}`);record.value=data.draft;draft.value={...draft.value,...data.draft.draft};}
    else {
      const mode=String(route.query.mode || 'new');let agencyId=Number(route.query.agencyId);const cid=Number(route.query.conversationId);draft.value.to=String(route.query.to || '');
      if(cid){const {data}=await request('get',`/conversations/${cid}?markRead=0`);const c=data.conversation;agencyId=c.agency_id;fromEmail.value=c.inbox_from_email || '';const addresses=emailReplyRecipients(data.messages,{mode,inboxEmail:fromEmail.value});draft.value.to=addresses.to.join(', ');draft.value.cc=addresses.cc.join(', ');draft.value.subject=`${mode==='forward'?'Fwd:':'Re:'} ${String(c.subject || '').replace(/^(?:(?:re|fwd?)\s*:\s*)+/i,'')}`;draft.value.quotedText=quoteEmailHistory(data.messages);}
      else if(!qv){const {data}=await request('get',`/inboxes?agencyId=${agencyId}`);fromEmail.value=data.inboxes?.find(i=>i.kind==='personal')?.from_email || '';}
      const {data}=await request('post','/drafts',{agencyId,conversationId:cid || null,mode,draft:draft.value});record.value=data.draft;await router.replace({query:{draftId:record.value.id}});notify();
    }
    fromEmail.value=record.value.from_email || fromEmail.value;
    if(String(record.value.id).startsWith('legacy-') && /<[^>]+>/.test(draft.value.text)){const doc=new DOMParser().parseFromString(draft.value.text,'text/html');doc.querySelectorAll('p,div,br').forEach(e=>e.append('\n'));draft.value.text=doc.body.textContent || '';}
    saved=JSON.stringify(draft.value);status.value=record.value.state==='editing'?'Draft saved':'Submitted';
  }catch(e){error.value=e.response?.data?.error?.message || 'Could not open draft. Sign in again and retry.';}
  finally{loading.value=false;await nextTick();bodyInput.value?.focus();}
});
onUnmounted(()=>{clearTimeout(timer);clearTimeout(undoTimer);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('visibilitychange',onHidden);});
</script>
<style scoped>
fieldset{border:0;padding:0;margin:0;min-width:0}.email-composer{max-width:1050px;margin:auto;padding:24px;color:var(--text-primary,#20352b);background:var(--bg-primary,#fff);min-height:100vh}header,footer,.recipients{display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}h1{font-size:1.5rem}label{display:flex;flex-direction:column;gap:6px;margin:12px 0;flex:1}input,textarea,button{font:inherit;color:inherit;border:1px solid #a5b9af;border-radius:6px;padding:10px;background:transparent}textarea{min-height:250px;resize:vertical;line-height:1.5;width:100%;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5}.send{background:#16664c;color:white;min-width:120px}.error{color:#af2929}.status{font-size:.85rem;color:#47755f}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6}details{margin-top:24px;border-top:1px solid #a5b9af;padding-top:14px;opacity:.85}footer{justify-content:flex-start}@media(max-width:600px){.email-composer{padding:12px}.recipients{display:block}}
</style>
