<template>
 <section class="comp-drafts">
  <h2>Compensation amendment drafts</h2>
  <p>Proposed effective date: October 10, 2026. Edit each schedule and the agreement text here. These drafts do not change payroll, assign signature tasks, or send messages.</p>
  <p v-if="error" role="alert">{{error}}</p>
  <div class="draft-layout">
   <aside><label>Find an employee<input v-model="search" type="search" /></label>
    <button v-for="d in filtered" :key="d.id" :class="{selected:selected?.id===d.id}" :disabled="saving" @click="open(d.id)"><strong>{{d.name}}</strong><span v-if="d.example">Real example</span><small>Category {{d.category || '—'}} · Level {{d.level || '—'}} · {{d.issues.length}} items to complete</small></button>
    <p v-if="!drafts.length">No compensation drafts have been prepared for this agency.</p>
   </aside>
   <article v-if="selected && form">
    <h3>{{form.employee.name}}</h3><p>{{form.employee.title}} · {{form.employee.credential}}</p>
    <ul v-if="selected.issues.length" class="issues"><li v-for="issue in selected.issues" :key="issue">{{issue}}</li></ul>
    <div class="fields">
     <label>Category<select v-model.number="form.schedule.category"><option :value="null">Choose</option><option :value="1">1 · Unlicensed</option><option :value="2">2 · Pre-licensed</option><option :value="3">3 · Licensed</option></select></label>
     <label>Level<select v-model.number="form.schedule.level"><option :value="null">Choose</option><option v-for="l in 5" :key="l" :value="l">{{l}}</option></select></label>
     <label v-for="[key,label] in rates" :key="key">{{label}}<input v-model="form.schedule[key]" type="number" min="0" step="0.01" /></label>
    </div>
    <p class="muted">Changing category or level here does not apply a payroll rate. Confirm the draft’s rates against the approved matrix.</p>
    <label>Level description<textarea v-model="form.schedule.levelDescription" rows="2" /></label>
    <label>Prior agreement date or reference<input v-model="form.employee.originalAgreementDate" /></label>
    <label>Individual notes<textarea v-model="form.additionalTerms" rows="2" /></label>
    <h3>Agreement clauses</h3><DraftHtmlEditor :key="selected.id" v-model="form.commonClausesHtml" label="Amendment clauses" />
    <div class="actions"><button :disabled="saving" @click="save">{{saving?'Saving…':'Save draft & update preview'}}</button><button @click="download">Download printable HTML</button><span role="status">{{notice}}</span></div>
    <details open><summary>View saved amendment</summary><iframe sandbox="" title="Saved compensation amendment" :srcdoc="previewHtml" /></details>
    <details class="release"><summary>Release this individual amendment for signature</summary><p>Release makes this document visible to this employee in their real update and My Documents. Haley Inyart will countersign. It does not send an email or text and does not change payroll. Private previews remain read-only. Save any edits before releasing.</p><label><input v-model="releaseReady" type="checkbox" /> I reviewed the completed terms and want this employee to be able to sign.</label><button :disabled="saving || !releaseReady || selected.issues.length>0 || hasUnsavedChanges" @click="release">Make available for signature</button></details>
   </article>
  </div>
 </section>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
import DraftHtmlEditor from './DraftHtmlEditor.vue';
const props=defineProps({agencyId:{type:[String,Number],required:true}});
const drafts=ref([]),selected=ref(null),form=ref(null),search=ref(''),error=ref(''),notice=ref(''),saving=ref(false);
const releaseReady=ref(false);
const hasUnsavedChanges=computed(()=>JSON.stringify(form.value)!==JSON.stringify(selected.value?.data));
const rates=[['creditRate','Clinical credit rate'],['hcodeRate','Integrated calculation rate'],['indirectRate','Indirect / hour'],['supportRate','Support / hour'],['ptoRate','Sick leave / hour']];
const filtered=computed(()=>drafts.value.filter(d=>d.name.toLowerCase().includes(search.value.toLowerCase())).sort((a,b)=>Number(b.example)-Number(a.example)||a.name.localeCompare(b.name)));
const previewHtml=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><title>ITSCO compensation draft</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:35px auto;padding:25px;color:#243b30}h1,h2,h3{color:#3e6d54}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc;text-align:left}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style></head><body>${selected.value?.html||''}</body></html>`);
let openRequest=0;
async function reload(){
 const agencyId=props.agencyId;
 try{const response=await api.get('/provider-update/compensation-drafts',{params:{agencyId}});if(agencyId===props.agencyId)drafts.value=response.data.drafts;}
 catch(e){if(agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not load drafts.';}
}
async function open(id){
 const request=++openRequest,agencyId=props.agencyId;
 error.value='';notice.value='';releaseReady.value=false;selected.value=null;form.value=null;
 try{const response=(await api.get(`/provider-update/compensation-drafts/${id}`,{params:{agencyId}})).data;if(request!==openRequest||agencyId!==props.agencyId)return;selected.value=response;form.value=JSON.parse(JSON.stringify(response.data));}
 catch(e){if(request===openRequest&&agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not open draft.';}
}
async function save(){
 const agencyId=props.agencyId,id=selected.value.id;
 saving.value=true;error.value='';
 try{
  const response=(await api.put(`/provider-update/compensation-drafts/${id}`,{agencyId,schedule:form.value.schedule,originalAgreementDate:form.value.employee.originalAgreementDate,additionalTerms:form.value.additionalTerms,commonClausesHtml:form.value.commonClausesHtml})).data;
  if(agencyId!==props.agencyId||selected.value?.id!==id)return;
  selected.value=response;form.value=JSON.parse(JSON.stringify(response.data));notice.value='Draft saved. No payroll or employee changes made.';await reload();
 }catch(e){if(agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not save draft.';}finally{saving.value=false;}
}
async function release(){if(!releaseReady.value||selected.value.issues.length||hasUnsavedChanges.value)return;saving.value=true;try{await api.post(`/provider-update/compensation-drafts/${selected.value.id}/release`,{agencyId:props.agencyId,expectedHtml:selected.value.html,pushId:form.value.pushId});notice.value='Released for employee signature, then Haley’s countersignature. No email or text sent.';selected.value=null;form.value=null;releaseReady.value=false;await reload();}catch(e){error.value=e.response?.data?.error?.message||'Could not release amendment.';}finally{saving.value=false;}}
function download(){const url=URL.createObjectURL(new Blob([previewHtml.value],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`ITSCO-compensation-draft-${selected.value.data.employee.userId}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
onMounted(reload);watch(()=>props.agencyId,()=>{openRequest++;drafts.value=[];selected.value=null;form.value=null;error.value='';notice.value='';reload();});
</script>
<style scoped>
.comp-drafts{line-height:1.6}.draft-layout{display:grid;grid-template-columns:260px 1fr;gap:24px}.draft-layout aside{max-height:80vh;overflow:auto}.draft-layout aside button{display:block;width:100%;text-align:left;margin:6px 0;background:#fff;border:1px solid #d6e1dc;border-radius:10px;padding:12px}.draft-layout aside .selected{border:2px solid #3e6d54}.draft-layout small{display:block}.draft-layout aside span{font-size:11px;background:#e1f0e6;padding:3px 6px;margin-left:4px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:block;margin:8px 0}input,textarea,select{display:block;width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px}.issues{padding:14px 28px;background:#fff5de;border-radius:10px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:20px 0}.actions button{padding:10px 16px;background:#3e6d54;color:white;border:0;border-radius:8px}iframe{width:100%;height:680px;border:1px solid #d6e1dc}.muted{color:#52675d;font-size:13px}@media(max-width:800px){.draft-layout{grid-template-columns:1fr}.draft-layout aside{max-height:260px}.fields{grid-template-columns:1fr}}
</style>
