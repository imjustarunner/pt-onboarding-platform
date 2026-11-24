<template>
  <main class="request-page" :style="{'--recipient-accent':session?.branding?.color||'#235883'}">
    <ClinicalRecipientBrand v-if="!selected || selected.type!=='form'" class="request-brand" :branding="session?.branding" />
    <section v-if="!session" class="welcome">
      <h1>Secure document request</h1>
      <p v-if="token">Open the request from your care team. You can complete it here without a portal account.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="token" class="btn btn-primary" type="button" :disabled="loading" @click="redeem">{{ loading?'Opening…':'Open secure request' }}</button>
    </section>
    <template v-else>
      <h1>Documents from your care team</h1>
      <nav v-if="session.items.length > 1" aria-label="Shared items">
        <button v-for="item in session.items" :key="item.id" type="button" class="btn btn-secondary"
          :aria-pressed="selectedId===item.id" @click="open(item.id)">
          {{ item.title }}<span v-if="item.clientName"> · {{ item.clientName }}</span><span v-if="item.completed"> · Completed</span>
        </button>
      </nav>
      <p v-if="loading" role="status">Opening document…</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <section v-if="selected" :key="selectedId">
        <template v-if="selected.type==='form'">
          <p v-if="editing">Complete the fields below, then sign to submit your form.</p>
          <SafetyPlanDocument ref="documentView" :model-value="editing ? answers : selected.plan.data"
            :editable="editing" :lock-client="editing" :omit-empty="!editing" :template="selected.plan.template"
            :branding="selected.plan.branding || session.branding" :version="selected.plan.version" :signers="selected.plan.signers"
            @update:model-value="answers=$event" />
          <ClinicalDocumentCopy v-if="!editing && (selected.completed || selected.action==='view')" :document-element="()=>documentView?.$el" />
          <p v-if="selected.plan.revocation" role="status">This authorization has been revoked.</p>
        </template>
        <article v-else-if="selected.type==='treatment_plan'" class="treatment">
          <h2>{{ selected.document.title }}</h2>
          <p v-if="selected.document.effectiveDate">Effective {{ selected.document.effectiveDate }}</p>
          <p v-if="selected.document.problem">{{ selected.document.problem }}</p>
          <p v-if="selected.document.frequency">Frequency {{ selected.document.frequency }}</p>
          <section v-if="selected.document.diagnoses.length">
            <h3>Diagnoses</h3>
            <ul><li v-for="(diagnosis,index) in selected.document.diagnoses" :key="index">{{ diagnosis.description }} <span v-if="diagnosis.justification">· {{ diagnosis.justification }}</span></li></ul>
          </section>
          <section v-if="selected.document.goals.length">
            <h3>Goals and objectives</h3>
            <div v-for="(goal,index) in selected.document.goals" :key="index">
              <h4>{{ goal.text }}</h4><p v-if="goal.projectedCompletion">Target date {{ goal.projectedCompletion }}</p>
              <ul><li v-for="(objective,i) in goal.objectives" :key="i">{{ objective.text }}
                <span v-if="objective.target!==null && objective.target!==undefined"> · Target {{ objective.target }}</span>
                <span v-if="objective.projectedCompletion"> · Target date {{ objective.projectedCompletion }}</span>
                <span v-if="objective.direction"> · {{ objective.direction }}</span>
                <span v-if="objective.measurement"> · {{ objective.measurement }}</span>
                <span v-if="objective.interventions?.length"> · {{ objective.interventions.join(', ') }}</span>
              </li></ul>
            </div>
          </section>
          <p v-if="selected.document.diagnosticJustification">{{ selected.document.diagnosticJustification }}</p>
          <p v-if="selected.document.discharge">{{ selected.document.discharge }}</p>
        </article>
        <article v-else>
          <h2>{{ selected.document.title }}</h2>
          <a :href="itemEndpoint + '/file'" class="btn btn-secondary" @click="fileOpened=true">Open document (PDF)</a>
        </article>
        <SafetyPlanSigning v-if="signingPlan && !selected.completed && !selected.plan?.revocation && (selected.type!=='file'||fileOpened)"
          :key="selectedId" :plan="signingPlan" :signer="{}" :update-data="editing ? answers : undefined"
          :submit-handler="save" portal @signed="saved" @cancel="cancel" />
        <p v-if="selected.completed" role="status">Completed. Your care team has your submission.</p>
      </section>
      <a v-if="session.portalUrl" :href="session.portalUrl">Open your AuricWell portal</a>
    </template>
  </main>
</template>

<script setup>
import {computed,onMounted,ref} from 'vue';
import SafetyPlanDocument from '../../components/safetyPlans/SafetyPlanDocument.vue';
import SafetyPlanSigning from '../../components/safetyPlans/SafetyPlanSigning.vue';
import ClinicalDocumentCopy from '../../components/safetyPlans/ClinicalDocumentCopy.vue';
import ClinicalRecipientBrand from '../../components/safetyPlans/ClinicalRecipientBrand.vue';

const base='/api/public/clinical-document-requests';
const token=ref(''),session=ref(null),selected=ref(null),selectedId=ref(null),documentView=ref(null);
const loading=ref(false),error=ref(''),notice=ref(''),answers=ref({}),fileOpened=ref(false);
let generation=0;
const itemEndpoint=computed(()=>base+'/items/'+selectedId.value);
const editing=computed(()=>selected.value?.type==='form'&&selected.value.action==='complete'&&!selected.value.completed);
const signingPlan=computed(()=>{
  const item=selected.value;
  if(!item || item.action==='view')return null;
  return item.plan||{version:item.version,template:{title:item.document.title}};
});
async function request(path,body){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',
    ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||'This request could not be opened.');
  return data;
}
async function open(id){
  const own=++generation;
  loading.value=true;selected.value=null;selectedId.value=id;error.value='';fileOpened.value=false;
  try{
    const data=await request(itemEndpoint.value);
    if(own!==generation)return;
    selected.value=data;
    answers.value=data.plan?structuredClone(data.plan.data):{};
  }catch(e){if(own===generation)error.value=e.message;}
  finally{if(own===generation)loading.value=false;}
}
async function load(){
  const data=await request(base+'/session');
  session.value=data;
  await open(selectedId.value||data.items.find(item=>!item.completed)?.id||data.items[0]?.id);
}
async function redeem(){
  error.value='';loading.value=true;
  try{
    await request(base+'/redeem',{token:token.value});
    token.value='';
    await load();
  }catch(e){error.value=e.message;}
  finally{loading.value=false;}
}
async function save(values){
  await request(itemEndpoint.value+'/submit',values);
}
async function saved(){
  notice.value='Saved to your care team’s record.';
  try{await load();}catch(e){error.value=e.message;}
}
function cancel(){
  if(session.value.items.length>1){selected.value=null;selectedId.value=null;}
  else if(editing.value)answers.value=JSON.parse(JSON.stringify(selected.value.plan.data));
}
onMounted(async()=>{
  const fragment=location.hash.slice(1);
  if(/^[a-f0-9]{64}$/.test(fragment)){
    token.value=fragment;
    history.replaceState(history.state,'',location.pathname+location.search);
    return;
  }
  loading.value=true;
  try{await load();}catch(e){error.value=e.message;}finally{loading.value=false;}
});
</script>

<style scoped>
.request-page{max-width:56rem;margin:0 auto;padding:2rem 1.25rem;color:#142d50}
.request-brand{margin-bottom:1.5rem}.request-page h1{font-size:clamp(1.5rem,4vw,2rem)}
.welcome,.treatment{border:1px solid #cfdae7;border-radius:.8rem;padding:1.4rem;background:#fff}
nav{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem}nav button[aria-pressed=true]{outline:2px solid var(--recipient-accent)}
[role=alert]{color:#8e2b22}.treatment h2{margin-top:0}.request-page>a{display:inline-block;margin-top:1.1rem}
</style>
