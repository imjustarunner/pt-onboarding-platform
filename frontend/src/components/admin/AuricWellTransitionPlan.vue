<template>
  <div>
    <header v-if="boardAgencyId" class="rollout-header"><h1>Full transition rollout · November 16–20</h1><p>NLU, ITSCO and Inner Strength: provider updates, client records, Drive backups, families, Google, texting, training videos, security, billing and closure readiness.</p>
      <nav aria-label="Transition plan practice"><button v-for="practice in practices" :key="practice.id" type="button" :aria-current="boardAgencyId === practice.id ? 'page' : undefined" @click="openPractice(practice)">{{ practice.name }}</button></nav>
      <p>Select a practice to manage its owners, readiness evidence, videos and remaining work. ITSCO’s named groups appear in its own board after verified session counts are entered.</p>
    </header>
    <TransitionWeekBoard v-if="boardAgencyId" ref="board" :agency-id="boardAgencyId" />
    <AuricWellTransitionWorkbench ref="workbench" :scoped-agency-id="scopedAgencyId" />
    <details class="aw-reference"><summary>Transition process and readiness reference</summary><AuricWellTransitionReadiness :scoped-agency-id="scopedAgencyId" /></details>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useRouter } from 'vue-router';
import { auricwellSettingsLocation } from '../../navigation/auricwellManagement.js';
import TransitionWeekBoard from './TransitionWeekBoard.vue';
import AuricWellTransitionWorkbench from './AuricWellTransitionWorkbench.vue';
import AuricWellTransitionReadiness from './AuricWellTransitionReadiness.vue';
const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const agencyStore = useAgencyStore(), authStore = useAuthStore(), board = ref(null);
const router = useRouter();
const practices = [{id:6,slug:'nlu',name:'Next Level Up'},{id:2,slug:'itsco',name:'ITSCO'},{id:377,slug:'tisi',name:'Inner Strength'}];
const boardAgencyId = computed(() => {
  const id = Number(agencyStore.currentAgency?.id);
  return [2,6,377].includes(id) && (!props.scopedAgencyId || Number(props.scopedAgencyId) === id) && ['admin','super_admin'].includes(authStore.user?.role) ? id : null;
});
const workbench = ref(null);
function openPractice(practice) {
  if (practice.id === boardAgencyId.value || board.value?.beforeNavigate?.() === false || workbench.value?.beforeNavigate?.() === false) return;
  void router.push(auricwellSettingsLocation(practice,'auricwell-transition'));
}
defineExpose({ beforeNavigate: () => board.value?.beforeNavigate?.() !== false && workbench.value?.beforeNavigate?.() !== false });
</script>
<style scoped>.rollout-header{margin-bottom:24px}.rollout-header nav{display:flex;gap:10px;flex-wrap:wrap}.rollout-header button{font:inherit;padding:10px 14px;border:1px solid var(--border,#ccd8e0);border-radius:7px;cursor:pointer}.rollout-header [aria-current=page]{background:var(--primary,#234f74);color:white}</style>
<style scoped>.aw-reference{margin-top:32px;border-top:1px solid var(--border,#d7e1e8);padding-top:16px}.aw-reference>summary{cursor:pointer;font-weight:600}.aw-reference article{margin-top:18px}</style>
