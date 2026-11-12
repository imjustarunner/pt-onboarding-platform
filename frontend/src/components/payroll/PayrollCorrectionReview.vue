<template>
  <Teleport to="body">
    <div class="pcr-backdrop" @click.self="!posting && $emit('close')" @keydown.esc="!posting && $emit('close')">
      <section ref="dialog" class="pcr-dialog" role="dialog" aria-modal="true" aria-labelledby="correction-title" tabindex="-1">
        <header><h2 id="correction-title">Review payroll correction</h2><button type="button" class="btn btn-secondary" :disabled="posting" @click="$emit('close')">Close</button></header>
        <p v-if="loading" role="status">Checking the original posted payroll…</p>
        <p v-if="error" role="alert" class="pcr-error">{{ error }}</p>
        <template v-if="review">
          <p><strong>{{ review.provider }}</strong> · {{ review.client }} · {{ review.serviceDate }}</p>
          <p>Original payroll: <strong>{{ review.original.periodStart || 'Unconfirmed' }} → {{ review.original.periodEnd || 'Unconfirmed' }}</strong><br />
            Posted: {{ review.original.postedAt ? formatTimestamp(review.original.postedAt) : review.original.proof ? 'Posted; timestamp unavailable' : 'Original payment not confirmed' }}</p>
          <table><thead><tr><th></th><th>Previously paid</th><th>Corrected session</th></tr></thead><tbody>
            <tr><th>Service code</th><td>{{ review.original.code }}</td><td>{{ review.corrected.code || 'Removed' }}</td></tr>
            <tr><th>Units</th><td>{{ review.original.units }}</td><td>{{ review.corrected.units }}</td></tr>
            <tr><th>Pay credits / hours</th><td>{{ review.original.credits ?? 'Not confirmed' }}</td><td>{{ review.corrected.credits ?? 'Not confirmed' }}</td></tr>
            <tr><th>Pay rate</th><td>{{ money(review.original.rate) }}</td><td>{{ money(review.corrected.rate) }}</td></tr>
            <tr><th>Note status</th><td>{{ review.original.noteStatus }}</td><td>{{ review.corrected.noteStatus }}</td></tr>
            <tr><th>Service pay</th><td>{{ money(review.original.baseAmount) }}</td><td>{{ money(review.corrected.baseAmount) }}</td></tr>
            <tr><th>Automatic indirect pay</th><td>{{ money(review.original.autoIndirectAmount) }}</td><td>{{ money(review.corrected.autoIndirectAmount) }}</td></tr>
            <tr><th>Total</th><td>{{ money(review.original.total) }}</td><td>{{ money(review.corrected.total) }}</td></tr>
          </tbody></table>
          <p v-if="review.reductionAmount > 0" class="pcr-total">Overpayment: <strong>{{ money(review.reductionAmount) }}</strong><br />Current-period reduction: <strong>{{ money(-review.reductionAmount) }}</strong></p>
          <p v-if="review.additionalPayAmount > 0" class="pcr-total">Underpayment: <strong>{{ money(review.additionalPayAmount) }}</strong><br />Current-period additional pay: <strong>{{ money(review.adjustmentAmount) }}</strong></p>
          <p>{{ review.calculationBasis }}</p>
          <p v-if="review.canPostAdjustment">Post this difference as its own adjustment line in the current payroll. The original session, payroll period, and calculation will remain attached to that line.</p>
          <ul v-if="review.blockers?.length"><li v-for="message in review.blockers" :key="message">{{ message }}</li></ul>
          <p v-if="review.existingAdjustment" role="status">Adjustment already posted to payroll ending {{ String(review.existingAdjustment.period_end).slice(0,10) }}.</p>
          <footer><button type="button" class="btn btn-secondary" :disabled="posting || loading" @click="load">Refresh review</button><button v-if="!review.existingAdjustment && review.adjustmentType !== 'none'" type="button" class="btn btn-primary" :disabled="posting || loading || !review.canPostAdjustment" @click="postAdjustment">{{ posting ? 'Posting adjustment…' : review.adjustmentType === 'additional_pay' ? 'Post additional pay' : 'Post reduction' }}</button></footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, onMounted, nextTick } from 'vue';
import api from '../../services/api';
const props=defineProps({destinationPeriodId:{type:Number,required:true},sourcePeriodId:{type:Number,required:true},baselineRowId:{type:Number,default:null},compareRowId:{type:Number,default:null}});
const emit=defineEmits(['close','posted']);
const loading=ref(false),posting=ref(false),error=ref(''),review=ref(null),dialog=ref(null);
const args=()=>({sourcePayrollPeriodId:props.sourcePeriodId,baselineRowId:props.baselineRowId,...(props.compareRowId?{compareRowId:props.compareRowId}:{})});
const money=v=>v==null?'Not confirmed':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
const formatTimestamp=v=>new Date(v).toLocaleString('en-US',{timeZone:'America/Denver'});
const load=async()=>{loading.value=true;error.value='';try{review.value=(await api.get(`/payroll/periods/${props.destinationPeriodId}/correction-review`,{params:args()})).data;}catch(e){error.value=e?.response?.data?.error?.message||e.message||'Unable to load the correction.';}finally{loading.value=false;}};
const postAdjustment=async()=>{if(posting.value||!review.value?.canPostAdjustment)return;posting.value=true;error.value='';try{const{data}=await api.post(`/payroll/periods/${props.destinationPeriodId}/correction-review/${review.value.adjustmentType === 'additional_pay' ? 'additional-pay' : 'reduction'}`,{...args(),reviewToken:review.value.reviewToken});if(!data.adjustmentId)throw new Error('The server did not confirm a saved adjustment. Refresh the review.');emit('posted',data);}catch(e){error.value=e?.response?.data?.error?.message||e.message||'The adjustment could not be posted.';review.value.canPostAdjustment=false;}finally{posting.value=false;}};
onMounted(async()=>{await nextTick();dialog.value?.focus();await load();});
</script>
<style scoped>
.pcr-backdrop{position:fixed;inset:0;z-index:12000;background:#0007;display:flex;align-items:center;justify-content:center;padding:20px}.pcr-dialog{background:var(--surface,#fff);color:var(--text-primary,#173a44);border-radius:14px;padding:24px;width:min(780px,100%);max-height:90vh;overflow:auto}.pcr-dialog header,.pcr-dialog footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.pcr-dialog h2{margin:0}.pcr-dialog table{border-collapse:collapse;width:100%;margin:16px 0}.pcr-dialog th,.pcr-dialog td{padding:10px;border-bottom:1px solid var(--border,#dce6e8);text-align:left}.pcr-total{padding:14px;background:#fff4e5;border-radius:8px}.pcr-error{color:#b42318}.pcr-dialog p{line-height:1.5}.pcr-dialog footer{justify-content:flex-end;margin-top:18px}
</style>
