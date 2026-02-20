<template>
  <div class="member-manager-overlay" @click.self="$emit('close')">
    <div class="member-manager-modal">
      <div class="member-manager-header">
        <h3 class="member-manager-title">Manage: {{ list?.name }}</h3>
        <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <div class="add-member-section">
        <h4>Add member</h4>
        <div class="add-member-row">
          <select v-model="selectedUserId" class="form-control">
            <option :value="null">Select user…</option>
            <option v-for="u in availableUsers" :key="u.id" :value="u.id">
              {{ getUserLabel(u) }}
            </option>
          </select>
          <select v-model="selectedRole" class="form-control form-control-sm">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!selectedUserId || adding"
            @click="addMember"
          >
            {{ adding ? '…' : 'Add' }}
          </button>
        </div>
      </div>

      <div class="members-list-section">
        <h4>Members</h4>
        <ul v-if="members.length > 0" class="members-list">
          <li v-for="m in members" :key="m.user_id" class="member-row">
            <span class="member-name">{{ memberLabel(m) }}</span>
            <span class="member-role">{{ m.role }}</span>
            <button
              v-if="canRemove(m)"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="removingId === m.user_id"
              @click="removeMember(m)"
            >
              {{ removingId === m.user_id ? '…' : 'Remove' }}
            </button>
          </li>
        </ul>
        <div v-else class="members-empty">No members.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  list: { type: Object, required: true }
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id);

const members = ref([]);
const availableUsers = ref([]);
const selectedUserId = ref(null);
const selectedRole = ref('viewer');
const adding = ref(false);
const removingId = ref(null);

const memberLabel = (m) => {
  const fn = m.first_name || m.user_first_name || '';
  const ln = m.last_name || m.user_last_name || '';
  return [fn, ln].filter(Boolean).join(' ') || `User ${m.user_id}`;
};

const getUserLabel = (u) => {
  const first = u?.first_name ?? u?.firstName ?? '';
  const last = u?.last_name ?? u?.lastName ?? '';
  const email = u?.email ?? '';
  const name = `${first} ${last}`.trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return `User #${u?.id ?? ''}`.trim();
};

const canRemove = (m) => {
  if (Number(m.user_id) === Number(currentUserId.value)) return false;
  return true;
};

const fetchMembers = async () => {
  if (!props.list?.id) return;
  try {
    const res = await api.get(`/task-lists/${props.list.id}`);
    members.value = res.data?.members || [];
  } catch (err) {
    console.error('Failed to fetch members:', err);
    members.value = [];
  }
};

const fetchAgencyUsers = async () => {
  if (!props.list?.id) {
    availableUsers.value = [];
    return;
  }
  try {
    const res = await api.get(`/task-lists/${props.list.id}/agency-users`);
    const users = Array.isArray(res.data) ? res.data : [];
    const memberIds = new Set(members.value.map((m) => Number(m.user_id)));
    availableUsers.value = users.filter((u) => !memberIds.has(Number(u.id)));
  } catch (err) {
    console.error('Failed to fetch agency users:', err);
    availableUsers.value = [];
  }
};

const addMember = async () => {
  if (!selectedUserId.value || !props.list?.id) return;
  adding.value = true;
  try {
    await api.post(`/task-lists/${props.list.id}/members`, {
      userId: selectedUserId.value,
      role: selectedRole.value || 'viewer'
    });
    selectedUserId.value = null;
    selectedRole.value = 'viewer';
    await fetchMembers();
    await fetchAgencyUsers();
    emit('updated');
  } catch (err) {
    console.error('Failed to add member:', err);
  } finally {
    adding.value = false;
  }
};

const removeMember = async (m) => {
  if (!props.list?.id) return;
  removingId.value = m.user_id;
  try {
    await api.delete(`/task-lists/${props.list.id}/members/${m.user_id}`);
    await fetchMembers();
    await fetchAgencyUsers();
    emit('updated');
  } catch (err) {
    console.error('Failed to remove member:', err);
  } finally {
    removingId.value = null;
  }
};

onMounted(async () => {
  await fetchMembers();
  await fetchAgencyUsers();
});
watch(() => props.list?.id, async () => {
  await fetchMembers();
  await fetchAgencyUsers();
});
</script>

<style scoped>
.member-manager-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.member-manager-modal {
  background: white;
  border-radius: 12px;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
  padding: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.member-manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.member-manager-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}

.btn-close:hover {
  color: #1f2937;
}

.add-member-section h4,
.members-list-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.add-member-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.add-member-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.add-member-row select:first-child {
  flex: 1;
  min-width: 160px;
}

.members-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}

.member-name {
  flex: 1;
}

.member-role {
  font-size: 12px;
  color: #6b7280;
}

.members-empty {
  color: #6b7280;
  font-size: 14px;
  padding: 12px 0;
}
</style>
