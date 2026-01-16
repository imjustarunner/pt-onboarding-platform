<template>
  <div class="page">
    <div class="page-header">
      <h1>Provider Scheduling</h1>
      <p class="page-description">Assign providers to schools/days with slot counts. Client assignments decrement available slots.</p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="form-row">
        <div class="field">
          <label>Provider</label>
          <select v-model="form.providerUserId" class="select">
            <option value="">Select…</option>
            <option v-for="p in providers" :key="p.id" :value="String(p.id)">
              {{ p.last_name }}, {{ p.first_name }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>School</label>
          <select v-model="form.schoolOrganizationId" class="select">
            <option value="">Select…</option>
            <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Day</label>
          <select v-model="form.dayOfWeek" class="select">
            <option value="">Select…</option>
            <option v-for="d in days" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <div class="field">
          <label>Slots total</label>
          <input v-model.number="form.slotsTotal" type="number" min="0" class="input" />
        </div>
        <div class="field">
          <label>Active</label>
          <label class="toggle">
            <input type="checkbox" v-model="form.isActive" />
            <span />
          </label>
        </div>
        <div class="actions">
          <button class="btn btn-primary" @click="save" :disabled="saving">Save</button>
          <button class="btn btn-secondary" @click="reload" :disabled="loading">Refresh</button>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="grid">
        <div class="card">
          <h2>Assignments</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>School</th>
                  <th>Day</th>
                  <th>Slots total</th>
                  <th>Slots available</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in assignments" :key="a.id">
                  <td>{{ a.provider_last_name }}, {{ a.provider_first_name }}</td>
                  <td>{{ a.school_name }}</td>
                  <td>{{ a.day_of_week }}</td>
                  <td>{{ a.slots_total }}</td>
                  <td>{{ a.slots_available }}</td>
                  <td>{{ a.is_active ? 'Yes' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Availability report</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Day</th>
                  <th>Slots total</th>
                  <th>Slots available</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in report" :key="`${r.school_organization_id}-${r.day_of_week}`">
                  <td>{{ r.school_name }}</td>
                  <td>{{ r.day_of_week }}</td>
                  <td>{{ r.slots_total }}</td>
                  <td>{{ r.slots_available }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const providers = ref([]);
const schools = ref([]);
const assignments = ref([]);
const report = ref([]);

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const form = ref({
  providerUserId: '',
  schoolOrganizationId: '',
  dayOfWeek: '',
  slotsTotal: 0,
  isActive: true
});

const reload = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';

    const [provResp, schoolsResp, assignmentsResp, reportResp] = await Promise.all([
      api.get('/provider-scheduling/providers', { params: { agencyId: agencyId.value } }),
      api.get(`/agencies/${agencyId.value}/schools`),
      api.get('/provider-scheduling/assignments', { params: { agencyId: agencyId.value } }),
      api.get('/provider-scheduling/report', { params: { agencyId: agencyId.value } })
    ]);

    providers.value = provResp.data || [];
    schools.value = schoolsResp.data || [];
    assignments.value = assignmentsResp.data || [];
    report.value = reportResp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider scheduling';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!agencyId.value) return;
  if (!form.value.providerUserId || !form.value.schoolOrganizationId || !form.value.dayOfWeek) {
    error.value = 'Provider, school, and day are required.';
    return;
  }
  try {
    saving.value = true;
    error.value = '';
    await api.post('/provider-scheduling/assignments', {
      agencyId: agencyId.value,
      providerUserId: Number(form.value.providerUserId),
      schoolOrganizationId: Number(form.value.schoolOrganizationId),
      dayOfWeek: form.value.dayOfWeek,
      slotsTotal: Number(form.value.slotsTotal || 0),
      isActive: !!form.value.isActive
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save assignment';
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  await reload();
});

watch(agencyId, async () => {
  await reload();
});
</script>

<style scoped>
.page {
  width: 100%;
}
.page-header h1 {
  margin: 0;
}
.page-description {
  margin: 8px 0 0;
  color: var(--text-secondary);
}
.panel {
  margin-top: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(160px, 1fr)) auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.input,
.select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 1100px) {
  .grid {
    grid-template-columns: 1.2fr 1fr;
  }
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}
.card h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: middle;
}
.loading {
  padding: 12px;
}
.error {
  color: var(--danger);
  padding: 10px 0;
}
.empty-state {
  padding: 16px;
  color: var(--text-secondary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>

