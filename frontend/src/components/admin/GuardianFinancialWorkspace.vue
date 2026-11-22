<template>
 <section class="guardian-finances" :aria-label="summaryOnly?'Insurance and billing responsibility':'Billing and insurance'">
  <header class="section-heading"><div><p class="eyebrow">Client coverage · Guardian billing</p><h2>{{summaryOnly?'Insurance & billing responsibility':'Billing & insurance'}}</h2><p>Coverage stays with each client. Billing responsibility and payment setup are shown for this guardian.</p></div><button type="button" class="btn btn-secondary" @click="$emit('refresh')">Refresh</button></header>
  <p v-if="loading" role="status">Loading saved insurance and billing records…</p><p v-if="error" role="alert">{{error}}</p>
  <p v-if="!loading && !error && !data?.clients?.length">Link a current client to review insurance and billing.</p>
  <article v-for="client in data?.clients||[]" :key="client.clientId" class="finance-client">
   <header><div><h3>{{client.name}}</h3><p>{{client.agencyName}}</p></div><span class="state-chip" v-if="client.billing.available">{{client.billing.isResponsibleParty?'Responsible billing party':client.billing.payerStatus==='active'?'Assigned payer':'Not designated as responsible party'}}</span></header>
   <div class="finance-columns">
    <section><h4>Insurance coverage</h4><template v-if="client.insurance.state==='recorded'"><p class="muted">{{client.insurance.source==='submitted'?'Submitted policy · review in the client’s chart':'Saved client insurance'}}</p><dl v-for="policy in client.insurance.policies" :key="policy.slot"><dt>{{policy.slot==='primary'?'Primary':'Secondary'}} insurer</dt><dd>{{policy.insurerName||'Carrier not recorded'}}</dd><template v-if="policy.memberLastFour"><dt>Member ID</dt><dd>Ending {{policy.memberLastFour}}</dd></template><template v-if="policy.subscriberName"><dt>Subscriber</dt><dd>{{policy.subscriberName}}</dd></template></dl></template><p v-else-if="client.insurance.state==='missing'">No saved or submitted insurance policy was found for this client.</p><p v-else role="alert">{{client.insurance.message}}</p></section>
    <section><h4>Billing contact & responsibility</h4><template v-if="client.billing.available"><p v-if="client.billing.responsibleParty"><strong>{{client.billing.responsibleParty.contact?.fullName||'Designated account'}}</strong><br>{{client.billing.responsibleParty.contact?.email}}<br>{{client.billing.responsibleParty.contact?.phone}}</p><p v-else>No responsible billing party has been designated.</p><p v-if="client.billing.responsibleParty?.contact?.address">{{client.billing.responsibleParty.contact.address}}, {{client.billing.responsibleParty.contact.city}}, {{client.billing.responsibleParty.contact.state}} {{client.billing.responsibleParty.contact.postalCode}}</p><p><strong>{{money(client.billing.dueCents)}}</strong> · This guardian’s verified amount due</p></template><p v-else>{{client.billing.message}}</p></section>
   </div>
   <button v-if="summaryOnly" type="button" class="btn btn-secondary" @click="$emit('manage')">Manage billing & insurance</button>
   <template v-else>
    <details v-if="canEdit && !['restricted','unavailable'].includes(client.insurance.state)"><summary>Review or update client insurance</summary><ClientInsuranceEditor :client-id="client.clientId" :agency-id="client.agencyId" account-support :show-related-reviews="false" @saved="$emit('refresh')" /></details>
    <details v-if="client.billing.available && canEdit"><summary>Manage responsible party & billing address</summary><ResponsibleBillingParty staff :client-id="client.clientId" :agency-id="client.agencyId" @saved="$emit('refresh')" /></details>
    <section v-if="client.billing.available" class="statement-actions"><h4>Saved payment methods</h4><p v-if="client.billing.paymentMethodsAvailable===false">Saved payment methods could not be loaded.</p><p v-else-if="!client.billing.paymentMethods?.length">No saved payment method is recorded for this guardian in this organization.</p><p v-for="(method,index) in client.billing.paymentMethods||[]" :key="index"><strong>{{method.brand}} ending {{method.lastFour}}</strong><span v-if="method.expiryMonth"> · Expires {{method.expiryMonth}}/{{method.expiryYear}}</span> · {{method.verificationRequired?'Needs verification':method.assignedToClient?'Assigned to this client':'Saved for this guardian'}}</p></section>
    <section v-if="client.billing.available" class="statement-actions"><h4>Statements & secure payment setup</h4><p>Prepare a preview for <strong>{{guardian.email}}</strong> concerning <strong>{{client.name}}</strong>. Sending is a separate action.</p><div class="action-row"><button class="btn btn-secondary" :disabled="busy || !client.billing.assignedBalances || !canEdit" @click="prepare(client,'statement')">Prepare statement</button><button class="btn btn-secondary" :disabled="busy || !canEdit" @click="prepare(client,'payment_setup')">Prepare secure payment setup</button></div><p class="muted">Payment details are entered by the guardian in the secure portal. This page does not collect card numbers.</p></section>
   </template>
  </article>
  <section v-if="preview" class="notice-review"><h3>Review before sending</h3><p>To: <strong>{{guardian.email}}</strong> · {{preview.clientName}}</p><iframe v-if="previewUrl" :src="previewUrl" title="Billing notice preview" /><div class="action-row"><button class="btn btn-primary" :disabled="busy || !previewUrl || !canEdit" @click="send">Send to this guardian</button><button class="btn btn-secondary" :disabled="busy" @click="clearPreview">Close preview</button></div></section>
  <p v-if="actionError" role="alert">{{actionError}}</p><p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import ClientInsuranceEditor from '../billing/ClientInsuranceEditor.vue';
import ResponsibleBillingParty from '../billing/ResponsibleBillingParty.vue';
const props=defineProps({guardian:{type:Object,required:true},data:Object,loading:Boolean,error:String,summaryOnly:Boolean,canEdit:Boolean});
defineEmits(['refresh','manage']);
const preview=ref(null),previewUrl=ref(''),busy=ref(false),actionError=ref(''),notice=ref('');let generation=0;
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0)/100);
function clearPreview(){if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value='';preview.value=null;}
async function prepare(client,kind){
 if(busy.value||!props.canEdit)return;const own=generation;busy.value=true;actionError.value='';notice.value='';clearPreview();
 try{
  const path=kind==='statement'?'/family-billing/staff/notices':'/family-billing/staff/tasks';
  const payload=kind==='statement'?{agencyId:client.agencyId,payerUserId:Number(props.guardian.id),clientId:client.clientId,kind:'statement',idempotencyKey:crypto.randomUUID()}:{agencyId:client.agencyId,guardianUserId:Number(props.guardian.id),clientIds:[client.clientId],requireCard:false};
  const {data}=await api.post(path,payload,{skipGlobalLoading:true});if(own!==generation)return;
  const pdf=await api.get(`/family-billing/staff/notices/${data.noticeId}.pdf`,{skipGlobalLoading:true,params:{agencyId:client.agencyId},responseType:'blob'});if(own!==generation)return;
  preview.value={noticeId:data.noticeId,agencyId:client.agencyId,clientName:client.name};previewUrl.value=URL.createObjectURL(pdf.data);
 }catch(e){if(own===generation)actionError.value=e.response?.data?.error?.message||'The billing preview could not be prepared.';}
 finally{if(own===generation)busy.value=false;}
}
async function send(){if(busy.value||!preview.value||!props.canEdit)return;const own=generation;busy.value=true;actionError.value='';try{const {data}=await api.post(`/family-billing/staff/notices/${preview.value.noticeId}/send`,{agencyId:preview.value.agencyId},{skipGlobalLoading:true});if(own!==generation)return;notice.value=data.skipped||data.blocked?'Delivery is held by the guardian’s email preferences.':data.queued||data.pendingApproval?'Queued for delivery review.':'Submitted for delivery to this guardian.';clearPreview();}catch(e){if(own===generation)actionError.value=e.response?.data?.error?.message||'Delivery could not be completed.';}finally{if(own===generation)busy.value=false;}}
watch(()=>props.guardian.id,()=>{generation++;clearPreview();busy.value=false;actionError.value='';notice.value='';});
onBeforeUnmount(()=>{generation++;clearPreview();});
</script>
<style scoped>
.guardian-finances{width:100%;min-width:0;color:var(--guardian-ink,#20354f)}.section-heading,.finance-client>header{display:flex;align-items:start;justify-content:space-between;gap:16px;flex-wrap:wrap}.section-heading h2,.finance-client h3{margin:4px 0 8px}.eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#65778b}.finance-client{background:var(--bg-card,#fff);border:1px solid var(--border,#dbe4ed);border-radius:16px;padding:24px;margin:18px 0}.finance-client p{line-height:1.6;overflow-wrap:anywhere}.finance-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:20px 0}.finance-columns h4,.statement-actions h4{margin:0 0 12px}.finance-columns dl{display:grid;grid-template-columns:minmax(90px,120px) 1fr;gap:8px;font-size:14px}.finance-columns dt{color:#64748b}.finance-columns dd{margin:0;overflow-wrap:anywhere}.state-chip{background:#e9f3ee;color:#285749;border-radius:20px;padding:7px 12px;font-size:12px}.finance-client details{border-top:1px solid #e4ebf1;padding:16px 0}.finance-client summary{cursor:pointer;font-weight:600}.statement-actions{border-top:1px solid #e4ebf1;padding-top:18px}.action-row{display:flex;gap:10px;flex-wrap:wrap}.notice-review{padding:22px;border:1px solid #bdcfdc;border-radius:16px;background:var(--bg-card,#fff)}.notice-review iframe{width:100%;height:480px;border:1px solid #dbe4ed;border-radius:10px;margin:12px 0}.muted{font-size:13px;color:#64748b}[role=alert]{color:#a32727}@media(max-width:700px){.finance-columns{grid-template-columns:1fr}.finance-client{padding:18px}}
</style>
