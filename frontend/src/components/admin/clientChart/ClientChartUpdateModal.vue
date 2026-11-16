<template>
  <div class="chart-update-backdrop" @click.self="leave()" @keydown.esc.stop="leave()">
    <div class="chart-update-modal" role="dialog" aria-modal="true" aria-labelledby="chart-update-title">
      <header>
        <div><h2 id="chart-update-title">Bring up to date</h2><p>{{ current?.agency_name || 'Client Management' }} · {{ current?.full_name || current?.initials || 'Select a client' }} <span v-if="queue.length">· {{ index + 1 }} of {{ queue.length }}</span></p></div>
        <button type="button" :disabled="busy || moving" @click="leave()">Close</button>
      </header>
      <nav aria-label="Client navigation">
        <button type="button" :disabled="busy || moving || index <= 0" @click="move(index - 1)">Previous client</button>
        <select :value="current?.id" :disabled="busy || moving" aria-label="Choose client" @change="move(queue.findIndex(client => Number(client.id) === Number($event.target.value)))"><option v-for="client in queue" :key="client.id" :value="client.id">{{ client.agency_name ? `${client.agency_name} · ` : '' }}{{ client.full_name || client.initials }} · #{{ client.id }}</option></select>
        <button type="button" :disabled="busy || moving || index >= queue.length - 1" @click="move(index + 1)">Next client →</button>
      </nav>
      <p v-if="loading" role="status">Loading clients…</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <ClientEhrBringUpToDatePanel v-if="current" :key="`${current.agency_id}:${current.id}`" ref="panel" embedded open :client-id="current.id" :agency-id="current.agency_id" :client-label="current.full_name || current.initials" @busy="busy = $event" @imported="emit('updated')" @done="emit('updated')" />
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../../../services/api';
import ClientEhrBringUpToDatePanel from './ClientEhrBringUpToDatePanel.vue';
const props = defineProps({ initialClient: { type: Object, required: true }, agencyId: { type: [Number,String], default: null } });
const emit = defineEmits(['close', 'updated']);
const queue = ref([props.initialClient]), index = ref(0), busy = ref(false), moving = ref(false), loading = ref(false), error = ref(''), panel = ref(null);
const current = computed(() => queue.value[index.value]);
let alive = true;
async function move(next) {
  if (next < 0 || next >= queue.value.length || busy.value || moving.value) return;
  moving.value = true;
  try { if (await panel.value?.prepareLeave() !== false && alive) index.value = next; }
  finally { moving.value = false; }
}
async function leave() {
  if (busy.value || moving.value) return;
  moving.value = true;
  try { if (await panel.value?.prepareLeave() !== false) emit('close'); }
  finally { moving.value = false; }
}
onMounted(async () => {
  loading.value = true;
  try {
    const rows = []; let page = 1, total = Infinity;
    while (alive && rows.length < total) {
      const params = { ...(props.agencyId ? { agency_id: props.agencyId } : {}), includeArchived: true, paginate: true, page, per_page: 200, sort: 'name', order: 'asc' };
      const response = await api.get('/clients', { params, skipGlobalLoading: true });
      if (!alive) return;
      const payload = response.data;
      const batch = Array.isArray(payload) ? payload : payload.items || [];
      total = Array.isArray(payload) ? batch.length : Number(payload.total);
      if (!Number.isFinite(total) || (batch.length === 0 && rows.length < total)) throw new Error('The client list was incomplete. Reopen this window to retry.');
      rows.push(...batch); page++;
    }
    if (!alive) return;
    const unique = [...new Map(rows.map(client => [Number(client.id), client])).values()];
    const selected = Number(current.value.id);
    if (!unique.some(client => Number(client.id) === selected)) unique.unshift(props.initialClient);
    queue.value = unique; index.value = unique.findIndex(client => Number(client.id) === selected);
  } catch (err) { if (alive) error.value = err.response?.data?.error?.message || err.message || 'Clients could not be loaded.'; }
  finally { if (alive) loading.value = false; }
});
onBeforeUnmount(() => { alive = false; });
</script>
<style scoped>
.chart-update-backdrop { position: fixed; inset: 0; background: #0f172a80; z-index: 3600; display: flex; justify-content: center; padding: 24px; }
.chart-update-modal { width: min(1100px, 100%); overflow-y: auto; background: #fff; border-radius: 14px; padding: 22px; }
header { display: flex; align-items: start; justify-content: space-between; gap: 12px; } h2 { margin: 0; } header p { color: #526777; }
nav { position: sticky; top: -22px; background: #fff; z-index: 1; display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid #e2e8f0; } nav select { flex: 1; min-width: 0; padding: 8px; } button { padding: 8px 12px; cursor: pointer; }
.error { color: #b91c1c; } @media(max-width:600px) { .chart-update-backdrop { padding: 8px; }.chart-update-modal { padding: 12px; } nav { flex-wrap: wrap; } nav select { order: -1; flex-basis: 100%; } }
</style>
