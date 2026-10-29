<template>
<section class="ft-time" v-if="context?.effective || context?.adminRate">
 <div v-if="!claim" class="ft-time-actions"><button v-if="context.adminRate && !context.adminActivitiesRequired" class="admin" @click="mode='admin_duties'">Administrative duties · {{ money(context.adminRate) }}/hour</button><button v-if="context.effective" @click="mode='indirect_service'">Direct Care indirect-time calculator</button></div>
 <div v-if="mode" class="ft-time-form" :class="{admin:mode==='admin_duties'}">
 <header><img src="/assets/fundthred/icon.svg" alt="FundThred" /><h3>{{ mode==='admin_duties'?'Administrative duties':'Extra indirect time' }}</h3><button @click="claim ? emit('close') : mode=''" aria-label="Close time entry">×</button></header>
 <p v-if="mode==='admin_duties'">Describe your work and the assignment it supports. Payroll reviews this at your assigned admin rate. Do not include time already covered by a recurring payment.</p>
 <p v-else>For services covered by your new agreement, {{ context.indirectMinutesPerHour }} minutes of indirect pay per direct-care hour will be added when the billing report is processed. Enter the total indirect time you actually spent; only the excess below is submitted.</p>
 <form @submit.prevent="submit">
 <label>Service date<input type="date" v-model="date" required :min="mode==='indirect_service'?context.startsOn:undefined" /></label>
 <template v-if="mode==='indirect_service'">
  <label>Service code<select v-model="code"><option v-for="c in hcodes" :value="c.code" :key="c.code">{{ c.code }} — {{ c.quantityLabel }}</option></select></label>
  <label>{{ selected?.basis==='minutes'?'Documented direct-service minutes':'Verified billed units' }}<input type="number" min="0" step="0.01" v-model.number="units" required /></label>
  <label>Actual total indirect minutes<input type="number" min="0" step="0.01" v-model.number="actual" required /></label>
  <output>Included automatically: <strong>{{ num(included) }} min</strong> · Extra time to submit: <strong>{{ num(excess) }} min</strong></output>
 </template>
 <label v-else>Minutes worked<input type="number" min="1" max="1440" step="1" v-model.number="minutes" required /></label>
 <label>What did you do?<textarea v-model="description" required minlength="5" /></label>
 <label>What assignment or purpose was this for?<input v-model="purpose" required minlength="3" /></label>
 <label v-if="claim">Reason for this edit<textarea v-model="editReason" required minlength="5" /></label>
 <label class="attest"><input type="checkbox" v-model="attested" required /> This is accurate work time and excludes time already paid or included automatically.</label>
 <p v-if="error" role="alert">{{ error }}</p><p v-if="success" role="status">{{ success }}</p>
 <button :disabled="saving || (mode==='indirect_service' && excess<=0)">{{ saving?'Submitting…':'Submit for payroll approval' }}</button>
 </form>
 </div>
</section>
</template>
<script setup>
import {ref,computed,watch} from 'vue';import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],context:Object,claim:Object,codes:{type:Array,default:()=>[]}});const emit=defineEmits(['submitted','close']);
const editReason=ref('');
const mode=ref(''),code=ref('H0004'),units=ref(20),actual=ref(0),minutes=ref(15),description=ref(''),purpose=ref(''),attested=ref(false),saving=ref(false),error=ref(''),success=ref('');
const date=ref(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
const hcodes=computed(()=>props.codes.filter(c=>c.group==='direct_care'&&!c.restricted)),selected=computed(()=>hcodes.value.find(c=>c.code===code.value));
const included=computed(()=>Math.max(0,Number(units.value)||0)*Number(selected.value?.creditValue||0)*Number(props.context?.indirectMinutesPerHour||0));
const excess=computed(()=>Math.round(Math.max(0,Number(actual.value||0)-included.value)*100)/100);
const num=n=>Number(n).toFixed(2).replace(/\.00$/,''),money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
watch(()=>props.claim,c=>{if(!c)return;const p=c.payload||{};mode.value=p.categoryGroup;date.value=String(c.claim_date).slice(0,10);description.value=p.description||'';purpose.value=p.purpose||'';minutes.value=p.totalMinutes||15;code.value=p.excessIndirect?.code||'H0004';units.value=p.excessIndirect?.units||0;actual.value=p.excessIndirect?.actualMinutes||0;attested.value=false;editReason.value='';},{immediate:true});
async function submit(){error.value='';success.value='';saving.value=true;try{const total=mode.value==='indirect_service'?excess.value:Number(minutes.value);await api.request({method:props.claim?'patch':'post',url:props.claim?`/payroll/me/time-claims/${props.claim.id}`:'/payroll/me/time-claims',data:{editReason:editReason.value,agencyId:props.agencyId,claimType:'indirect_time',claimDate:date.value,payload:{categoryGroup:mode.value,description:description.value,purpose:purpose.value,attestation:attested.value,totalMinutes:total,excludesAutomaticIndirect:true,allocations:[{serviceTypeLabel:mode.value==='admin_duties'?'Administrative duties':'Excess Direct Care indirect time',minutes:total,note:description.value+' — '+purpose.value}],...(mode.value==='indirect_service'?{excessIndirect:{code:code.value,units:units.value,actualMinutes:actual.value}}:{})}}});success.value='Recorded for payroll review. Payment appears after approval and application.';attested.value=false;emit('submitted');if(props.claim)emit('close');}catch(e){error.value=e.response?.data?.error?.message||'Could not submit time';}finally{saving.value=false;}}
</script>
<style scoped>
.ft-time{margin:18px 0;color:#0d203d}.ft-time-actions{display:flex;gap:12px;flex-wrap:wrap}.ft-time button{background:#e5f5ef;color:#075e59;border:1px solid #b9d7cb;border-radius:12px;min-height:44px;padding:12px 18px;font:inherit;font-weight:650;cursor:pointer}.ft-time .admin{background:#fff2e5;border-color:#e7b778;color:#804511}.ft-time-form{padding:22px;border:1px solid #c8ded7;border-radius:18px;background:#f4faf8;margin-top:14px}.ft-time-form header{display:flex;gap:12px;align-items:center}.ft-time-form header img{width:32px}.ft-time-form h3{flex:1;margin:0;color:inherit}.ft-time form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.ft-time label{display:grid;gap:7px;font-size:14px}.ft-time input:not([type=checkbox]),.ft-time select,.ft-time textarea{font:inherit;width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd9df;border-radius:10px;padding:12px;min-height:44px;background:white;color:#0d203d}.ft-time output,.ft-time .attest,.ft-time form p{grid-column:1/-1}.ft-time .attest{display:flex;align-items:flex-start;line-height:1.5}.ft-time p{line-height:1.6}.ft-time output{padding:16px;background:#fff;border-radius:12px}.ft-time button:disabled{opacity:.5;cursor:default}@media(max-width:640px){.ft-time form{grid-template-columns:minmax(0,1fr)}.ft-time-actions button{width:100%}}
</style>
