<template>
  <main class="transition-workspace">
    <header class="tw-topbar"><router-link to="/dashboard" class="tw-back">← Back to dashboard</router-link><span class="tw-wordmark">Transition workspace</span><span class="tw-private">Staff workspace</span></header>
    <div class="tw-page">
      <nav class="tw-practices" aria-label="Choose practice"><button v-for="practice in practices" :key="practice.id" type="button" :aria-current="selectedId===practice.id?'page':undefined" @click="selectPractice(practice)"><span class="tw-practice-dot" />{{ practice.name }}</button></nav>
      <p v-if="loading" role="status">Loading your practices…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="!loading&&!error&&!practices.length">Transition manager access and active membership in ITSCO, Next Level Up or Inner Strength are required.</p>
      <TransitionWeekBoard v-if="selectedId" ref="board" :agency-id="selectedId" :actor-id="Number(auth.user?.id||0)" @open-tools="tools=$event" />
    </div>
    <div v-if="tools" class="tw-modal" role="dialog" aria-modal="true" aria-labelledby="transition-tools-title"><section class="tw-modal-body tw-tools"><div class="tw-heading"><h2 id="transition-tools-title">{{ tools.practice.name }} · records & scheduling</h2><button type="button" @click="closeTools">Close</button></div><AuricWellTransitionWorkbench ref="workbench" :context-agency="tools.practice" :scoped-agency-id="tools.practice.id" :initial-provider-id="tools.providerId" :initial-tab="tools.tab" /></section></div>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router';
import {useAuthStore} from '../store/auth';
import api from '../services/api';
import TransitionWeekBoard from '../components/admin/TransitionWeekBoard.vue';
import AuricWellTransitionWorkbench from '../components/admin/AuricWellTransitionWorkbench.vue';
import '../styles/transitionWorkspace.css';
const auth=useAuthStore(),route=useRoute(),router=useRouter(),practices=ref([]),loading=ref(true),error=ref(''),board=ref(null),tools=ref(null),workbench=ref(null);
const selectedId=computed(()=>{const requested=practices.value.find(p=>p.slug===route.query.practice);return requested?.id||(practices.value.some(p=>p.id===2)?2:practices.value[0]?.id)||null;});
function canLeave(){return !tools.value&&board.value?.beforeNavigate?.()!==false;}
function selectPractice(practice){if(practice.id===selectedId.value||!canLeave())return;void router.replace({path:'/practice-transition',query:{practice:practice.slug}});}
function closeTools(){if(workbench.value?.beforeNavigate?.()!==false)tools.value=null;}
function unload(event){if(!canLeave()){event.preventDefault();event.returnValue='';}}
onBeforeRouteLeave(()=>canLeave());onBeforeRouteUpdate(()=>canLeave());
onMounted(async()=>{window.addEventListener('beforeunload',unload);try{practices.value=(await api.get('/provider-scheduling/transition-workspace/practices')).data.practices;}catch(e){error.value=e.response?.data?.error?.message||'Could not load your practices.';}finally{loading.value=false;}});
onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload));
</script>
