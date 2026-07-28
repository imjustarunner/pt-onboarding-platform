<template>
  <div class="clinical-supervision-panel">
    <p class="muted ci-panel-hint">
      Supervisor assignments and clinical supervision notes. Pre-licensed hour tracking for payroll remains under
      <strong>Account → Agency Assignments</strong> when applicable.
    </p>

    <section class="csp-section">
      <h3>Supervisor assignments</h3>
      <div v-if="canManageAssignments" class="csp-assignments">
        <SupervisorAssignmentManager
          :supervisor-id="supervisorId"
          :supervisee-id="superviseeId"
        />
      </div>
      <div v-else>
        <div v-if="isSupervisorRole" class="csp-readonly">
          <h4>Assigned supervisees</h4>
          <div v-if="superviseesLoading" class="muted">Loading…</div>
          <ul v-else-if="supervisees.length" class="csp-list">
            <li v-for="row in supervisees" :key="row.id">
              {{ row.supervisee_first_name }} {{ row.supervisee_last_name }}
              <small>{{ row.supervisee_email }}</small>
            </li>
          </ul>
          <p v-else class="muted">No supervisees assigned.</p>
        </div>
        <div v-else class="csp-readonly">
          <h4>Assigned supervisors</h4>
          <div v-if="supervisorsLoading" class="muted">Loading…</div>
          <ul v-else-if="supervisors.length" class="csp-list">
            <li v-for="row in supervisors" :key="row.id">
              {{ row.supervisor_first_name }} {{ row.supervisor_last_name }}
              <span v-if="row.is_primary" class="csp-pill">Primary</span>
              <small>{{ row.supervisor_email }}</small>
            </li>
          </ul>
          <p v-else class="muted">No supervisors assigned.</p>
        </div>
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

const props = defineProps({
  userId: { type: Number, required: true },
  user: { type: Object, default: null },
  canManageAssignments: { type: Boolean, default: false },
  supervisors: { type: Array, default: () => [] },
  supervisees: { type: Array, default: () => [] },
  supervisorsLoading: { type: Boolean, default: false },
  superviseesLoading: { type: Boolean, default: false },
});

const noteFieldKeys = ['provider_clinician_notes', 'supervision_notes'];

const isSupervisorRole = computed(
  () => isSupervisor(props.user) || props.user?.role === 'clinical_practice_assistant'
);

const supervisorId = computed(() =>
  isSupervisorRole.value ? props.userId : null
);
const superviseeId = computed(() =>
  !isSupervisorRole.value ? props.userId : null
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
</style>
