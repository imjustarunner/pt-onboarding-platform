<template>
  <section class="business-journey">
    <header class="journey-header">
      <div><p class="journey-eyebrow">PlotTwistCo + PlotTwistHQ</p><h2>{{ commercialOnly ? 'Agreement, services & revenue' : 'Your business journey' }}</h2><p>PlotTwistCo manages and facilitates your business. PlotTwistHQ brings its people, tools, and daily work together.</p></div>
      <button class="btn btn-secondary" :disabled="loading || saving" @click="load">Reload saved journey</button>
    </header>
    <p v-if="loading" role="status">Loading the business journey…</p>
    <p v-if="error" role="alert" class="journey-error">{{ error }}</p>
    <p v-if="message" role="status" class="journey-message">{{ message }}</p>
    <p v-if="!endpoint" class="journey-card">Choose a company in Settings to begin.</p>
    <template v-if="state && !loading">
      <template v-if="!commercialOnly">
        <div class="journey-summary"><div><span class="journey-eyebrow">{{ state.exitStarted ? 'Transition plan' : 'Next step' }}</span><h3>{{ nextStage?.title || 'Handoff complete' }}</h3><p>{{ state.exitStarted ? 'Complete the agreed handoff and settlement.' : nextStage?.description }}</p></div><strong>{{ completedCount }} / {{ taskCount }} tasks confirmed</strong></div>
        <progress :value="completedCount" :max="taskCount" aria-label="Business journey progress" />
        <label class="journey-mobile-stage">Current step<select v-model="selected"><option v-for="(stage, index) in stages" :key="stage.id" :value="stage.id" :disabled="stage.id === 'exit' && !state.exitStarted">{{ index + 1 }}. {{ stage.title }}</option></select></label>
        <div class="journey-layout">
          <nav aria-label="Business journey steps"><button v-for="(stage, index) in stages" :key="stage.id" :aria-current="selected === stage.id ? 'step' : undefined" :disabled="stage.id === 'exit' && !state.exitStarted" @click="selected = stage.id"><span class="journey-number">{{ stageDone(stage) ? '✓' : index + 1 }}</span><span>{{ stage.title }}<small>{{ state.stages[stage.id].completed.length }} of {{ stage.tasks.length }} tasks</small></span></button></nav>
          <section v-if="activeStage" class="journey-card">
            <p class="journey-eyebrow">Step {{ stages.findIndex(s => s.id === selected) + 1 }} of {{ stages.length }}</p><h3>{{ activeStage.title }}</h3><p>{{ activeStage.description }}</p>
            <div class="journey-fields"><label>Responsible person<input v-model="state.stages[selected].owner" maxlength="160" placeholder="Name or role"></label><label>Target date<input v-model="state.stages[selected].targetDate" type="date"></label></div>
            <ul class="journey-tasks"><li v-for="task in activeStage.tasks" :key="task.id"><label><input v-model="state.stages[selected].completed" type="checkbox" :value="task.id"><span>{{ task.label }}</span></label><button v-if="task.destination && effectiveAgencyId" class="journey-link" @click="openSettings(task.destination)">Open settings →</button><button v-else-if="task.destination?.item === 'business-commercial'" class="journey-link" @click="showCommercial = true">Review terms ↓</button></li></ul>
            <label>Notes, decisions & evidence<textarea v-model="state.stages[selected].notes" rows="4" maxlength="4000" placeholder="Record decisions, outcomes, and references. Keep client or clinical information in its dedicated workspace." /></label>
            <p class="journey-muted">Check a task after the responsible person confirms it is complete. These confirmations record progress; linked tools perform the work.</p>
            <button v-if="nextUnfinishedAfterSelected" class="btn btn-secondary" @click="selected = nextUnfinishedAfterSelected">Continue to the next step →</button>
          </section>
        </div>
        <div class="journey-actions"><button class="btn btn-secondary" @click="showCommercial = !showCommercial">{{ showCommercial ? 'Hide' : 'Review' }} agreement & pricing</button><button v-if="!state.exitStarted" class="journey-link" @click="state.exitStarted = true; selected = 'exit'">Start an exit plan</button><span v-else class="journey-muted">Exit planning is active. Access changes and final settlement are completed in the linked tools.</span></div>
      </template>
      <BusinessCommercialTerms v-if="commercialOnly || showCommercial" v-model="state" :can-edit="isSuperAdmin" :agency-id="effectiveAgencyId" :quote="quote" :quote-error="quoteError" />
      <footer class="journey-save"><span>{{ dirty ? 'Unsaved changes' : revision ? 'All changes saved' : 'Save to start tracking this journey' }}</span><button class="btn btn-primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</button></footer>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import BusinessCommercialTerms from './BusinessCommercialTerms.vue';
const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null }, requestId: { type: String, default: '' }, commercialOnly: Boolean });
const emit = defineEmits(['saved']);
const store = useAgencyStore(), auth = useAuthStore(), route = useRoute(), router = useRouter();
const isSuperAdmin = computed(() => auth.user?.role === 'super_admin');
const agencyId = computed(() => Number(props.scopedAgencyId || store.currentAgency?.id) || null);
const effectiveAgencyId = computed(() => props.requestId ? linkedAgencyId.value : agencyId.value);
const linkedAgencyId = ref(null);
const endpoint = computed(() => props.requestId ? `/business-lifecycle/requests/${props.requestId}` : agencyId.value ? `/business-lifecycle/companies/${agencyId.value}` : null);
const state = ref(null), stages = ref([]), revision = ref(0), saved = ref(''), loading = ref(false), saving = ref(false), error = ref(''), message = ref(''), selected = ref('interview'), showCommercial = ref(false), quote = ref(null), quoteError = ref('');
let request = 0;
const dirty = computed(() => !!state.value && JSON.stringify(state.value) !== saved.value);
const stageDone = stage => state.value.stages[stage.id].completed.length === stage.tasks.length;
const trackedStages = computed(() => stages.value.filter(s => s.id !== 'exit' || state.value?.exitStarted));
const completedCount = computed(() => trackedStages.value.reduce((n, s) => n + state.value.stages[s.id].completed.length, 0));
const taskCount = computed(() => trackedStages.value.reduce((n, s) => n + s.tasks.length, 0));
const nextStage = computed(() => state.value?.exitStarted ? (stageDone(stages.value.find(s => s.id === 'exit')) ? null : stages.value.find(s => s.id === 'exit')) : stages.value.find(s => s.id !== 'exit' && !stageDone(s)) || stages.value.find(s => s.id === 'management'));
const activeStage = computed(() => stages.value.find(s => s.id === selected.value));
const nextUnfinishedAfterSelected = computed(() => trackedStages.value[trackedStages.value.findIndex(s => s.id === selected.value) + 1]?.id);
function accept(data) { state.value = data.state; stages.value = data.stages; revision.value = data.revision; linkedAgencyId.value = data.agencyId; saved.value = JSON.stringify(data.state); }
async function loadQuote(ticket) {
  if (!effectiveAgencyId.value) return;
  try { const { data } = await api.get(`/billing/${effectiveAgencyId.value}/estimate`); if (ticket === request) quote.value = data; }
  catch (e) { if (ticket === request) quoteError.value = e.response?.data?.error?.message || 'Current app charges are unavailable. Reload after billing setup is ready.'; }
}
async function load() {
  const ticket = ++request, url = endpoint.value;
  state.value = null; quote.value = null; quoteError.value = ''; error.value = ''; message.value = ''; linkedAgencyId.value = null;
  loading.value = !!url;
  if (!url) return;
  try { const { data } = await api.get(url); if (ticket !== request) return; accept(data); selected.value = nextStage.value?.id || 'exit'; void loadQuote(ticket); }
  catch (e) { if (ticket === request) error.value = e.response?.data?.error?.message || 'Could not load this business journey.'; }
  finally { if (ticket === request) loading.value = false; }
}
let saveInFlight = null;
function save() {
  if (saveInFlight) return saveInFlight;
  saveInFlight = performSave().finally(() => { saveInFlight = null; });
  return saveInFlight;
}
async function performSave() {
  const ticket = request, url = endpoint.value;
  const submitted = JSON.stringify(state.value);
  saving.value = true; error.value = ''; message.value = '';
  try {
    const { data } = await api.put(url, { state: JSON.parse(submitted), revision: revision.value });
    if (ticket !== request) return false;
    const newerEdits = JSON.stringify(state.value) !== submitted ? state.value : null;
    accept(data); if (newerEdits) state.value = newerEdits;
    message.value = 'Business journey saved.'; emit('saved', data); quote.value = null; quoteError.value = ''; void loadQuote(ticket); return true;
  } catch (e) { if (ticket === request) error.value = e.response?.data?.error?.message || 'Your changes were not saved. Please try again.'; return false; }
  finally { saving.value = false; }
}
async function openSettings(destination) {
  if (!(await beforeNavigate())) return;
  const query = { agencyId: String(effectiveAgencyId.value), category: destination.category, item: destination.item };
  if (destination.agencyTab) query.agencyTab = destination.agencyTab;
  await router.push({ path: route.path, query });
}
async function beforeNavigate() {
  while (dirty.value) { if (!(await save())) return false; }
  return true;
}
defineExpose({ beforeNavigate });
onBeforeRouteLeave(beforeNavigate);
onBeforeRouteUpdate(beforeNavigate);
watch(endpoint, load, { immediate: true });
</script>

<style src="./businessJourney.css"></style>
