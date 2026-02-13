<template>
  <div class="management-team-config">
    <div class="section-header">
      <h2>Management Team</h2>
      <p class="section-description">
        Assign platform staff (staff, admin, super_admin) who appear as this agency's management team.
        Agency users will see these people in a circle with presence status on their Management Team page.
      </p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency to configure its management team.</p>
    </div>

    <div v-else>
      <div class="agency-badge">
        <span>{{ agencyName }}</span>
      </div>

      <div class="members-section">
        <h3>Team Members</h3>
        <p class="hint">Drag to reorder. Add members from the dropdown below.</p>

        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="configError" class="error">{{ configError }}</div>

        <div v-else class="members-list">
          <div
            v-for="(m, idx) in members"
            :key="m.user_id"
            class="member-row"
          >
            <span class="member-order">{{ idx + 1 }}</span>
            <span class="member-name">{{ m.first_name }} {{ m.last_name }}</span>
            <span class="member-role">{{ m.role }}</span>
            <input
              v-model="m.display_role"
              type="text"
              class="display-role-input"
              placeholder="Display role (e.g. Account Manager)"
              maxlength="80"
            />
            <button
              type="button"
              class="btn btn-sm btn-danger"
              @click="removeMember(idx)"
            >
              Remove
            </button>
          </div>
          <div v-if="members.length === 0" class="empty-members">
            No team members assigned. Add members below.
          </div>
        </div>

        <div class="add-section">
          <select v-model="selectedUserId" class="form-select">
            <option value="">Add a team member…</option>
            <option
              v-for="u in eligibleUsers"
              :key="u.id"
              :value="String(u.id)"
              :disabled="members.some((m) => m.user_id === u.id)"
            >
              {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
            </option>
          </select>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!selectedUserId || saving"
            @click="addMember"
          >
            Add
          </button>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving || !hasChanges"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const agencyId = computed(() => agencyStore.currentAgency?.id || null);
const agencyName = computed(() => agencyStore.currentAgency?.name || 'Agency');

const loading = ref(false);
const configError = ref('');
const members = ref([]);
const originalMembers = ref([]);
const eligibleUsers = ref([]);
const selectedUserId = ref('');
const saving = ref(false);

const hasChanges = computed(() => {
  const a = JSON.stringify(members.value.map((m) => ({ user_id: m.user_id, display_role: m.display_role })));
  const b = JSON.stringify(originalMembers.value.map((m) => ({ user_id: m.user_id, display_role: m.display_role })));
  return a !== b;
});

async function fetchConfig() {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    configError.value = '';
    const res = await api.get(`/agencies/${agencyId.value}/management-team/config`);
    members.value = (res.data || []).map((m) => ({ ...m, display_role: m.display_role || '' }));
    originalMembers.value = members.value.map((m) => ({ ...m }));
  } catch (e) {
    configError.value = e.response?.data?.error?.message || 'Failed to load';
    members.value = [];
    originalMembers.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchEligibleUsers() {
  try {
    const res = await api.get('/agencies/management-team/eligible-users');
    eligibleUsers.value = res.data || [];
  } catch {
    eligibleUsers.value = [];
  }
}

function addMember() {
  const uid = parseInt(selectedUserId.value, 10);
  if (!uid) return;
  const u = eligibleUsers.value.find((e) => e.id === uid);
  if (!u || members.value.some((m) => m.user_id === uid)) return;
  members.value.push({
    user_id: uid,
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
    role: u.role,
    display_role: ''
  });
  selectedUserId.value = '';
}

function removeMember(idx) {
  members.value.splice(idx, 1);
}

async function save() {
  if (!agencyId.value || saving.value) return;
  try {
    saving.value = true;
    const payload = members.value.map((m, i) => ({
      userId: m.user_id,
      displayRole: m.display_role?.trim() || null,
      displayOrder: i
    }));
    await api.put(`/agencies/${agencyId.value}/management-team/config`, { members: payload });
    originalMembers.value = members.value.map((m) => ({ ...m }));
  } catch (e) {
    configError.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(agencyId, () => {
  fetchConfig();
});

onMounted(() => {
  fetchEligibleUsers();
  if (agencyId.value) fetchConfig();
});
</script>

<style scoped>
.management-team-config {
  padding: 0 0 24px;
}

.section-header h2 {
  margin: 0 0 8px;
  font-size: 1.25rem;
}

.section-description {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0 0 16px;
}

.agency-badge {
  background: var(--bg-alt);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-weight: 500;
}

.members-section h3 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.members-list {
  margin-bottom: 16px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-alt);
  border-radius: 8px;
  margin-bottom: 8px;
}

.member-order {
  font-weight: 600;
  min-width: 24px;
  color: var(--text-secondary);
}

.member-name {
  font-weight: 500;
  min-width: 140px;
}

.member-role {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 80px;
}

.display-role-input {
  flex: 1;
  max-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
}

.add-section {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
}

.add-section .form-select {
  flex: 1;
  max-width: 300px;
}

.actions {
  margin-top: 20px;
}

.empty-state,
.loading,
.error {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.error {
  color: var(--danger);
}

.empty-members {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-alt);
  border-radius: 8px;
}
</style>
