<template>
  <article class="childcare-claim">
    <header><h2>Childcare shift</h2><p>{{ employeeName }}<span v-if="claim.status"> · {{ statusLabel }}</span></p></header>
    <section><h3>Recorded work</h3><p>{{ workDate }}</p><p v-for="(interval,i) in intervals" :key="i">{{ instant(interval.startedAt) }} – {{ instant(interval.endedAt) }}</p><p><strong>{{ hours }} hours</strong> · {{ minutes }} minutes recorded</p></section>
    <section><h3>{{ applied ? 'Applied gross pay' : 'Estimated gross pay' }}</h3><p><strong>{{ money(applied ? claim.applied_amount : snapshot.totalAmount) }}</strong><span v-if="!applied"> · Pending payroll approval</span></p><p v-if="claim.rejection_reason" role="status">Payroll note: {{ claim.rejection_reason }}</p><p v-if="payload.childcareWorkApprovalRequired && !payload.childcareWorkApproved">Employee submission and separate childcare work sign-off are required.</p><ul v-if="snapshot.reasons?.length"><li v-for="reason in snapshot.reasons" :key="reason">{{ reason }}</li></ul>
      <div class="table-wrap"><table v-if="snapshot.segments?.length"><thead><tr><th>Work interval</th><th>Children / working caregivers</th><th>Band</th><th>Hourly rate</th><th>Gross amount</th></tr></thead><tbody><tr v-for="(segment,i) in snapshot.segments" :key="i"><td>{{ instant(segment.startedAt) }} – {{ instant(segment.endedAt) }}</td><td>{{ segment.children ?? 'Needs attendance' }} / {{ segment.caregivers }}</td><td>{{ segment.band ?? 'Review' }}</td><td>{{ money(segment.rate) }}</td><td>{{ money(segment.amount) }}</td></tr></tbody></table></div>
      <p>Each interval uses children divided by caregivers actually clocked in, rounded up. Zero-child required work uses the one-child base rate. Amounts are rounded to cents per interval.</p>
    </section>
    <section><h3>Next step</h3><p>{{ nextStep }}</p><p v-if="claim.created_at">Recorded {{ instant(claim.created_at) }}</p><p>Correct actual time and attendance in the childcare shift. The original punches and claim remain in history.</p></section>
    <details><summary>Record references</summary><p>Claim #{{ claim.id }} · Shift #{{ payload.childcareShiftId }} · Event #{{ payload.companyEventId }}</p></details>
  </article>
</template>
<script setup>
import { computed } from 'vue';
import { parseUtcInstant } from '../../utils/timezones';
import { childcareMoney as money } from '../../utils/childcarePresentation';
const props=defineProps({claim:{type:Object,required:true},employeeName:{type:String,default:''}});
const payload=computed(()=>props.claim.payload||{}),snapshot=computed(()=>payload.value.childcareSnapshot||{});
const zone=computed(()=>payload.value.timezone||'America/Denver');
const instant=value=>{const date=parseUtcInstant(value);return date?date.toLocaleString('en-US',{timeZone:zone.value,timeZoneName:'short',second:'2-digit',minute:'2-digit',hour:'numeric',month:'short',day:'numeric'}):'Not recorded';};
const workDate=computed(()=>String(props.claim.claim_date||'').slice(0,10));
const minutes=computed(()=>Number(snapshot.value.totalMinutes??payload.value.totalMinutes??0).toFixed(2));
const hours=computed(()=>(Number(minutes.value)/60).toFixed(2));
const applied=computed(()=>['approved','paid'].includes(String(props.claim.status).toLowerCase())&&props.claim.applied_amount!=null);
const statusLabel=computed(()=>({submitted:'Awaiting payroll review',deferred:'Review required',rejected:'Needs changes',approved:'Approved',paid:'Paid'}[String(props.claim.status).toLowerCase()]||props.claim.status));
const nextStep=computed(()=>applied.value?'Review the approved amount in your pay statement.':snapshot.value.reviewRequired?'A childcare manager must resolve the listed attendance, staffing or rate issue before payroll approval.':payload.value.childcareWorkApprovalRequired&&!payload.value.childcareWorkApproved?'Review and submit your actual work in Childcare, then wait for the assigned reviewer’s separate sign-off.':'Payroll will review this submitted calculation.');
const intervals=computed(()=>{const rows=snapshot.value.segments||[];return rows.length?rows:[{startedAt:payload.value.clockInAt,endedAt:payload.value.clockOutAt}];});
</script>
<style scoped>
.childcare-claim{padding:20px;line-height:1.5;color:var(--text-primary,#183a35)}header{border-bottom:1px solid #d5e4e0}h2,h3{margin:.4rem 0}section{padding:12px 0;border-bottom:1px solid #d5e4e0}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.875rem}th,td{text-align:left;padding:8px;border-bottom:1px solid #d5e4e0}details{margin-top:12px}p{overflow-wrap:anywhere}
</style>
