<template>
  <div class="clinical-supervision-panel">
    <p class="muted ci-panel-hint">
      Supervisor assignments and clinical supervision notes. Pre-licensed hour tracking for payroll remains under
      <strong>Account → Agency Assignments</strong> when applicable.
    </p>

    <section class="csp-section">
      <h3>Supervisor assignments</h3>
      <p class="muted csp-section-hint">
        Assignments for this person as the <strong>supervisee</strong> (who supervises them). Clinical, manager, and billing
        types are separate; primary usually marks the main clinical supervisor.
      </p>
      <div v-if="canManageAssignments" class="csp-assignments">
        <SupervisorAssignmentManager :supervisee-id="userId" @changed="emit('changed')" />
      </div>
      <div v-else class="csp-readonly">
        <h4>Assigned supervisors</h4>
        <div v-if="supervisorsLoading" class="muted">Loading…</div>
        <ul v-else-if="supervisors.length" class="csp-list">
          <li v-for="row in supervisors" :key="row.id">
            {{ row.supervisor_first_name }} {{ row.supervisor_last_name }}
            <span class="csp-pill">{{ supervisorTypeLabel(row.supervisor_type) }}</span>
            <span v-if="row.is_primary" class="csp-pill csp-pill--primary">Primary</span>
            <small>{{ row.supervisor_email }}</small>
          </li>
        </ul>
        <p v-else class="muted">No supervisors assigned.</p>
      </div>
    </section>

    <section v-if="isSupervisorRole" class="csp-section">
      <h3>People they supervise</h3>
      <div class="csp-readonly">
        <div v-if="superviseesLoading" class="muted">Loading…</div>
        <ul v-else-if="supervisees.length" class="csp-list">
          <li v-for="row in supervisees" :key="row.id">
            {{ row.supervisee_first_name }} {{ row.supervisee_last_name }}
            <span class="csp-pill">{{ supervisorTypeLabel(row.supervisor_type) }}</span>
            <small>{{ row.supervisee_email }}</small>
          </li>
        </ul>
        <p v-else class="muted">No supervisees assigned.</p>
      </div>
    </section>

    <section class="csp-section">
      <h3>Supervision notes</h3>
      <ProviderInfoTab
        :user-id="userId"
        embedded
        ensure-empty-fields
        :field-keys="noteFieldKeys"
        panel-title="Clinical supervision notes"
        :clinical-filter="true"
      />
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProviderInfoTab from '../ProviderInfoTab.vue';
import SupervisorAssignmentManager from '../SupervisorAssignmentManager.vue';
import { isSupervisor } from '../../../utils/helpers.js';
import { supervisorTypeLabel } from '../../../constants/supervisorTypes.js';

const props = defineProps({
  userId: { type: Number, required: true },
  user: { type: Object, default: null },
  canManageAssignments: { type: Boolean, default: false },
  supervisors: { type: Array, default: () => [] },
  supervisees: { type: Array, default: () => [] },
  supervisorsLoading: { type: Boolean, default: false },
  superviseesLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['changed']);

const noteFieldKeys = ['provider_clinician_notes', 'supervision_notes'];

const isSupervisorRole = computed(
  () => isSupervisor(props.user) || props.user?.role === 'clinical_practice_assistant'
);
</script>

<style scoped>
.clinical-supervision-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ci-panel-hint {
  font-size: 13px;
  margin: 0;
}
.csp-section h3 {
  margin: 0 0 10px;
  font-size: 16px;
}
.csp-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.csp-section-hint {
  font-size: 13px;
  margin: 0 0 12px;
}
.csp-list {
  margin: 0;
  padding-left: 18px;
}
.csp-list li {
  margin-bottom: 6px;
}
.csp-list small {
  display: block;
  color: var(--text-secondary);
}
.csp-pill {
  font-size: 10px;
  font-weight: 700;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 1px 6px;
  border-radius: 999px;
  margin-left: 4px;
}
.csp-pill--primary {
  background: #dcfce7;
  color: #166534;
}
</style>
