<template>
  <div class="office-intake-queue">
    <div class="oiq-header">
      <div>
        <h2 style="margin: 0;">New office clients</h2>
        <p class="muted" style="margin: 4px 0 0;">
          Clinical/learning clients from digital intake awaiting their first provider assignment.
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="loadAll" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="acceptance?.agency" class="oiq-acceptance">
      <div class="oiq-acceptance__summary">
        <strong>Office referral acceptance</strong>
        <span>{{ acceptance.agency.acceptanceLabel }}</span>
        <span class="muted small">
          Declined = posted to Client Exchange within {{ acceptance.windowDays || 30 }} days of assignment.
          Accepted = kept (marked current or past the window without an early exchange).
        </span>
      </div>
      <div class="oiq-acceptance__stats">
        <div><span class="lbl">Referred</span><strong>{{ acceptance.agency.assignedCount || 0 }}</strong></div>
        <div><span class="lbl">Accepted</span><strong>{{ acceptance.agency.acceptedCount || 0 }}</strong></div>
        <div><span class="lbl">Declined (exchange)</span><strong>{{ acceptance.agency.declinedCount || 0 }}</strong></div>
        <div><span class="lbl">In review window</span><strong>{{ acceptance.agency.pendingCount || 0 }}</strong></div>
      </div>
      <div v-if="acceptance.providers?.length" class="oiq-acceptance__table-wrap">
        <table class="oiq-table compact">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Accepted</th>
              <th>Declined</th>
              <th>Pending</th>
              <th>Ratio</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in acceptance.providers" :key="p.providerUserId">
              <td>{{ p.providerName }}</td>
              <td>{{ p.acceptedCount }}</td>
              <td>{{ p.declinedCount }}</td>
              <td>{{ p.pendingCount }}</td>
              <td>{{ p.acceptanceLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="!loading && clients.length === 0" class="muted empty-state">
      No pending office clients right now.
    </div>

    <div v-else class="oiq-table-wrap">
      <table class="oiq-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Type</th>
            <th>Submitted</th>
            <th>Preferences</th>
            <th>Contact</th>
            <th>Assign provider</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id">
            <td>{{ c.fullName || c.initials || `Client #${c.id}` }}</td>
            <td>{{ c.clientType === 'clinical' ? 'Office / Clinical' : 'Learning' }}</td>
            <td>{{ formatDate(c.createdAt) }}</td>
            <td>
              <div v-if="c.intakePreferences" class="oiq-prefs">
                <span v-if="c.intakePreferences.preferredDays?.length">
                  Days: {{ c.intakePreferences.preferredDays.join(', ') }}
                </span>
                <span v-if="c.intakePreferences.preferredTimeOfDay">
                  Time: {{ c.intakePreferences.preferredTimeOfDay }}
                </span>
                <span v-if="c.intakePreferences.preferredModality">
                  Modality: {{ c.intakePreferences.preferredModality }}
                </span>
                <span v-if="c.intakePreferences.presentingConcern">
                  Concern: {{ c.intakePreferences.presentingConcern }}
                </span>
              </div>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ c.contactPhone || '—' }}</td>
            <td>
              <div class="oiq-assign">
                <select v-model="assignSelections[c.id]" class="select select-sm">
                  <option value="">Select provider…</option>
                  <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
                    {{ p.first_name }} {{ p.last_name }}
                  </option>
                </select>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="!assignSelections[c.id] || assigningId === c.id"
                  @click="assign(c)"
                >
                  {{ assigningId === c.id ? 'Assigning…' : 'Assign' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const loading = ref(false);
const error = ref('');
const clients = ref([]);
const providerOptions = ref([]);
const assignSelections = reactive({});
const assigningId = ref(null);
const acceptance = ref(null);

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

async function loadProviders() {
  try {
    const res = await api.get('/users');
    const all = res.data || [];
    providerOptions.value = all
      .filter((u) => ['provider', 'provider_plus'].includes(String(u.role || '').toLowerCase()))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  } catch {
    providerOptions.value = [];
  }
}

async function loadAcceptance() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/client-exchange/acceptance-metrics', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true,
    });
    acceptance.value = res.data || null;
  } catch {
    acceptance.value = null;
  }
}

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/client-exchange/pending-office-clients', { params: { agencyId: agencyId.value } });
    clients.value = res.data?.clients || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending office clients';
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  await Promise.all([load(), loadAcceptance()]);
}

async function assign(client) {
  const providerId = assignSelections[client.id];
  if (!providerId) return;
  assigningId.value = client.id;
  try {
    await api.put(`/clients/${client.id}/provider`, { provider_id: Number(providerId) });
    await loadAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to assign provider';
  } finally {
    assigningId.value = null;
  }
}

onMounted(() => {
  loadAll();
  loadProviders();
});
</script>

<style scoped>
.office-intake-queue {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.oiq-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.oiq-acceptance {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}
.oiq-acceptance__summary {
  display: grid;
  gap: 2px;
}
.oiq-acceptance__summary strong {
  color: #0c4a6e;
}
.oiq-acceptance__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.oiq-acceptance__stats > div {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
}
.oiq-acceptance__stats .lbl {
  display: block;
  font-size: 11px;
  color: #64748b;
}
.oiq-acceptance__table-wrap {
  overflow-x: auto;
}
.oiq-table.compact th,
.oiq-table.compact td {
  font-size: 12px;
  padding: 6px 8px;
}
.small { font-size: 12px; }
.oiq-table-wrap {
  overflow-x: auto;
}
.oiq-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
}
.oiq-table th,
.oiq-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 8px 10px;
  text-align: left;
  font-size: 13px;
  vertical-align: top;
}
.oiq-prefs {
  display: grid;
  gap: 2px;
  font-size: 12px;
  color: var(--text-secondary, #475569);
}
.oiq-assign {
  display: flex;
  gap: 6px;
  align-items: center;
}
.select-sm {
  padding: 6px 8px;
  min-width: 160px;
}
.select {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--bg, #fff);
}
.empty-state {
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary, #64748b);
}
</style>
