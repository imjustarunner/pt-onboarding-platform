<template>
  <section class="exchange-audit">
    <h3>Matching and delivery audit</h3>
    <button type="button" @click="load" :disabled="loading">{{ loading ? 'Loading…' : 'Refresh audit' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="receipt" role="status">{{ receipt }}</p>
    <template v-if="audit">
      <p>{{ matched.length }} {{ audit.matchesEvaluatedAt ? 'currently matched' : 'matched at last evaluation' }} · {{ unmatched.length }} not matched or needing review</p>
      <p>{{ audit.views?.total || 0 }} detail views · {{ audit.views?.unique_viewers || 0 }} unique viewers since {{ audit.trackingStartedAt ? new Date(audit.trackingStartedAt).toLocaleString() : 'tracking began' }}. Earlier views were not tracked.</p>
      <p v-if="audit.matchesEvaluatedAt">Matching checked {{ new Date(audit.matchesEvaluatedAt).toLocaleString() }}. Refresh checks current settings and does not send notifications.</p>
      <p v-if="!audit.run">No delivery evaluation has been recorded yet.</p>
      <p v-else-if="!audit.run.evaluated_at">Matching notifications are queued.</p>
      <p v-else>Notification evaluation {{ new Date(audit.run.evaluated_at).toLocaleString() }}<span v-if="audit.run.error_code"> · Some results need review.</span></p>
      <p>Sent means accepted by the sending service, not proof of reading. Delivery receipts describe the original notification attempts; current matches can differ. Unverified availability needs confirmation before care begins.</p>
      <ExchangeParameterSummary :providers="audit.providers" />
      <p v-if="audit.canReview">Staff can waive fit differences for this client and provider. Insurance and account requirements cannot be waived. Waivers do not send notifications.</p>
      <details v-for="group in [{title:'Matched providers',rows:matched},{title:'Providers not matched / needing review',rows:unmatched}]" :key="group.title">
        <summary>{{ group.title }} ({{ group.rows.length }})</summary>
        <article v-for="provider in group.rows" :key="provider.userId">
          <strong>{{ provider.name }}</strong>
          <ExchangeMatchStatus v-if="provider.canRequest !== undefined" :fit="provider" compact />
          <div v-for="check in provider.checks" :key="check.field" class="match-check" :class="check.status">
            <p><strong>{{ check.label || exchangeCheckLabel(check.field) }} · {{ check.waiver ? 'Pass (staff waiver)' : check.status === 'unknown' ? 'Needs review' : check.status }}</strong></p>
            <p>{{ check.reason }}</p>
            <p v-if="check.waiver">Waived by {{ check.waiver.waivedByName }} on {{ date(check.waiver.createdAt) }}: {{ check.waiver.reason }}</p>
            <button v-if="audit.canReview && check.canWaive" type="button" :disabled="saving" @click="startWaiver(provider, check)">Waive this {{ check.status === 'fail' ? 'failure' : 'review item' }}</button>
            <button v-if="audit.canReview && check.waiver" type="button" :disabled="saving" @click="revoke(provider, check)">Remove waiver</button>
            <form v-if="waiver?.providerUserId === provider.userId && waiver.field === check.field" @submit.prevent="saveWaiver">
              <label>Reason for this client and provider<textarea v-model="waiver.reason" required maxlength="1000" rows="2" /></label>
              <button type="submit" :disabled="saving || !waiver.reason.trim()">Save waiver</button>
              <button type="button" :disabled="saving" @click="waiver = null">Cancel</button>
            </form>
          </div>
          <button v-if="audit.canReview && !provider.checks?.some(c => ['account','assigned','direct_referral'].includes(c.field) && c.status === 'fail')" type="button" :disabled="saving" @click="previewShare(provider)">{{ shareCount(provider.userId) ? 'Share with provider again' : 'Share with provider' }}</button>
          <section v-if="share?.providerUserId === provider.userId" class="share-preview" aria-label="Share email preview">
            <h4>Email to {{ share.to }}</h4>
            <strong>{{ share.subject }}</strong>
            <p>This is a personal share from support. Match and insurance checks still apply.</p>
            <pre>{{ share.text }}</pre>
            <button type="button" :disabled="saving" @click="sendShare">{{ saving ? 'Sending…' : 'Send email with my signature' }}</button>
            <button type="button" :disabled="saving" @click="share = null">Cancel</button>
          </section>
          <p>Email: {{ delivery(provider.emailDelivery) }}</p>
          <p>Text: {{ delivery(provider.smsDelivery) }}</p>
          <p>{{ provider.views }} detail views</p>
        </article>
      </details>
      <details v-if="audit.waivers?.length"><summary>Staff waiver history</summary>
        <p v-for="entry in audit.waivers" :key="entry.id">{{ providerName(entry.providerUserId) }} · {{ exchangeCheckLabel(entry.field) }}: {{ entry.reason }} — {{ entry.waivedByName }}, {{ date(entry.createdAt) }}. {{ entry.revokedAt ? `Removed by ${entry.revokedByName} on ${date(entry.revokedAt)}` : waiverIsApplied(entry.id) ? 'Applied to current checks.' : 'Not applied to current checks; matching inputs may have changed.' }}</p>
      </details>
      <details v-if="audit.shares?.length"><summary>Support sharing history ({{ audit.shares.length }})</summary>
        <p v-for="entry in audit.shares" :key="entry.id">{{ entry.providerName }} · shared by {{ entry.sharedByName }} on {{ date(entry.createdAt) }} · Email: {{ entry.status }}<span v-if="entry.delivery?.reason"> — {{ entry.delivery.reason }}</span></p>
      </details>
      <details><summary>All recorded viewers</summary><p v-for="viewer in audit.viewers" :key="viewer.user_id">{{ viewer.first_name }} {{ viewer.last_name }}: {{ viewer.view_count }} views</p></details>
    </template>
  </section>
</template>
<script setup>
import ExchangeParameterSummary from './ExchangeParameterSummary.vue';
import { exchangeCheckLabel } from '../../navigation/clientExchangePolicy.js';
import ExchangeMatchStatus from './ExchangeMatchStatus.vue';
import {ref,computed,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({listingId:{type:Number,required:true}});
const emit = defineEmits(['changed']);
const audit=ref(null),error=ref(''),loading=ref(false),saving=ref(false),receipt=ref(''),waiver=ref(null),share=ref(null);
const matched=computed(()=>(audit.value?.providers||[]).filter(p=>p.matched));
const unmatched=computed(()=>(audit.value?.providers||[]).filter(p=>!p.matched));
const delivery=value=>value?`${value.status}${value.reason?` — ${value.reason}`:''}`:'Not attempted / no historical receipt';
let version=0, actionVersion=0;
async function load(){const token=++version;loading.value=true;error.value='';try{const {data}=await api.get(`/client-exchange/listings/${props.listingId}/audit`);if(token===version)audit.value=data;}catch(e){if(token===version)error.value=e?.response?.data?.error?.message||'Could not load audit';}finally{if(token===version)loading.value=false;}}
watch(()=>props.listingId,()=>{actionVersion++;audit.value=null;waiver.value=null;share.value=null;receipt.value='';saving.value=false;load();},{immediate:true});
const date = value => value ? new Date(value).toLocaleString() : 'not recorded';
const providerName = id => audit.value?.providers?.find(p => Number(p.userId) === Number(id))?.name || `Provider #${id}`;
const waiverIsApplied = id => audit.value?.providers?.some(p => p.checks?.some(c => Number(c.waiver?.id) === Number(id)));
const shareCount = id => audit.value?.shares?.filter(s => Number(s.providerUserId) === Number(id) && ['sent','queued','sending','unknown','redirected'].includes(s.status)).length || 0;
function startWaiver(provider, check) { share.value=null; waiver.value={providerUserId:provider.userId,field:check.field,fingerprint:check.fingerprint,reason:''}; }
async function perform(path, body, completed) {
  if (saving.value) return;
  const listingId=props.listingId, token=++actionVersion; saving.value=true; error.value=''; receipt.value='';
  try {
    const { data }=await api.post(`/client-exchange/listings/${listingId}/${path}`,body);
    if (props.listingId!==listingId || token!==actionVersion) return;
    await completed(data); if(path !== 'shares/preview') emit('changed');
  } catch(e) { if(props.listingId===listingId && token===actionVersion) error.value=e?.response?.data?.error?.message||'Could not save this action. Please try again.'; }
  finally { if(props.listingId===listingId && token===actionVersion) saving.value=false; }
}
async function saveWaiver() { await perform('waivers', {...waiver.value}, async()=>{waiver.value=null;receipt.value='Waiver saved for this client and provider.';await load();}); }
async function revoke(provider,check) { await perform('waivers', {providerUserId:provider.userId,revokeId:check.waiver.id}, async()=>{receipt.value='Waiver removed.';await load();}); }
async function previewShare(provider) {
  waiver.value=null; share.value=null;
  await perform('shares/preview',{providerUserId:provider.userId},async data=>{share.value={...data,requestKey:crypto.randomUUID()};});
}
async function sendShare() {
  const input={providerUserId:share.value.providerUserId,requestKey:share.value.requestKey,expectedShareCount:share.value.previousShareCount};
  await perform('shares',input,async data=>{
    const status=data.share?.status;
    receipt.value=status==='sent'?'Shared: the email service accepted the message.':status==='queued'?'The share email is queued for delivery.':`Share email status: ${status || 'unknown'}. ${data.share?.delivery?.reason || 'Review delivery records before trying again.'}`;
    share.value=null;await load();
  });
}

</script>
<style scoped>
.match-check{padding:8px 10px;margin:8px 0;border-left:3px solid #94a3b8;color:#334155}.match-check.fail{border-color:#d97706;background:#fffbeb}.match-check.pass{border-color:#659b7c}.match-check.unknown{background:#f8fafc}.match-check form{margin-top:8px}textarea{display:block;width:100%;box-sizing:border-box}button{cursor:pointer;margin:4px 8px 4px 0}button:disabled{cursor:wait;opacity:.6}.share-preview{background:#f8fafc;color:#263544;border:1px solid #cbd5e1;padding:14px;margin:12px 0}.share-preview pre{white-space:pre-wrap;font:inherit;max-height:420px;overflow:auto}.exchange-audit{border-top:1px solid var(--border,#ddd);padding:16px;font-size:13px} details{margin-top:12px}summary{cursor:pointer;font-weight:600}article{border-bottom:1px solid var(--border,#ddd);padding:12px 0}p{margin:6px 0}
</style>
