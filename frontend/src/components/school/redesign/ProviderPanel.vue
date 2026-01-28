<template>
  <div class="panel">
    <div class="panel-header">
      <div class="left">
        <div class="name">{{ provider.last_name }}, {{ provider.first_name }}</div>
        <div class="meta">
          <span v-if="provider.slots_total != null" class="badge badge-secondary">
            {{ (provider.slots_used ?? 0) }} / {{ provider.slots_total }} assigned
          </span>
          <span v-if="provider.start_time || provider.end_time" class="badge badge-secondary">
            {{ (provider.start_time || '—').toString().slice(0, 5) }}–{{ (provider.end_time || '—').toString().slice(0, 5) }}
          </span>
        </div>
      </div>
      <div class="right">
        <label class="section">
          Section
          <select v-model="selectedSection" class="section-select">
            <option value="all">All</option>
            <option value="morning">Morning</option>
            <option value="lunch">Lunch</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </label>
        <button class="btn btn-secondary btn-sm" type="button" @click="collapsed = !collapsed">
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('open-provider', provider.provider_user_id)">
          Provider profile
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="collapsed" class="collapsed-hint">
      <span class="muted">Hidden.</span>
      <span class="muted">Caseload: {{ (caseloadClients || []).length }}</span>
    </div>
    <div v-else class="content">
      <div class="caseload">
        <div class="section-title">Caseload</div>
        <ClientInitialsList
          :clients="caseloadClients"
          :client-label-mode="clientLabelMode"
          @select="$emit('open-client', $event)"
        />
      </div>

      <SoftScheduleEditor
        class="schedule"
        :slots="slots"
        :caseload-clients="caseloadClients"
        :client-label-mode="clientLabelMode"
        :saving="saving"
        :error="error"
        @save="$emit('save-slots', $event)"
        @move="$emit('move-slot', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ClientInitialsList from './ClientInitialsList.vue';
import SoftScheduleEditor from './SoftScheduleEditor.vue';

defineProps({
  provider: { type: Object, required: true },
  caseloadClients: { type: Array, default: () => [] },
  slots: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  clientLabelMode: { type: String, default: 'codes' }
});

defineEmits(['open-client', 'save-slots', 'move-slot', 'open-provider']);

const selectedSection = ref('all');
const collapsed = ref(false);
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 10px;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}
.right {
  display: flex;
  gap: 10px;
  align-items: end;
}
.section {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.section-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  color: var(--text-primary);
  min-width: 140px;
}
.name {
  font-weight: 900;
  color: var(--text-primary);
  font-size: 16px;
}
.meta {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.caseload {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px;
}
.section-title {
  font-weight: 900;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.loading {
  color: var(--text-secondary);
  padding: 10px 0;
}
.collapsed-hint {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--text-secondary);
  padding: 10px 0;
}
.muted {
  font-size: 12px;
  color: var(--text-secondary);
}
@media (max-width: 1050px) {
  .content {
    flex-direction: column;
  }
}
</style>

