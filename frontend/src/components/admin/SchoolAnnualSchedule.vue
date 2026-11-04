<template>
  <section class="annual-schedule">
    <h3>Annual collection schedule</h3>
    <p>Returning schools update their information each year. New schools complete onboarding during their first school year.</p>
    <p v-if="automationHeld" role="status">Automatic annual emails are on hold. Saved dates and school follow-up records remain available. Saving this schedule does not release held email delivery.</p>
    <form @submit.prevent="save">
      <label><input v-model="draft.enabled" type="checkbox"> Enable the agency’s annual email schedule after delivery is released</label>
      <div class="annual-schedule__dates">
        <label>Opens<input v-model="opens" type="date" required></label>
        <label>Submission deadline<input v-model="due" type="date" required></label>
        <label>Follow-up ends<input v-model="followup" type="date" required></label>
        <label>Time zone<input v-model="draft.timezone" required></label>
      </div>
      <p>These month/day dates repeat annually. Schools receive an opening invitation and three reminders. Missing information gets two follow-up reminders. Reports go to agency administrators and Support at both deadlines.</p>
      <p>From, Reply-To, and the copy on school emails use the agency’s Schools mailbox. Submitted schools stop receiving reminders.</p>
      <button class="btn btn-primary btn-sm" :disabled="busy">{{ busy ? 'Saving…' : 'Save annual schedule' }}</button>
      <span v-if="message" role="status"> {{ message }}</span>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <p v-if="schedule">Current phase: <strong>{{ schedule.phase }}</strong> · {{ schedule.opensOn }} to {{ schedule.dueOn }} · follow-up through {{ schedule.followupEndsOn }}.</p>
    <p v-if="deliveries.length">Email delivery: {{ deliverySummary }}. Held or skipped messages need review in Communications.</p>
  </section>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},schoolYear:{type:String,required:true},rules:{type:Object,default:()=>({})},schedule:{type:Object,default:null},deliveries:{type:Array,default:()=>[]},automationHeld:{type:Boolean,default:true}});
const emit=defineEmits(['saved']);
const draft=reactive({enabled:false,timezone:'America/Denver'}),opens=ref(''),due=ref(''),followup=ref(''),busy=ref(false),error=ref(''),message=ref('');
watch(()=>[props.rules,props.schoolYear],()=>{Object.assign(draft,props.rules,{enabled:Boolean(Number(props.rules.enabled))});const year=props.schoolYear.slice(0,4);opens.value=`${year}-${props.rules.opens_md||'08-01'}`;due.value=`${year}-${props.rules.due_md||'08-21'}`;followup.value=`${year}-${props.rules.followup_md||'08-31'}`;},{immediate:true});
const deliverySummary=computed(()=>{const totals={};for(const d of props.deliveries)totals[d.status]=(totals[d.status]||0)+Number(d.count);return Object.entries(totals).map(([status,count])=>`${count} ${status}`).join(', ');});
async function save(){busy.value=true;error.value='';message.value='';try{const year=props.schoolYear.slice(0,4);if([opens.value,due.value,followup.value].some(d=>!d.startsWith(year+'-')))throw new Error('Choose dates within the selected school year’s starting calendar year.');await api.put('/school-reinit/campaign/annual-schedule',{agencyId:props.agencyId,schoolYear:props.schoolYear,enabled:draft.enabled,timezone:draft.timezone,opens_md:opens.value.slice(5),due_md:due.value.slice(5),followup_md:followup.value.slice(5)});message.value='Annual schedule saved.';emit('saved');}catch(e){error.value=e?.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
</script>
<style scoped>
.annual-schedule{padding:18px;border:1px solid var(--border-color,#dce7ec);border-radius:10px;margin:18px 0}.annual-schedule h3{margin-top:0}.annual-schedule p{font-size:14px;line-height:1.5}.annual-schedule__dates{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0}.annual-schedule__dates label{display:grid;gap:6px}.annual-schedule input:not([type=checkbox]){padding:8px;border:1px solid #bbc8d0;border-radius:6px} [role=alert]{color:#a12222}
</style>
