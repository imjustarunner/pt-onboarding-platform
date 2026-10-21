<template>
  <section class="ffs-extra">
    <h3>Clinical FFS · extra documentation time</h3>
    <p>Report required note, treatment-plan, or other service-related work beyond the time included in your clinical services. Payroll reviews the request before payment.</p>
    <DocumentationHubTraining />
    <p v-if="loading" role="status">Loading your agency’s services and pay periods…</p>
    <p v-if="loadError" role="alert">{{ loadError }} <button type="button" @click="load">Retry</button></p>
    <p v-if="options && !options.codes.length">No clinical service codes are configured for this agency. Contact payroll to record this work and confirm the service allowance.</p>
    <form v-if="options?.codes.length && !loading" @submit.prevent="submit">
      <div class="two-cols">
        <label>Pay period<select v-model="form.periodId" required><option value="" disabled>Select a pay period</option><option v-for="p in options.periods" :key="p.id" :value="p.id">{{ p.start }} – {{ p.end }}</option></select></label>
        <label>Last date of the reported work<input type="date" v-model="form.workDate" required :min="period?.start" :max="maxWorkDate" /></label>
      </div>
      <p>Include <strong>all clinical FFS services and their actual work time for this period</strong>, including services that took less time. H-code work uses the separate Direct Care calculator.</p>
      <p class="hint">Enter total minutes for each service code, not minutes per session. For standalone treatment planning without a billed service, choose “No billed service” and explain the assignment. Use your own time records; these totals are not imported from billing. Do not include work already paid or submitted separately.</p>
      <fieldset v-for="(row,i) in form.services" :key="row.key || i" class="service-row">
        <legend>Service {{ i+1 }}</legend>
        <div class="two-cols">
          <label>Service code<select v-model="row.code" required><option value="" disabled>Select service</option><option v-for="c in options.codes" :key="c.code" :value="c.code">{{ c.label || c.code }}</option></select></label>
          <label>{{ row.code==='UNLINKED' ? 'Number of work items' : 'Number of services' }}<input type="number" v-model.number="row.count" min="1" max="1000" step="1" required /></label>
          <label>Total actual direct minutes<input type="number" v-model.number="row.directMinutes" min="0" max="44640" step="0.01" required /></label>
          <label>Total actual indirect minutes<input type="number" v-model.number="row.indirectMinutes" min="0" max="44640" step="0.01" required /><small>Notes, treatment planning, and related work</small></label>
        </div>
        <p class="hint">{{ allowanceLabel(row) }}</p>
        <button v-if="form.services.length>1" type="button" class="quiet" @click="form.services.splice(i,1)">Remove service {{ i+1 }}</button>
      </fieldset>
      <button type="button" class="quiet" @click="addService" :disabled="form.services.length>=options.codes.length">+ Add another service code</button>
      <div class="calculation" aria-live="polite">
        <div><span>Actual work</span><strong>{{ format(actualTotal) }} min</strong></div>
        <div><span>Included period allowance</span><strong>{{ completeAllowance ? format(includedTotal)+' min' : 'Needs payroll verification' }}</strong></div>
        <div><span>Extra indirect time requested</span><strong>{{ completeAllowance ? format(calculatedExcess)+' min' : format(form.requestedMinutes)+' min (estimate)' }}</strong></div>
      </div>
      <p class="hint">The estimate compares total actual work with the service allowances across the period, then limits this request to indirect work above its included allowance. Direct-service excess is a separate payroll review. Allowances shown here come from your agency’s configured service rules, not the sick-leave multiplier.</p>
      <template v-if="!completeAllowance">
        <p>At least one service has no configured allowance. You can still report worked time for payroll to verify; a missing allowance does not mean zero time is included.</p>
        <label>Your estimate of extra indirect minutes<input type="number" v-model.number="form.requestedMinutes" min="0.01" :max="actualIndirect" step="0.01" required /></label>
        <label>How did you determine the extra minutes?<textarea v-model="form.allowanceExplanation" minlength="5" maxlength="2000" required placeholder="Explain the allowance you understood to apply, or what payroll needs to help verify." /></label>
      </template>
      <p v-else-if="calculatedExcess<=0" role="status">These totals do not show extra indirect time above the configured allowance. If required work is missing or the allowance is incorrect, contact payroll for a correction.</p>
      <label>What kind of work took extra time?<select v-model="form.activity" required><option value="" disabled>Select activity</option><option value="progress_notes">Progress notes</option><option value="treatment_planning">Treatment planning or plan revision</option><option value="chart_review">Chart review</option><option value="care_coordination">Care coordination</option><option value="mixed">Several of these activities</option><option value="other">Other required clinical work</option></select></label>
      <label>What did you do, and for which service?<textarea v-model="form.workDescription" minlength="5" maxlength="2000" required placeholder="Example: 90837 — revised treatment objectives and completed related documentation. No client names or clinical details." /></label>
      <label>What made the work take longer?<textarea v-model="form.reason" minlength="5" maxlength="2000" required :placeholder="form.activity==='treatment_planning' ? 'For example: a substantial plan revision, record review, or coordinating updated goals.' : 'For example: additional record review, a complex documentation task, or a system interruption.'" /></label>
      <label>Did you use Note Workspace for this work?<select v-model="form.workspaceUse" required><option value="" disabled>Select an answer</option><option value="yes">Yes</option><option value="partly">For part of the work</option><option value="no">No — I used another workflow</option><option value="unavailable">It was unavailable or I could not access it</option><option value="not_applicable">It was not appropriate for this task</option></select></label>
      <label v-if="form.workspaceUse && form.workspaceUse!=='yes'">What workflow did you use, or what prevented use?<textarea v-model="form.workspaceReason" minlength="5" maxlength="2000" required placeholder="For example: the treatment-plan task needed the current EHR, the tool was unavailable, or I need help using it." /></label>
      <p class="hint">These answers help us improve training and workflows. Using Note Workspace is not a condition of reporting time.</p>
      <label class="check"><input type="checkbox" v-model="form.wholePeriod" required /> I included all clinical FFS services and actual service-related time for this pay period, not only services that took longer.</label>
      <label class="check"><input type="checkbox" v-model="attested" required /> This accurately reports worked time and excludes extra time already paid or submitted elsewhere.</label>
      <label v-if="claim">Reason for editing this request<textarea v-model="editReason" minlength="5" maxlength="500" required /></label>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="success" role="status">{{ success }}</p>
      <button class="primary" type="submit" :disabled="saving || submitted || !(requested>0) || !attested || !form.wholePeriod">{{ saving ? 'Submitting…' : claim ? 'Resubmit for payroll approval' : 'Submit for payroll approval' }}</button>
    </form>
  </section>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import DocumentationHubTraining from './DocumentationHubTraining.vue';
const props=defineProps({agencyId:[Number,String],claim:Object});
const emit=defineEmits(['submitted']);
const options=ref(null),loading=ref(false),loadError=ref(''),error=ref(''),success=ref(''),saving=ref(false),submitted=ref(false),attested=ref(false),editReason=ref('');
const empty=()=>({periodId:'',workDate:'',services:[{code:'',count:1,directMinutes:'',indirectMinutes:''}],activity:'',workDescription:'',reason:'',workspaceUse:'',workspaceReason:'',wholePeriod:false,requestedMinutes:'',allowanceExplanation:''});
const form=reactive(empty());
const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const period=computed(()=>options.value?.periods.find(p=>Number(p.id)===Number(form.periodId)));
const maxWorkDate=computed(()=>period.value?.end<today?period.value.end:today);
const ruleFor=row=>options.value?.codes.find(c=>c.code===row.code);
const configured=row=>{const r=ruleFor(row);return r && r.directMinutes!=null && r.indirectMinutes!=null && Number(r.directMinutes)+Number(r.indirectMinutes)>0;};
const completeAllowance=computed(()=>form.services.length>0 && form.services.every(configured));
const includedTotal=computed(()=>form.services.reduce((sum,row)=>{const r=ruleFor(row);return sum+(configured(row)?Number(row.count)*(Number(r.directMinutes)+Number(r.indirectMinutes)):0);},0));
const actualIndirect=computed(()=>form.services.reduce((sum,r)=>sum+Number(r.indirectMinutes||0),0));
const actualTotal=computed(()=>actualIndirect.value+form.services.reduce((sum,r)=>sum+Number(r.directMinutes||0),0));
const includedIndirect=computed(()=>form.services.reduce((sum,row)=>sum+(configured(row)?Number(row.count)*Number(ruleFor(row).indirectMinutes):0),0));
const calculatedExcess=computed(()=>Math.round(Math.min(Math.max(0,actualIndirect.value-includedIndirect.value),Math.max(0,actualTotal.value-includedTotal.value))*100)/100);
const requested=computed(()=>completeAllowance.value?calculatedExcess.value:Number(form.requestedMinutes));
const format=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
function allowanceLabel(row){const r=ruleFor(row);return configured(row)?`Configured per service: ${format(r.directMinutes)} direct + ${format(r.indirectMinutes)} indirect minutes. Payroll verifies the applicable terms.`:'Allowance not configured — payroll will verify the request.';}
function addService(){form.services.push({key:Date.now(),code:'',count:1,directMinutes:'',indirectMinutes:''});}
let generation=0;
async function load(){const version=++generation;options.value=null;loading.value=true;loadError.value='';try{const {data}=await api.get('/payroll/me/ffs-excess-options',{params:{agencyId:props.agencyId}});if(version===generation)options.value=data;}catch(e){if(version===generation)loadError.value=e.response?.data?.error?.message||'Could not load the calculator.';}finally{if(version===generation)loading.value=false;}}
watch(()=>[props.agencyId,props.claim?.id],()=>{Object.assign(form,empty());attested.value=false;submitted.value=false;error.value='';success.value='';editReason.value='';const x=props.claim?.payload?.ffsExcess;if(x)Object.assign(form,x,{services:x.services.map(r=>({...r})),workDate:String(props.claim.claim_date).slice(0,10),wholePeriod:false});if(props.agencyId)load();},{immediate:true});
async function submit(){if(saving.value||submitted.value)return;error.value='';success.value='';saving.value=true;try{await api.request({method:props.claim?'patch':'post',url:props.claim?`/payroll/me/time-claims/${props.claim.id}`:'/payroll/me/time-claims',data:{agencyId:props.agencyId,claimType:'indirect_time',claimDate:form.workDate,editReason:editReason.value,payload:{categoryGroup:'indirect_service',totalMinutes:requested.value,attestation:attested.value,excludesAutomaticIndirect:true,ffsExcess:{...form,services:form.services.map(({code,count,directMinutes,indirectMinutes})=>({code,count,directMinutes,indirectMinutes}))},allocations:[{serviceTypeLabel:'Clinical FFS excess indirect time',minutes:requested.value,note:form.workDescription}]}}});submitted.value=true;success.value='Submitted to payroll for review. Find this request in My time records; it has not been automatically approved.';emit('submitted');}catch(e){error.value=e.response?.data?.error?.message||'Could not submit the request. Your entries are still here.';}finally{saving.value=false;}}
</script>
<style scoped>
.ffs-extra{color:var(--text-primary,#203c35);line-height:1.55}.ffs-extra h3{margin-top:0}.ffs-extra form{display:grid;gap:16px;margin-top:20px}.two-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ffs-extra label{display:grid;gap:6px;font-weight:600}.ffs-extra input:not([type=checkbox]),.ffs-extra select,.ffs-extra textarea{width:100%;box-sizing:border-box;font:inherit;padding:10px;min-height:44px;border:1px solid #bbcfc7;border-radius:8px;background:#fff;color:#203c35}.ffs-extra textarea{min-height:90px;resize:vertical}.ffs-extra button{font:inherit;min-height:44px;padding:10px 16px;border-radius:9px;border:1px solid #b4cec3;cursor:pointer}.ffs-extra button:disabled{opacity:.55;cursor:default}.primary{background:#176b54;color:white}.quiet{background:#fff;color:#245e50;justify-self:start}.service-row{border:1px solid #cbdad5;border-radius:12px;padding:16px;min-width:0}.calculation{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;background:#eaf5ef;border-radius:12px;padding:18px}.calculation div{display:grid;gap:5px}.calculation strong{font-size:1.15rem}.hint,small{font-size:.9rem;font-weight:400;color:#52675f}.ffs-extra .check{display:flex;align-items:flex-start;font-weight:400;gap:10px}.check input{margin-top:5px}.ffs-extra [role=alert]{color:#a12d26}@media(max-width:640px){.two-cols,.calculation{grid-template-columns:1fr}}
</style>
