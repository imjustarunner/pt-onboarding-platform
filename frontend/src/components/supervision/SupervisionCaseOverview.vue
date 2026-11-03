<template>
  <component :is="expanded ? 'section' : 'details'" @toggle="onToggle" :aria-busy="busy">
    <summary v-if="!expanded">Client charts and treatment plans</summary>
    <p>Read the supervisee’s shared chart notes and treatment plans. Case acknowledgement is separate from note cosign.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button :disabled="busy" @click="loadCases(false)">Refresh cases</button>
    <p v-if="busy" role="status">Loading clinical records…</p>
    <p v-else-if="loaded && !cases.length">No shared signed notes or active treatment plans found for this supervisee.</p>
    <ul><li v-for="item in cases" :key="item.clientId">Client #{{ item.clientId }} <button :disabled="busy" @click="open(item.clientId)">Build case overview</button><button :disabled="busy" @click="emit('view-notes', item.clientId)">All notes &amp; plans</button></li></ul>
    <button v-if="nextCursor" :disabled="busy" @click="loadCases(true)">More cases</button>
    <section v-if="overview" aria-label="Clinical case overview">
      <h4>Client #{{ overview.clientId }}</h4><p>{{ overview.description }}</p>
      <h5>Treatment plans</h5>
      <article v-for="plan in overview.treatmentPlans" :key="plan.id">
        <strong>{{ plan.title }}</strong><p>{{ plan.presentingProblem }}</p><p>{{ plan.prescribedFrequency }}</p>
        <ul><li v-for="(goal,i) in plan.goals" :key="i">{{ goal.text }} <small>{{ goal.status }}</small><ul><li v-for="(objective,j) in goal.objectives" :key="j">{{ objective.text }}</li></ul></li></ul>
        <p>{{ plan.dischargePlan }}</p><button @click="emit('open-document',{id:plan.id,type:'treatment_plan',title:plan.title})">Read full plan</button>
      </article>
      <h5>Recent signed notes</h5>
      <article v-for="note in overview.recentNotes" :key="note.id">
        <strong>{{ note.title }}</strong><small>{{ note.signedAt }}</small><pre>{{ note.text || 'Open this note to read its clinical content.' }}</pre>
        <p v-if="note.truncated">Excerpt shortened. Read the full note.</p><p v-if="note.hasAddenda">Amendments/addenda are attached. Open the source to read them.</p>
        <button @click="emit('open-document',{id:note.id,type:'note',title:note.title})">Read note &amp; addenda</button>
      </article>
      <form v-if="canReview" @submit.prevent="acknowledge">
        <p v-if="overview.acknowledgedAt">You acknowledged this version: {{ overview.acknowledgedAt }}</p>
        <label><input v-model="attested" type="checkbox" required /> I reviewed this case overview. This acknowledgement does not cosign notes, certify licensure hours, or replace required supervision.</label>
        <button :disabled="busy || !attested">Acknowledge case overview</button>
      </form>
      <button @click="overview=null">Close overview</button>
    </section>
  </component>
</template>
<script setup>
import { ref,watch,onBeforeUnmount,onMounted } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},providerId:{type:Number,required:true},canReview:Boolean,expanded:Boolean});
const emit=defineEmits(['view-notes','open-document']);
const cases=ref([]),nextCursor=ref(null),overview=ref(null),busy=ref(false),error=ref(''),attested=ref(false);
const loaded=ref(false);
let generation=0;
watch(()=>[props.agencyId,props.providerId],()=>{generation++;cases.value=[];overview.value=null;nextCursor.value=null;error.value='';busy.value=false;loaded.value=false;if(props.expanded)void loadCases(false);});
onBeforeUnmount(()=>{generation++;});
const base=()=>`/supervision/supervisee/${props.providerId}/cases`;
async function run(fn){if(busy.value)return;const g=generation;busy.value=true;error.value='';try{await fn(g);}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Unable to load or acknowledge this case.';}finally{if(g===generation)busy.value=false;}}
const loadCases=more=>run(async g=>{const {data}=await api.get(base(),{params:{agencyId:props.agencyId,afterClientId:more?nextCursor.value:0},skipGlobalLoading:true});if(g===generation){cases.value=more?[...cases.value,...data.cases]:data.cases;nextCursor.value=data.nextCursor;loaded.value=true;}});
const onToggle=e=>{if(e.target.open&&!loaded.value)loadCases(false);};
const open=id=>run(async g=>{overview.value=null;attested.value=false;const {data}=await api.get(`${base()}/${id}/overview`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(g===generation)overview.value=data;});
const acknowledge=()=>run(async g=>{const id=overview.value.clientId;await api.post(`${base()}/${id}/acknowledgement`,{agencyId:props.agencyId,contentHash:overview.value.contentHash,attested:attested.value});if(g===generation){attested.value=false;const {data}=await api.get(`${base()}/${id}/overview`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(g===generation)overview.value=data;}});
onMounted(()=>{if(props.expanded)void loadCases(false);});
watch(()=>props.expanded,value=>{if(value&&!loaded.value)void loadCases(false);});
</script>
<style scoped>
details{border-top:1px solid var(--border-color,#dce3eb);padding:1rem 0;margin-top:1rem}summary{cursor:pointer;font-weight:600}button{padding:.5rem .8rem;margin:.3rem}article{padding:.75rem 0;border-bottom:1px solid var(--border-color,#dce3eb)}small{display:block}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}label{display:block;margin:1rem 0}[role=alert]{color:#a32121}
</style>
