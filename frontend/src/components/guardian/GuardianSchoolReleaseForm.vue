<template>
  <section v-if="state !== 'idle'" class="portal-school-release" aria-label="School release of information">
    <h3 v-if="!embedded">Assigned to your documents</h3>
    <p v-if="!embedded" class="release-kicker">School release of information</p>
    <p v-if="schoolName && state !== 'signed'" class="release-school">{{ schoolName }}</p>
    <p v-if="state === 'form'">Complete this release here. It is saved to this child’s chart.</p>
    <p v-if="state === 'loading'">Loading the school release…</p>
    <p v-else-if="state === 'error'" role="alert">{{ error }}</p>
    <p v-else-if="state === 'signed'">This school release is signed and saved on the chart.</p>
    <div v-if="decisions.length" class="release-decisions">
      <h4>Current school sharing permissions</h4>
      <p>Either guardian’s explicit denial blocks clinical sharing with that staff member. Required scheduling, logistics and messaging remain available.</p>
      <ul><li v-for="row in decisions" :key="row.schoolStaffUserId"><strong>{{ row.staffName }}: {{ decisionLabel(row.effectiveDecision) }}</strong><ul><li v-for="(guardian, index) in row.guardians" :key="index">{{ guardian.guardianName }}: {{ decisionLabel(guardian.decision) }}<span v-if="guardian.expired"> · permission expired</span></li></ul><p v-if="row.conflict">The guardians’ decisions differ. The more restrictive permission applies.</p></li></ul>
    </div>
    <SmartSchoolRoiFlow
      v-if="packet && state === 'form'"
      :public-key="packet.publicKey"
      :session-token="packet.sessionToken"
      :roi-context="packet.roiContext"
      :link="packet.link"
      :bound-client="packet.boundClient"
      @completed="completed"
    />
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import SmartSchoolRoiFlow from '../public/SmartSchoolRoiFlow.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  schoolId: { type: [Number, String], default: null },
  embedded: { type: Boolean, default: false }
});
const emit=defineEmits(['completed']);
function completed(result){state.value='signed';emit('completed',result);void load();}

const state = ref('idle');
const error = ref('');
const schoolName = ref('');
const packet = ref(null);
const decisions = ref([]);
const decisionLabel = value => ({none:'No clinical sharing',roi:'Speak only',roi_docs:'Permitted goals and objectives'}[value] || 'Awaiting review');
let ticket = 0;

async function load() {
  const current = ++ticket;
  const clientId = Number(props.clientId);
  packet.value = null;
  decisions.value = [];
  error.value = '';
  schoolName.value = '';
  if (!clientId) {
    state.value = 'idle';
    return;
  }
  state.value = 'loading';
  try {
    const { data } = await api.get(`/guardian-portal/clients/${clientId}/school-release`);
    if (current !== ticket) return;
    const releaseSchoolId = Number(data?.schoolOrganizationId || 0);
    if (props.schoolId && releaseSchoolId && Number(props.schoolId) !== releaseSchoolId) {
      state.value = 'idle';
      return;
    }
    schoolName.value = String(data?.schoolName || '').trim();
    decisions.value = Array.isArray(data?.decisions) ? data.decisions : [];
    if (data?.status === 'completed') {
      state.value = 'signed';
      return;
    }
    if (!data?.ready || !data?.publicKey) {
      state.value = 'idle';
      return;
    }
    const intake = await api.get(`/public-intake/${encodeURIComponent(data.publicKey)}`);
    if (current !== ticket) return;
    const body = intake?.data || {};
    if (body.issuedLink?.status === 'completed') {
      state.value = 'signed';
      return;
    }
    if (!body.roiContext || !body.link) {
      state.value = 'error';
      error.value = 'This school release could not be opened. Please reload this page.';
      return;
    }
    schoolName.value = String(body.roiContext?.school?.name || schoolName.value || '').trim();
    packet.value = {
      publicKey: data.publicKey,
      sessionToken: `portal-${clientId}-${releaseSchoolId}-${data.publicKey}`,
      roiContext: body.roiContext,
      link: body.link,
      boundClient: body.boundClient || null
    };
    state.value = 'form';
  } catch (err) {
    if (current !== ticket) return;
    const status = Number(err?.response?.status || 0);
    if (status === 403 || status === 404) {
      state.value = 'idle';
      return;
    }
    state.value = 'error';
    error.value = 'This school release could not be opened. Please reload this page.';
  }
}

watch(() => [props.clientId, props.schoolId], load, { immediate: true });
</script>

<style scoped>
.portal-school-release { margin: 0 0 20px; padding: 16px; background: #fff; border: 1px solid #cfe0d9; border-radius: 12px; }
.portal-school-release h3 { margin: 0 0 4px; }
.release-kicker, .release-school { margin: 0 0 8px; }
.release-school { font-weight: 600; }
</style>
