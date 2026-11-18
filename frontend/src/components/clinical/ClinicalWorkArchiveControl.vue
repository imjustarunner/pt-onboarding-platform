<template>
  <span v-if="allowed && Number(agencyId) > 0" class="work-archive-control">
    <button type="button" class="secondary" @click="open">{{ target ? (target.type === 'draft' ? 'Archive test draft' : 'Archive test session') : 'Archived test records' }}</button>
    <Teleport to="body">
      <dialog v-if="opened" ref="dialog" class="work-archive-dialog" aria-labelledby="work-archive-title" @cancel.prevent="close">
        <header><h2 id="work-archive-title">{{ target ? 'Archive test records' : 'Archived test records' }}</h2><button type="button" :disabled="busy" aria-label="Close archive" @click="close">×</button></header>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="message" role="status">{{ message }}</p>
        <p v-if="loading" role="status">Loading records…</p>
        <template v-else-if="target && preview">
          <p><strong>{{ label || 'Selected session' }}</strong></p>
          <p v-for="client in preview.clientLabels" :key="client.id">{{ client.name }} · Client #{{ client.id }}</p>
          <p>This keeps the records and their history, hides the linked work from the schedule, My Work, and billing queues, and blocks billing submission until an admin restores it.</p>
          <ul><li v-for="(count, kind) in preview.summary.counts" :key="kind">{{ count }} {{ kind === 'myWork' ? 'My Work entries' : kind }}</li></ul>
          <p v-for="session in preview.summary.sessions" :key="session.id">Session #{{ session.id }} · {{ session.serviceCode || 'No code' }} · {{ date(session.dateOfService) }}</p>
          <p v-for="claim in preview.summary.claims" :key="claim.id">Claim #{{ claim.id }} · Client #{{ claim.clientId }} · {{ claim.status }}</p>
          <label>Archive reason<textarea v-model="reason" :disabled="busy" minlength="10" maxlength="2000" placeholder="Explain why these are test records that should be archived." /></label>
          <label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="busy" /> I reviewed the linked records and want to archive them without deleting them.</label>
          <button type="button" :disabled="busy || !confirmed || reason.trim().length < 10" @click="archive">{{ busy ? 'Archiving…' : 'Archive reviewed records' }}</button>
        </template>
        <template v-else-if="!target">
          <p>Archived test records are excluded from normal schedules, My Work and billing. Restore a group to return it to normal workflows. Normal scheduling rules apply after restoration; restoring does not submit a claim.</p>
          <p v-if="!items.length">No archived test records in this organization.</p>
          <article v-for="item in items" :key="item.id" class="archive-item">
            <strong>{{ item.clientName || `Archive #${item.id}` }}</strong>
            <p>{{ item.summary.counts.sessions }} sessions · {{ item.summary.counts.claims }} claims · Archived {{ date(item.archivedAt) }} by {{ item.archivedBy || 'Admin' }}</p>
            <p v-for="session in item.summary.sessions" :key="session.id">#{{ session.id }} · {{ session.serviceCode || 'No code' }} · {{ date(session.dateOfService) }}</p>
            <p>{{ item.reason }}</p>
            <label>Restore reason<textarea v-model="restoreReasons[item.id]" :disabled="busy" minlength="10" maxlength="2000" /></label>
            <button type="button" :disabled="busy || String(restoreReasons[item.id] || '').trim().length < 10" @click="restore(item)">Restore this group</button>
          </article>
        </template>
        <footer><button type="button" :disabled="busy" @click="close">Close</button><button v-if="!target" type="button" :disabled="busy || loading" @click="load">Refresh archives</button></footer>
      </dialog>
    </Teleport>
  </span>
</template>

<script setup>
import { computed, ref, reactive, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { fetchWorkQueueFromApi } from '../../utils/noteAidWorkQueue.js';
const props = defineProps({ agencyId: [Number, String], target: { type: Object, default: null }, label: String });
const emit = defineEmits(['changed']);
const auth = useAuthStore(), route = useRoute();
const allowed = computed(() => ['admin', 'super_admin'].includes(auth.user?.role) && !route.meta?.auricwellPreview);
const dialog = ref(null), opened = ref(false), loading = ref(false), busy = ref(false);
const error = ref(''), message = ref(''), reason = ref(''), confirmed = ref(false), preview = ref(null), items = ref([]);
const restoreReasons = reactive({});
const date = value => value ? String(value).slice(0, 10) : 'No date';
const close = () => { if (!busy.value) { opened.value = false; preview.value = null; } };
async function load() {
  loading.value = true; error.value = ''; preview.value = null;
  try {
    const response = props.target
      ? await api.post('/clinical-data/work-archives/preview', { agencyId: Number(props.agencyId), target: props.target }, { skipGlobalLoading: true })
      : await api.get('/clinical-data/work-archives', { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading: true });
    if (props.target) preview.value = response.data;
    else items.value = response.data.items || [];
  } catch (err) { error.value = err.response?.data?.error?.message || 'Unable to load archive records.'; }
  finally { loading.value = false; }
}
async function open() {
  opened.value = true; message.value = ''; reason.value = ''; confirmed.value = false;
  await nextTick();
  if (dialog.value?.showModal) dialog.value.showModal(); else dialog.value?.setAttribute('open', '');
  await load();
}
async function archive() {
  if (busy.value || !preview.value || !confirmed.value || reason.value.trim().length < 10) return;
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post('/clinical-data/work-archives', { agencyId: Number(props.agencyId), target: props.target, version: preview.value.version,
      reason: reason.value.trim(), confirmation: 'ARCHIVE TEST RECORDS' }, { skipGlobalLoading: true });
    preview.value = null; message.value = 'Test records archived. Their history is retained.';
    try { await fetchWorkQueueFromApi(auth.user?.id); } catch { /* The next refresh will fetch the authoritative queue. */ }
    emit('changed', data);
  } catch (err) { error.value = err.response?.data?.error?.message || 'Unable to archive these records.'; confirmed.value = false; }
  finally { busy.value = false; }
}
async function restore(item) {
  if (busy.value || String(restoreReasons[item.id] || '').trim().length < 10) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/clinical-data/work-archives/${item.id}/restore`, { agencyId: Number(props.agencyId), reason: restoreReasons[item.id].trim() }, { skipGlobalLoading: true });
    await load();
    try { await fetchWorkQueueFromApi(auth.user?.id); } catch { /* The next refresh will fetch the authoritative queue. */ }
    message.value = 'Records restored. Normal review and billing requirements still apply.'; emit('changed');
  } catch (err) { error.value = err.response?.data?.error?.message || 'Unable to restore these records.'; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.work-archive-dialog { width: min(720px, calc(100vw - 32px)); max-height: 85vh; overflow: auto; border: 1px solid #cbd5e1; border-radius: 16px; padding: 24px; color: #172033; background: white; }
.work-archive-dialog::backdrop { background: rgb(15 23 42 / 55%); }
header, footer { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
h2 { margin: 0; font-size: 1.2rem; }
footer { margin-top: 20px; }
button { padding: 8px 12px; border: 1px solid #94a3b8; border-radius: 8px; background: #f8fafc; color: #172033; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
label { display: grid; gap: 8px; margin: 12px 0; }
textarea { min-height: 64px; padding: 10px; border: 1px solid #94a3b8; border-radius: 6px; }
.confirm { display: flex; align-items: flex-start; }
.archive-item { padding: 16px 0; border-bottom: 1px solid #e2e8f0; }
[role=alert] { color: #b91c1c; }
</style>
