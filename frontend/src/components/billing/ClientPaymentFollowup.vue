<template>
  <section class="payment-followup" :aria-busy="busy">
    <h3>Payment setup</h3>
    <button type="button" class="btn btn-secondary" :disabled="busy || !!pendingRequest" @click="review">Review payment request</button>
    <p v-if="busy && !pendingRequest" role="status">Loading payment request…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="preview">
      <p>{{ preview.summary?.medicaid ? 'Medicaid: a payment method is not required.' : 'Medicaid: not applicable for this client.' }}</p>
      <template v-if="!preview.summary?.medicaid">
        <p>From and reply to: {{ preview.from || 'Billing sender needs setup' }}</p>
        <p>This request asks the responsible payer to complete secure payment setup and sends the assigned provider a QR code to share.</p>
        <ul><li v-for="recipient in preview.recipients || []" :key="`${recipient.kind}:${recipient.userId}`">{{ recipient.kind === 'family' ? 'Responsible payer' : 'Provider' }}: {{ recipient.name }} · {{ recipient.email || 'Email missing' }}</li></ul>
      </template>
      <ul v-if="preview.blockers?.length"><li v-for="blocker in preview.blockers" :key="blocker">{{ blocker }}</li></ul>
      <button v-if="preview.ready && !preview.summary?.medicaid && !pendingRequest" type="button" class="btn btn-primary" :disabled="busy || !!result" @click="send">Send payment setup request</button>
    </div>
    <div v-if="pendingRequest">
      <p>A payment request is being checked. Retrieve its saved result before starting another request.</p>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="send">{{ busy ? 'Checking request…' : 'Retrieve saved request result' }}</button>
    </div>
    <div v-if="result" role="status">
      <p>Payment request #{{ result.id }} · {{ result.status }}</p>
      <ul><li v-for="delivery in result.deliveries || []" :key="`${delivery.kind}:${delivery.userId}`">{{ recipientName(delivery) }}: {{ statusText(delivery.status) }}</li></ul>
      <p v-if="result.deliveries?.some(delivery=>delivery.status!=='sent')">Some messages were not confirmed sent. Review their communication records before sending another request.</p>
    </div>
  </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:[Number,String],required:true}});
const preview=ref(null),result=ref(null),error=ref(''),busy=ref(false),pendingRequest=ref(null);
let sequence=0,requestKey=null;
const storageKey=clientId=>`payment-setup-pending:${Number(clientId)}`;
function persistPending(clientId,pending){try{if(pending)sessionStorage.setItem(storageKey(clientId),JSON.stringify(pending));else sessionStorage.removeItem(storageKey(clientId));}catch{/* A request can still be safely retried in this open page. */}}
function readPending(clientId){try{const saved=JSON.parse(sessionStorage.getItem(storageKey(clientId))||'null');return saved&&/^[a-zA-Z0-9_-]{16,100}$/.test(saved.requestKey)&&typeof saved.reviewHash==='string'?saved:null;}catch{return null;}}
watch(()=>props.clientId,()=>{sequence++;preview.value=null;result.value=null;error.value='';busy.value=false;requestKey=null;pendingRequest.value=readPending(props.clientId);},{immediate:true});
async function review(){
  if(busy.value||pendingRequest.value)return;
  const current=++sequence,clientId=props.clientId;busy.value=true;error.value='';preview.value=null;result.value=null;
  try{const {data}=await api.get(`/clients/${clientId}/payment-setup-followup`,{skipGlobalLoading:true});if(current===sequence){preview.value=data;requestKey=crypto.randomUUID();}}
  catch(e){if(current===sequence)error.value=e.response?.data?.error?.message||'Could not review payment setup.';}
  finally{if(current===sequence)busy.value=false;}
}
async function send(){
  if(busy.value||(!pendingRequest.value&&(!preview.value?.ready||preview.value.summary?.medicaid||result.value||!requestKey)))return;
  const current=++sequence,clientId=props.clientId,pending=pendingRequest.value||{requestKey,reviewHash:preview.value.reviewHash};
  pendingRequest.value=pending;persistPending(clientId,pending);busy.value=true;error.value='';
  try{
    const {data}=await api.post(`/clients/${clientId}/payment-setup-followup`,pending,{skipGlobalLoading:true});
    if(data.status==='completed')persistPending(clientId,null);
    if(current!==sequence)return;
    result.value=data;
    if(data.status==='completed')pendingRequest.value=null;
  }catch(e){
    if(current!==sequence)return;
    const message=e.response?.data?.error?.message;
    // A changed preview is rejected before any send. Other outcomes retain the same
    // key, including reloads, so checking an uncertain result cannot duplicate email.
    if(e.response?.data?.error?.code==='PAYMENT_SETUP_REVIEW_REQUIRED'||(e.response?.status===409&&message==='Recipients or payment setup changed. Review the request again.')){
      persistPending(clientId,null);pendingRequest.value=null;preview.value=null;requestKey=null;error.value=message;
    }else error.value=message||'The request outcome is unknown. Retrieve this same request’s saved result before sending another request.';
  }finally{if(current===sequence)busy.value=false;}
}
function recipientName(delivery){return preview.value?.recipients?.find(recipient=>recipient.userId===delivery.userId&&recipient.kind===delivery.kind)?.name||(delivery.kind==='family'?'Responsible payer':'Provider');}
function statusText(status){return {sent:'Email sent',held:'Held',unknown:'Delivery unknown',queued:'Queued',test_redirected:'Redirected to test mailbox',sending:'In progress'}[status]||status;}
onBeforeUnmount(()=>sequence++);
</script>
<style scoped>.payment-followup{border:1px solid var(--border,#d8e2eb);border-radius:12px;padding:18px;margin:16px 0}.payment-followup li{margin:6px 0;overflow-wrap:anywhere}.payment-followup button{margin:6px 8px 6px 0}[role=alert]{color:#b42318}</style>
