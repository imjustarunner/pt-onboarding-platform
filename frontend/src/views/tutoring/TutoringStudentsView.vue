<script setup>
import {computed,defineAsyncComponent,ref,watch} from 'vue';
import {useAgencyStore} from '../../store/agency.js';
import {useRoute} from 'vue-router';
import api from '../../services/api.js';
const props=defineProps({agencyId:[Number,String],http:Object,schedulePath:String});
const agency=useAgencyStore(),route=useRoute();
const LearningRecord=defineAsyncComponent(()=>import('../../components/admin/clientChart/ClientLearningOsPanel.vue'));
const id=computed(()=>Number(props.agencyId||agency.currentAgency?.id)),client=computed(()=>props.http||api);
const students=ref([]),selected=ref(null),overview=ref(null),loading=ref(false),detailLoading=ref(false),error=ref('');let generation=0,detailGeneration=0;
async function load(){const current=++generation;detailGeneration++;students.value=[];selected.value=null;overview.value=null;error.value='';if(!id.value)return;loading.value=true;try{const {data}=await client.value.get('/tutoring-workspace/students',{params:{agencyId:id.value}});if(current===generation){students.value=data.students||[];const requested=Number(route.params?.clientId||route.query?.clientId);if(requested){const student=students.value.find(s=>Number(s.id)===requested);if(student)await open(student);else error.value='This student is not assigned to you for tutoring in this organization.';}}}catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Students could not be loaded.';}finally{if(current===generation)loading.value=false;}}
async function open(student){const current=++detailGeneration;selected.value=student;overview.value=null;error.value='';detailLoading.value=true;try{const {data}=await client.value.get(`/tutoring-learning-os/clients/${student.id}/overview`,{params:{agencyId:id.value}});if(current===detailGeneration)overview.value=data;}catch(e){if(current===detailGeneration)error.value=e.response?.data?.error?.message||'This learning record could not be opened.';}finally{if(current===detailGeneration)detailLoading.value=false;}}
const schedule=computed(()=>props.schedulePath||`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/my-schedule`);
watch([id,()=>route.params?.clientId||route.query?.clientId],load,{immediate:true});
</script>
<template>
 <main class="tutor-students nlu-workspace">
  <header class="nlu-page-header"><div><p class="nlu-eyebrow">Learning</p><h1>My students</h1><p>Your assigned students, subject tracks and learning plans.</p></div><RouterLink class="nlu-button nlu-button--secondary" :to="schedule">Open schedule</RouterLink></header>
  <p v-if="loading" role="status">Loading students…</p>
  <p v-if="error" role="alert">{{error}} <button class="nlu-button nlu-button--secondary" @click="selected?open(selected):load()">Try again</button></p>
  <p v-if="!loading&&!error&&!students.length">No students are assigned to you for tutoring in this organization yet.</p>
  <ul v-if="students.length" class="student-cards" aria-label="Assigned students"><li v-for="student in students" :key="student.id"><button class="student-card" @click="open(student)" :aria-pressed="selected?.id===student.id"><strong>{{student.displayName}}</strong><span>Open learning record →</span></button></li></ul>
  <section v-if="selected" class="student-learning" :aria-label="`${selected.displayName} learning record`"><h2>{{selected.displayName}}</h2><p v-if="detailLoading" role="status">Loading learning record…</p><template v-if="overview"><p v-if="!overview.subjects?.length">Start a subject track below, then record a baseline and prepare the learning plan. This does not start or complete an appointment.</p><LearningRecord :key="`${id}:${selected.id}`" :client-id="selected.id" :agency-id="id" /></template></section>
 </main>
</template>
<style scoped>.tutor-students{max-width:900px;margin:auto;padding:24px;color:var(--text-primary,#203b5b)}p{line-height:1.6}li{margin:9px 0}button{font:inherit;min-height:44px;padding:10px 16px;background:#eef5fd;border:1px solid #b3cbe5;border-radius:8px;cursor:pointer}button[aria-pressed=true]{background:#d2e6fb}article{padding:16px;border:1px solid #d4e0eb;border-radius:10px;margin:12px 0}[role=alert]{color:#a52d37}:focus-visible{outline:3px solid #4e86c9;outline-offset:2px}</style>
<style scoped>.student-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;list-style:none;padding:0}.student-cards li{margin:0}.student-card{width:100%;min-height:100px;display:grid;gap:12px;text-align:left;background:white}.student-card span{font-size:14px;color:#49636a}.student-card[aria-pressed=true]{border:2px solid #17634f;background:#edf8f3}.student-learning{margin-top:28px}.tutor-students{max-width:1120px}@media(max-width:600px){.tutor-students{padding:16px}}</style>
