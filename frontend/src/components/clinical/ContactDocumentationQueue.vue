<template>
  <section class="contact-queue" aria-label="Contact documentation to do">
    <div class="queue-heading">
      <button type="button" class="btn btn-secondary" @click="expanded = !expanded">
        Contact documentation <strong>{{ pendingCount }}</strong> to do
      </button>
      <button type="button" class="btn btn-secondary" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="expanded">
      <p>One task per conversation. Recipients and messages are filled in automatically; add the reason for the contact. New replies update the same task.</p>
      <label><input v-model="showCompleted" type="checkbox" /> Include completed</label>
      <p v-if="!visibleItems.length && !loading">No contact documentation waiting.</p>
      <button v-for="item in visibleItems" :key="item.key" type="button" class="contact-task" @click="open(item)">
        <strong>{{ item.subject || 'Care-team conversation' }}</strong>
        <span>{{ item.source_type === 'email' ? 'Email' : 'Secure message' }} · {{ item.message_count }} messages · {{ formatDate(item.last_message_at) }}</span>
        <span>{{ item.needsReview ? (item.reviewedThroughId ? 'New replies to review' : 'Add contact purpose') : 'Completed' }}</span>
      </button>
    </div>
    <Teleport to="body">
      <div v-if="selected" class="contact-overlay" @keydown.esc="close">
        <section class="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-doc-title">
          <header><h2 id="contact-doc-title">{{ selected.subject || 'Contact documentation' }}</h2><button type="button" :disabled="saving" @click="close">Close</button></header>
          <p>Client(s): {{ selected.clients.map(c => c.name || `Client #${c.id}`).join(', ') }}</p>
          <label for="contact-purpose"><strong>Reason / purpose for contact</strong></label>
          <textarea id="contact-purpose" v-model="purpose" rows="4" maxlength="10000" placeholder="For example: Coordinate the next appointment and review the parent’s concerns." />
          <div class="queue-heading">
            <button type="button" class="btn btn-secondary" :disabled="saving" @click="save(false)">Save purpose</button>
            <button type="button" class="btn btn-primary" :disabled="saving || !purpose.trim()" @click="save(true)">Mark reviewed</button>
          </div>
          <p v-if="notice" role="status">{{ notice }}</p><p v-if="detailError" role="alert">{{ detailError }}</p>
          <p>Replies received after the messages shown below remain to do. Saved purposes and completed reviews are included in the client’s communication record.</p>
          <article v-for="m in selected.thread?.messages || []" :key="m.id" class="contact-message">
            <strong>{{ address(m.from) || [m.author_first_name,m.author_last_name].filter(Boolean).join(' ') || 'Message' }}</strong>
            <div v-if="m.to?.length">To: {{ address(m.to) }}</div>
            <div v-if="m.cc?.length">Cc: {{ address(m.cc) }}</div>
            <div v-if="m.bcc?.length">Bcc: {{ address(m.bcc) }}</div>
            <time>{{ formatDate(m.sent_at || m.created_at) }}</time>
            <pre>{{ messageText(m) }}</pre>
          </article>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,default:null}});
const emit=defineEmits(['pending-count']);
const items=ref([]),loading=ref(false),error=ref(''),expanded=ref(false),showCompleted=ref(false);
const selected=ref(null),purpose=ref(''),saving=ref(false),notice=ref(''),detailError=ref('');
const pendingCount=computed(()=>items.value.filter(i=>i.needsReview).length);
const visibleItems=computed(()=>items.value.filter(i=>showCompleted.value || i.needsReview));
watch(pendingCount,n=>emit('pending-count',n),{immediate:true});
const formatDate=v=>v?new Date(v).toLocaleString():'';
const address=v=>(Array.isArray(v)?v:v?[v]:[]).map(a=>typeof a==='string'?a:[a.name,a.email].filter(Boolean).join(' ')).join(', ');
const messageText=m=>m.body_text || m.body || String(m.body_html || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'');
let generation=0,timer;
async function load(){
  if(!props.agencyId || loading.value)return;
  const agency=props.agencyId,request=++generation;
  loading.value=true;error.value='';
  try{const r=await api.get('/clinical-notes/contact-documentation',{params:{agencyId:agency},timeout:30000});if(request===generation && agency===props.agencyId)items.value=r.data.items || [];}
  catch(e){if(request===generation)error.value=e.response?.data?.error?.message || 'Could not refresh contact documentation.';}
  finally{loading.value=false;}
}
async function open(item){
  detailError.value='';notice.value='';
  const agency=props.agencyId;
  try{const r=await api.get(`/clinical-notes/contact-documentation/${item.source_type}/${item.source_id}`,{params:{agencyId:agency},timeout:30000});if(agency!==props.agencyId)return;selected.value=r.data;purpose.value=r.data.purpose || '';}
  catch(e){error.value=e.response?.data?.error?.message || 'Could not open this conversation.';}
}
async function save(complete){
  if(!selected.value || saving.value)return false;
  saving.value=true;detailError.value='';notice.value='';
  const item=selected.value,agency=props.agencyId;
  try{
    const r=await api.post(`/clinical-notes/contact-documentation/${item.source_type}/${item.source_id}`,{agencyId:agency,purpose:purpose.value,revision:item.revision,reviewedThroughId:item.latest_message_id,complete},{timeout:30000});
    if(agency!==props.agencyId)return true;
    selected.value=r.data;purpose.value=r.data.purpose || '';
    notice.value=complete?(r.data.needsReview?'Saved. A newer reply still needs review.':'Contact documentation completed.'):'Purpose saved.';
    await load();return true;
  }catch(e){detailError.value=e.response?.data?.error?.message || 'Could not save. Your text is still here.';return false;}
  finally{saving.value=false;}
}
async function close(){if(saving.value)return;if(purpose.value!==(selected.value?.purpose || '') && !await save(false))return;selected.value=null;}
watch(()=>props.agencyId,()=>{generation++;items.value=[];selected.value=null;loading.value=false;load();},{immediate:true});
function warnUnsaved(event){if(selected.value && purpose.value!==(selected.value.purpose || '')){event.preventDefault();event.returnValue='';}}
onMounted(()=>{window.addEventListener('beforeunload',warnUnsaved);timer=setInterval(()=>{if(!document.hidden)load();},60000);});
onBeforeUnmount(()=>{window.removeEventListener('beforeunload',warnUnsaved);generation++;clearInterval(timer);});
</script>
<style scoped>
.contact-queue{padding:12px 18px;border:1px solid var(--border,#d9e3e7);border-radius:12px;background:var(--bg,#fff);margin:12px 0}.queue-heading{display:flex;gap:10px;flex-wrap:wrap}.queue-heading .btn{width:auto}.contact-task{display:flex;flex-direction:column;gap:5px;text-align:left;width:100%;padding:12px;margin-top:8px;background:var(--bg,#fff);color:inherit;border:1px solid var(--border,#d9e3e7);border-radius:8px}.contact-overlay{position:fixed;inset:0;background:#0008;z-index:13000;display:flex;justify-content:center;padding:24px}.contact-dialog{background:var(--bg,#fff);color:var(--text-primary,#24332e);width:min(960px,100%);overflow:auto;padding:24px;border-radius:14px}.contact-dialog header{display:flex;justify-content:space-between;align-items:start;gap:16px}.contact-dialog textarea{display:block;width:100%;box-sizing:border-box;margin:10px 0;padding:12px}.contact-message{border-top:1px solid #ccd;padding:16px 0}.contact-message pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.contact-message time{display:block;font-size:.85em}.contact-task span{font-size:.85em}
</style>
