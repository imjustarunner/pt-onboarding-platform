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

      <div v-if="providers.length > 0" class="schedule-disclaimer schedule-disclaimer-left">
        <div class="schedule-disclaimer-title">Schedule Disclaimer</div>
        <div class="schedule-disclaimer-text">
          The schedules shown on this page are intended as a soft schedule for planning and communication purposes only. They do not update,
          override, or form part of the provider’s official health record system.
        </div>
        <div class="schedule-disclaimer-text">
          This page is intended for school staff responsible for scheduling, if such scheduling is required. Schools may use this space to
          document a provider’s expected schedule and include relevant notes (e.g., pick-up details or special instructions) to support clarity
          and coordination.
        </div>
        <div class="schedule-disclaimer-text">
          Providers are not required to set or maintain a schedule here unless requested by the school. If a school chooses to set a provider
          schedule, it should be done on this page for shared visibility and communication.
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
      <div v-if="loadingProviders" class="loading loading-centered">
        <div class="spinner" aria-hidden="true"></div>
        <div>
          <div class="loading-title">Loading schedules…</div>
          <div class="loading-sub">Pulling caseload + soft schedules for this day.</div>
        </div>
      </div>
      <div v-else-if="providersError" class="error">{{ providersError }}</div>
      <div v-else-if="providers.length === 0" class="empty-right">
        Select “Add Day” to start scheduling this day.
      </div>
      <div v-else>
        <div v-if="anyPanelLoading" class="inline-loading">
          <div class="spinner sm" aria-hidden="true"></div>
          <div class="inline-loading-text">Loading provider schedules…</div>
        </div>

        <div class="provider-panels">
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
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
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

const anyPanelLoading = computed(() => {
  const list = Array.isArray(props.providers) ? props.providers : [];
  for (const p of list) {
    const st = props.panelFor?.(p?.provider_user_id);
    if (st?.loading) return true;
  }
  return false;
});

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
.inline-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 8px;
}
.inline-loading-text {
  white-space: nowrap;
}
.spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(0,0,0,0.12);
  border-top-color: rgba(79, 70, 229, 0.85);
  animation: spin 0.85s linear infinite;
  flex: 0 0 auto;
}
.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
.loading-centered {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}
.loading-title {
  font-weight: 950;
  color: var(--text-primary);
}
.loading-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.schedule-disclaimer {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  padding: 12px 12px;
}
.schedule-disclaimer-left {
  margin-top: 10px;
}
.schedule-disclaimer-title {
  font-weight: 950;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.schedule-disclaimer-text {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  margin-top: 6px;
}
.schedule-disclaimer-text:first-of-type {
  margin-top: 0;
}
.schedule-disclaimer-title + .schedule-disclaimer-text {
  margin-top: 0;
}
.schedule-disclaimer {
  margin-bottom: 0;
}
.error {
  color: #c33;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

