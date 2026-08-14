<template>
  <div class="cnd-panel">
    <div class="cnd-header">
      <div>
        <h2 class="cnd-title">Possible name duplicates</h2>
        <p class="cnd-sub">
          Internal review by first and last name. Nothing is merged automatically — open the records and decide.
        </p>
      </div>
      <label class="cnd-include">
        <input v-model="includeArchived" type="checkbox" @change="loadGroups" />
        Include archived
      </label>
    </div>

    <p v-if="!agencyId" class="cnd-empty">Pick a tenant to scan for first-and-last-name duplicates.</p>
    <p v-else-if="loading" class="cnd-empty">Scanning names…</p>
    <p v-else-if="error" class="cnd-error">{{ error }}</p>
    <p v-else-if="!groups.length" class="cnd-empty">No first-and-last-name duplicates found for this tenant.</p>

    <div v-else class="cnd-groups">
      <article v-for="group in groups" :key="group.key" class="cnd-group">
        <header class="cnd-group-head">
          <div>
            <strong class="cnd-name">{{ displayName(group) }}</strong>
            <span class="cnd-count">{{ group.memberCount }} records</span>
          </div>
          <span class="cnd-confidence" :class="`cnd-confidence--${group.confidence}`">
            {{ confidenceLabel(group.confidence) }}
          </span>
        </header>
        <table class="cnd-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Initials</th>
              <th>School</th>
              <th>DOB</th>
              <th>Status</th>
              <th>Provider</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in group.members" :key="member.id">
              <td>{{ member.full_name || '—' }}</td>
              <td>{{ member.initials || '—' }}</td>
              <td>{{ member.organization_name || '—' }}</td>
              <td>{{ formatDob(member.date_of_birth) }}</td>
              <td>{{ member.client_status_label || member.status || '—' }}</td>
              <td>{{ member.provider_name || '—' }}</td>
              <td>
                <button type="button" class="cnd-open" @click="$emit('open-client', member)">Open</button>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

defineEmits(['open-client']);

const groups = ref([]);
const loading = ref(false);
const error = ref('');
const includeArchived = ref(false);

function displayName(group) {
  const first = String(group?.firstName || '');
  const last = String(group?.lastName || '');
  return `${first} ${last}`.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function confidenceLabel(value) {
  if (value === 'high') return 'Same name + DOB';
  if (value === 'medium') return 'Same name + school';
  return 'Same first and last name';
}

function formatDob(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  return raw.slice(0, 10);
}

async function loadGroups() {
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0) {
    groups.value = [];
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/clients/name-duplicates', {
      params: { agencyId: aid, includeArchived: includeArchived.value },
      skipGlobalLoading: true
    });
    groups.value = Array.isArray(res.data?.groups) ? res.data.groups : [];
  } catch (e) {
    groups.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not scan for name duplicates.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.agencyId, loadGroups, { immediate: true });

defineExpose({ loadGroups, groups });
</script>

<style scoped>
.cnd-panel { display: grid; gap: 16px; }
.cnd-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.cnd-title { margin: 0 0 4px; font-size: 1.15rem; }
.cnd-sub { margin: 0; color: var(--text-secondary, #6b7280); font-size: 13px; max-width: 46rem; }
.cnd-include { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary, #4b5563); }
.cnd-empty, .cnd-error { margin: 0; color: var(--text-secondary, #6b7280); }
.cnd-error { color: #b91c1c; }
.cnd-groups { display: grid; gap: 14px; }
.cnd-group {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.cnd-group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.cnd-name { text-transform: capitalize; }
.cnd-count { margin-left: 8px; color: var(--text-secondary, #6b7280); font-size: 12px; font-weight: 600; }
.cnd-confidence {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 4px 8px;
}
.cnd-confidence--high { background: #fee2e2; color: #991b1b; }
.cnd-confidence--medium { background: #ffedd5; color: #9a3412; }
.cnd-confidence--low { background: #e5e7eb; color: #374151; }
.cnd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cnd-table th, .cnd-table td { text-align: left; padding: 8px 12px; border-top: 1px solid #f1f5f9; }
.cnd-table th { color: var(--text-secondary, #6b7280); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.cnd-open {
  border: 0;
  background: transparent;
  color: var(--primary, #2d6a4f);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
</style>
