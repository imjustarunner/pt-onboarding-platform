<template>
  <section class="school-email">
    <header class="email-header">
      <div><h2>Email</h2><p>Emails sent to or from your school’s group address. Choosing “No email” stops inbox delivery; it does not hide these messages.</p><p v-if="groupEmail"><strong>{{ groupEmail }}</strong></p></div>
      <div class="email-actions"><button type="button" @click="startCompose()">New email</button><button type="button" :disabled="loading" @click="load()">Refresh</button></div>
    </header>
    <p v-if="error" role="alert" class="email-error">{{ error }}</p>
    <p v-if="success" role="status" class="email-success">{{ success }}</p>
    <div class="email-filter"><label><input v-model="unreadOnly" type="checkbox" @change="load()"> Unread only <span v-if="unreadCount">({{ unreadCount }})</span></label></div>
    <div class="email-grid">
      <div class="email-list" aria-label="Email list">
        <p v-if="loading && !messages.length">Loading emails…</p>
        <p v-else-if="!messages.length && !error">{{ unreadOnly ? 'You’re caught up. No unread emails.' : 'No emails available yet.' }}</p>
        <button v-for="message in messages" :key="message.id" type="button" class="email-item" :class="{unread:message.unread,selected:selected?.id===message.id}" @click="open(message)">
          <span class="email-item-top"><strong>{{ message.from?.name || message.from?.email || 'School email' }}</strong><span v-if="message.unread" class="email-dot" aria-label="Unread" /></span>
          <span>{{ message.subject }}</span><small>{{ date(message.sentAt) }}</small><span class="email-preview">{{ message.preview }}</span>
        </button>
        <button v-if="hasMore" type="button" :disabled="loading" @click="load(true)">Load more</button>
      </div>
      <div class="email-detail" aria-live="polite">
        <p v-if="opening">Loading email…</p>
        <form v-else-if="composing" @submit.prevent="send">
          <h3>{{ replyMessageId ? 'Reply by email' : 'New email' }}</h3>
          <p class="email-muted">Sent from your school’s messaging service. A copy goes to {{ groupEmail }} and is visible to your school group. Use Messages for private internal conversations.</p>
          <label>To<input v-model.trim="draft.to" type="email" required :disabled="sending" placeholder="name@example.org"></label>
          <label>Subject<input v-model.trim="draft.subject" required maxlength="250" :disabled="sending"></label>
          <label>Message<textarea v-model="draft.body" required maxlength="20000" rows="9" :disabled="sending" /></label>
          <div class="email-actions"><button type="submit" :disabled="sending">{{ sending ? 'Sending…' : 'Send email' }}</button><button type="button" :disabled="sending" @click="composing=false">Cancel</button></div>
        </form>
        <article v-else-if="selected">
          <h3>{{ selected.subject }}</h3>
          <p class="email-muted">From: {{ selected.from?.name || selected.from?.email }}<br>To: {{ addresses(selected.to) }}<br><template v-if="selected.cc?.length">Cc: {{ addresses(selected.cc) }}<br></template>{{ date(selected.sentAt) }}</p>
          <div v-if="selected.html" class="email-body" v-html="safeHtml" />
          <div v-else class="email-text">{{ selected.text }}</div>
          <div v-if="selected.attachments?.length" class="email-attachments"><h4>Attachments</h4><button v-for="file in selected.attachments" :key="file.id" type="button" @click="download(file)">{{ file.filename }}</button></div>
          <button type="button" @click="startCompose(selected)">Reply by email</button>
        </article>
        <p v-else class="email-muted">Select an email to read it, or start a new email.</p>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../../services/api';
const props=defineProps({schoolOrganizationId:{type:Number,required:true}});
const emit=defineEmits(['unread-update']);
const messages=ref([]), selected=ref(null), groupEmail=ref(''), unreadCount=ref(0), unreadOnly=ref(false), hasMore=ref(false);
const loading=ref(false), opening=ref(false), sending=ref(false), composing=ref(false), error=ref(''), success=ref(''), replyMessageId=ref(null);
const draft=ref({to:'',subject:'',body:''});
let loadVersion=0, openVersion=0;
const base=computed(()=>`/school-portal/${props.schoolOrganizationId}/emails`);
const safeHtml=computed(()=>DOMPurify.sanitize(selected.value?.html||'', { ALLOWED_TAGS:['p','br','div','span','strong','b','em','i','u','ul','ol','li','blockquote','h1','h2','h3','h4','table','tbody','tr','td','th','a','hr'], ALLOWED_ATTR:['href','title','colspan','rowspan'], ALLOW_DATA_ATTR:false }));
const date=value=>value ? new Date(value).toLocaleString() : '';
const addresses=value=>(value||[]).map(a=>a.email||a).join(', ');
const messageError=e=>e.response?.data?.error?.message||'Could not complete this request. Please try again.';
async function load(more=false){
  const version=++loadVersion;loading.value=true;error.value='';
  try{
    const {data}=await api.get(base.value,{params:{offset:more?messages.value.length:0,unread:unreadOnly.value}});
    if(version!==loadVersion)return;
    messages.value=more?[...messages.value,...data.messages]:data.messages;groupEmail.value=data.groupEmail;hasMore.value=data.hasMore;unreadCount.value=data.unreadCount;emit('unread-update',data.unreadCount);
  }catch(e){if(version===loadVersion)error.value=messageError(e);}finally{if(version===loadVersion)loading.value=false;}
}
async function open(message){
  const version=++openVersion;opening.value=true;selected.value=null;composing.value=false;error.value='';success.value='';
  const url=`${base.value}/${message.id}`;
  try{
    const {data}=await api.get(url);if(version!==openVersion)return;selected.value=data;
    await api.post(`${url}/read`);if(version!==openVersion)return;
    if(message.unread){message.unread=false;unreadCount.value=Math.max(0,unreadCount.value-1);emit('unread-update',unreadCount.value);}
  }catch(e){if(version===openVersion)error.value=messageError(e);}finally{if(version===openVersion)opening.value=false;}
}
function startCompose(message=null){
  ++openVersion;opening.value=false;replyMessageId.value=message?.id||null;
  draft.value={to:message?.from?.replyTo||message?.from?.email||groupEmail.value,subject:message ? (/^re:/i.test(message.subject)?message.subject:`Re: ${message.subject}`):'',body:''};
  composing.value=true;error.value='';success.value='';
}
async function send(){
  if(sending.value)return;sending.value=true;error.value='';
  try{const {data}=await api.post(base.value,{...draft.value,replyMessageId:replyMessageId.value});if(!data.sent)throw new Error('Not sent');composing.value=false;draft.value={to:'',subject:'',body:''};success.value=data.recordPending?'Email sent. Its saved copy is still updating.':'Email sent.';await load();}
  catch(e){error.value=messageError(e);}finally{sending.value=false;}
}
async function download(file){
  try{const {data}=await api.get(`${base.value}/${selected.value.id}/attachments/${file.id}`,{responseType:'blob'});const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error.value='Could not download this attachment. Please try again.';}
}
onMounted(()=>load());
watch(()=>props.schoolOrganizationId,()=>{++openVersion;selected.value=null;messages.value=[];composing.value=false;opening.value=false;success.value='';load();});
</script>
<style scoped>
.school-email{display:flex;flex-direction:column;gap:16px}.email-header{display:flex;justify-content:space-between;gap:16px}.email-header h2{margin:0}.email-header p{color:#64748b;max-width:680px;line-height:1.5}.email-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.school-email button{border:1px solid #cbd5e1;border-radius:9px;background:white;padding:10px 14px;color:#075985;cursor:pointer}.school-email button:disabled{opacity:.6;cursor:wait}.email-grid{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;min-height:340px}.email-list{border-right:1px solid #e2e8f0;max-height:70vh;overflow:auto;padding:10px}.email-list .email-item{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;border:0;border-bottom:1px solid #e2e8f0;border-radius:0;color:#1e293b;padding:16px 10px}.email-item.unread{background:#f0f9ff}.email-item.selected{box-shadow:inset 3px 0 #0284c7}.email-item-top{display:flex;justify-content:space-between;gap:8px}.email-dot{width:8px;height:8px;border-radius:50%;background:#0284c7;flex-shrink:0;margin-top:5px}.email-preview,.email-muted,.email-item small{color:#64748b;font-size:.88rem}.email-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.email-detail{padding:22px;overflow-wrap:anywhere}.email-detail h3{margin-top:0}.email-text{white-space:pre-wrap;line-height:1.65;margin-bottom:22px}.email-body{line-height:1.6;overflow:auto;margin-bottom:22px}.email-body :deep(table){max-width:100%;width:auto}.email-body :deep(a){color:#0369a1}.email-detail form,.email-detail form label{display:flex;flex-direction:column;gap:8px}.email-detail form{gap:16px}.email-detail input,.email-detail textarea{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:10px;max-width:100%;box-sizing:border-box}.email-attachments{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.email-attachments h4{width:100%;margin:0}.email-error{color:#b91c1c}.email-success{color:#047857}@media(max-width:700px){.email-header{flex-direction:column}.email-grid{grid-template-columns:1fr}.email-list{max-height:300px;border-right:0;border-bottom:1px solid #e2e8f0}.email-detail{padding:16px}}
</style>
