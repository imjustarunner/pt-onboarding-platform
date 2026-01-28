<template>
  <div class="day-panel">
    <div class="left-pane">
      <div class="pane-header">
        <div>
          <div class="weekday">{{ weekday }}</div>
          <div class="hint">Providers added for this day</div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="showAddProvider = true">
            Add Provider
          </button>
        </div>
      </div>

      <div v-if="providers.length === 0" class="empty">
        <div>No providers assigned.</div>
        <button class="btn btn-primary btn-sm" type="button" @click="$emit('add-day')">Add Day</button>
      </div>

      <div v-else class="provider-list">
        <div v-for="p in providers" :key="p.provider_user_id" class="provider-card">
          <div class="name">{{ p.last_name }}, {{ p.first_name }}</div>
          <div class="meta">
            <span v-if="p.slots_total != null" class="badge badge-secondary">{{ (p.slots_used ?? 0) }} / {{ p.slots_total }} assigned</span>
            <span v-if="p.start_time || p.end_time" class="badge badge-secondary">
              {{ (p.start_time || '—').toString().slice(0, 5) }}–{{ (p.end_time || '—').toString().slice(0, 5) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="showAddProvider" class="modal-overlay" @click.self="showAddProvider = false">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <strong>Add Provider</strong>
            <button class="btn btn-secondary btn-sm" type="button" @click="showAddProvider = false">Close</button>
          </div>
          <div class="modal-body">
            <label class="label">
              Provider (must have set work hours for {{ weekday }})
              <select v-model="selectedProviderUserId" class="input">
                <option value="">Select…</option>
                <option v-for="p in eligibleProviders" :key="p.provider_user_id" :value="String(p.provider_user_id)">
                  {{ p.last_name }}, {{ p.first_name }}
                </option>
              </select>
            </label>
            <div class="modal-actions">
              <button class="btn btn-primary" type="button" :disabled="!selectedProviderUserId" @click="confirmAddProvider">
                Add Provider
              </button>
            </div>
            <div v-if="addProviderError" class="error">{{ addProviderError }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="right-pane">
      <div v-if="loadingProviders" class="loading">Loading day…</div>
      <div v-else-if="providersError" class="error">{{ providersError }}</div>
      <div v-else-if="providers.length === 0" class="empty-right">
        Select “Add Day” to start scheduling this day.
      </div>
      <div v-else class="provider-panels">
        <ProviderPanel
          v-for="p in providers"
          :key="`panel-${p.provider_user_id}`"
          :provider="p"
          :client-label-mode="clientLabelMode"
          :caseload-clients="panelFor(p.provider_user_id)?.caseloadClients || []"
          :slots="panelFor(p.provider_user_id)?.slots || []"
          :loading="panelFor(p.provider_user_id)?.loading || false"
          :saving="panelFor(p.provider_user_id)?.saving || false"
          :error="panelFor(p.provider_user_id)?.error || ''"
          @open-client="$emit('open-client', $event)"
          @save-slots="(slots) => $emit('save-slots', { providerUserId: p.provider_user_id, slots })"
          @move-slot="(evt) => $emit('move-slot', { providerUserId: p.provider_user_id, ...evt })"
          @open-provider="$emit('open-provider', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ProviderPanel from './ProviderPanel.vue';

const props = defineProps({
  weekday: { type: String, required: true },
  providers: { type: Array, default: () => [] },
  eligibleProviders: { type: Array, default: () => [] },
  loadingProviders: { type: Boolean, default: false },
  providersError: { type: String, default: '' },
  panelFor: { type: Function, required: true },
  clientLabelMode: { type: String, default: 'codes' }
});

const emit = defineEmits([
  'add-day',
  'add-provider',
  'open-client',
  'save-slots',
  'move-slot',
  'open-provider'
]);

const showAddProvider = ref(false);
const selectedProviderUserId = ref('');
const addProviderError = ref('');

const confirmAddProvider = async () => {
  try {
    addProviderError.value = '';
    await emit('add-provider', { providerUserId: Number(selectedProviderUserId.value) });
    selectedProviderUserId.value = '';
    showAddProvider.value = false;
  } catch (e) {
    addProviderError.value = e?.response?.data?.error?.message || e?.message || 'Failed to add provider';
  }
};
</script>

<style scoped>
.day-panel {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 12px;
  align-items: start;
}
.left-pane,
.right-pane {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 10px;
}
.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 10px;
}
.weekday {
  font-weight: 900;
  color: var(--text-primary);
}
.hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.provider-list {
  display: grid;
  gap: 8px;
}
.provider-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 8px;
}
.name {
  font-weight: 900;
}
.meta {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.empty,
.empty-right,
.loading {
  color: var(--text-secondary);
  padding: 12px 0;
}
.provider-panels {
  display: grid;
  gap: 10px;
}
.error {
  color: #c33;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 560px;
  max-width: 95vw;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px 16px;
}
.label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.input {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 1050px) {
  .day-panel {
    grid-template-columns: 1fr;
  }
}
</style>

