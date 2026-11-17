<template>
  <div class="agency-care-toggle">
    <label><input type="checkbox" :checked="preferences?.seesClients === true" :disabled="loading || busy || !canEdit || !canManage" :aria-label="`Sees clients for ${agencyName}`" @change="save($event.target.checked)" /> Sees clients for this agency</label>
    <small>Controls provider listings and new client assignments for {{ agencyName }}. Other agency memberships keep their own settings.</small>
    <span v-if="loading" role="status">Loading care settings…</span>
    <span v-if="notice" role="status">{{ notice }}</span>
    <p v-if="error" role="alert">{{ error }} <button v-if="!busy" type="button" @click="load">Retry</button></p>
  </div>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ providerId: { type: Number, required: true }, agencyId: { type: Number, required: true }, agencyName: { type: String, default: 'this agency' }, canEdit: { type: Boolean, default: false } });
const emit = defineEmits(['updated']);
const preferences = ref(null), canManage = ref(false), loading = ref(false), busy = ref(false), error = ref(''), notice = ref('');
let generation = 0;
const endpoint = () => `/availability/providers/${props.providerId}/public-settings`;
async function load() {
  const run = ++generation;
  preferences.value = null; canManage.value = false; loading.value = true; busy.value = false; error.value = ''; notice.value = '';
  try {
    const { data } = await api.get(endpoint(), { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (run !== generation) return;
    preferences.value = { school: true, officeIds: null, scheduleAgencyId: props.agencyId, ...data.preferences };
    canManage.value = data.canManageCareAssignment === true;
  } catch (e) { if (run === generation) error.value = e.response?.data?.error?.message || 'Could not load agency care settings.'; }
  finally { if (run === generation) loading.value = false; }
}
async function save(seesClients) {
  if (!props.canEdit || !canManage.value || busy.value || !preferences.value) return;
  const run = generation;
  const prior = preferences.value.seesClients;
  preferences.value = { ...preferences.value, seesClients };
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.put(endpoint(), { ...preferences.value, agencyId: props.agencyId, seesClients, applyToAll: false }, { skipGlobalLoading: true });
    if (run !== generation) return;
    preferences.value = { ...preferences.value, ...data.preferences, seesClients };
    notice.value = 'Saved for this agency.';
    emit('updated', { agencyId: props.agencyId, seesClients });
  } catch (e) { if (run === generation) { preferences.value = { ...preferences.value, seesClients: prior }; error.value = e.response?.data?.error?.message || 'Could not save agency care settings.'; } }
  finally { if (run === generation) busy.value = false; }
}
watch(() => [props.providerId, props.agencyId], load, { immediate: true });
onBeforeUnmount(() => { ++generation; });
</script>
<style scoped>
.agency-care-toggle { display:grid; gap:8px; }
label { display:flex; align-items:center; gap:8px; font-weight:600; }
input { width:18px; height:18px; }
small { line-height:1.5; color:var(--text-secondary,#52657a); }
[role=alert] { color:var(--danger,#b91c1c); }
</style>
