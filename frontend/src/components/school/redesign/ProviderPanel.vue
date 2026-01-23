<template>
  <div class="panel">
    <div class="panel-header">
      <div class="left">
        <div class="name">{{ provider.last_name }}, {{ provider.first_name }}</div>
        <div class="meta">
          <span v-if="provider.slots_total != null" class="badge badge-secondary">
            {{ provider.slots_available ?? '—' }} / {{ provider.slots_total }} slots
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
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('open-provider', provider.provider_user_id)">
          Provider profile
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else class="content">
      <div class="caseload">
        <div class="section-title">Caseload</div>
        <ClientInitialsList :clients="caseloadClients" @select="$emit('open-client', $event)" />
      </div>

      <SoftScheduleEditor
        class="schedule"
        :slots="slots"
        :caseload-clients="caseloadClients"
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
  error: { type: String, default: '' }
});

defineEmits(['open-client', 'save-slots', 'move-slot', 'open-provider']);

const selectedSection = ref('all');
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
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
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
}
.caseload {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 12px;
}
.section-title {
  font-weight: 900;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.loading {
  color: var(--text-secondary);
  padding: 10px 0;
}
@media (max-width: 1050px) {
  .content {
    grid-template-columns: 1fr;
  }
}
</style>

