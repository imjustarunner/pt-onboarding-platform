<template>
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title">
        <div style="font-weight: 800;">School staff</div>
        <div class="panel-subtitle">Accounts linked to this school portal</div>
      </div>
      <div class="panel-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <a v-if="canManageTickets" class="btn btn-secondary btn-sm" :href="ticketsHref">
          Support tickets
        </a>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="staff.length === 0" class="muted">No school staff users found.</div>

    <div v-else class="grid">
      <div v-for="u in staff" :key="u.id" class="card">
        <div class="card-top">
          <div class="name">
            {{ [u.first_name, u.last_name].filter(Boolean).join(' ') || 'School staff' }}
          </div>
          <div class="meta">{{ u.email }}</div>
        </div>

        <div class="card-actions">
          <button
            v-if="canRemove"
            class="btn btn-danger btn-sm"
            type="button"
            @click="removeUser(u)"
            :disabled="removingId === u.id"
          >
            {{ removingId === u.id ? 'Removing…' : 'Remove' }}
          </button>

          <button
            v-if="canRequest"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="requestDeletionFor(u)"
            :disabled="submitting"
          >
            Request deletion
          </button>
        </div>
      </div>
    </div>

    <div v-if="canRequest" class="request-box">
      <div style="font-weight: 800; margin-bottom: 8px;">Request an additional account</div>
      <div class="row">
        <label class="field">
          Name (optional)
          <input v-model="requestName" class="input" type="text" placeholder="e.g., Jane Doe" />
        </label>
        <label class="field">
          Email (optional)
          <input v-model="requestEmail" class="input" type="email" placeholder="e.g., jane@school.org" />
        </label>
      </div>
      <button class="btn btn-primary btn-sm" type="button" @click="submitNewAccountRequest" :disabled="submitting">
        {{ submitting ? 'Sending…' : 'Request additional login' }}
      </button>
      <div v-if="success" class="success">{{ success }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  schoolName: { type: String, default: '' }
});

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());

const canRequest = computed(() => roleNorm.value === 'school_staff');
const canRemove = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));
const canManageTickets = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));

const ticketsHref = computed(() => `/admin/support-tickets?schoolOrganizationId=${encodeURIComponent(props.schoolOrganizationId)}`);

const staff = ref([]);
const loading = ref(false);
const error = ref('');
const removingId = ref(null);

const submitting = ref(false);
const requestName = ref('');
const requestEmail = ref('');
const success = ref('');

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/school-staff`);
    staff.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load school staff';
    staff.value = [];
  } finally {
    loading.value = false;
  }
};

const removeUser = async (u) => {
  const id = Number(u?.id);
  if (!id) return;
  if (!confirm(`Remove ${u.email || 'this user'} from ${props.schoolName || 'this school'}?`)) return;
  try {
    removingId.value = id;
    error.value = '';
    await api.delete(`/school-portal/${props.schoolOrganizationId}/school-staff/${id}`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove user';
  } finally {
    removingId.value = null;
  }
};

const submitTicket = async ({ subject, question }) => {
  await api.post('/support-tickets', {
    schoolOrganizationId: props.schoolOrganizationId,
    subject,
    question
  });
};

const submitNewAccountRequest = async () => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const name = requestName.value.trim();
    const email = requestEmail.value.trim();

    const subject = 'School staff request: additional account';
    const question = [
      `School: ${props.schoolName || props.schoolOrganizationId}`,
      '',
      'Request: additional login/account',
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null
    ]
      .filter(Boolean)
      .join('\n');

    await submitTicket({ subject, question });
    requestName.value = '';
    requestEmail.value = '';
    success.value = 'Request sent to agency staff.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit request';
  } finally {
    submitting.value = false;
  }
};

const requestDeletionFor = async (u) => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const subject = 'School staff request: delete user';
    const question = [
      `School: ${props.schoolName || props.schoolOrganizationId}`,
      '',
      'Request: delete/remove school staff user',
      `User ID: ${u.id}`,
      `Email: ${u.email || 'Unknown'}`,
      `Name: ${[u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown'}`
    ].join('\n');
    await submitTicket({ subject, question });
    success.value = 'Deletion request sent to agency staff.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit deletion request';
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  padding: 14px;
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.panel-subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.muted {
  color: var(--text-secondary);
}
.error {
  color: #b32727;
  margin-bottom: 10px;
}
.success {
  color: #1f7a2a;
  margin-top: 10px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  margin: 10px 0 14px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: white;
}
.name {
  font-weight: 800;
}
.meta {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.card-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.request-box {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
.field {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  display: block;
}
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
  margin-top: 6px;
}
@media (max-width: 820px) {
  .row { grid-template-columns: 1fr; }
}
</style>

