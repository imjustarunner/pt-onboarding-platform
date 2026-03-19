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
        <router-link v-if="canManageTickets" class="btn btn-secondary btn-sm" :to="ticketsPath">
          Support tickets
        </router-link>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="staff.length === 0" class="muted">No school staff users found.</div>

    <div v-else class="grid">
      <div v-for="u in staff" :key="u.id" class="card">
        <div class="card-top">
          <div class="name-row">
            <span class="name">{{ [u.first_name, u.last_name].filter(Boolean).join(' ') || 'School staff' }}</span>
            <span v-if="u.is_school_admin" class="badge badge-primary">School Admin</span>
            <span v-if="u.is_scheduler" class="badge badge-secondary">Scheduler</span>
          </div>
          <div class="meta">{{ u.email }}</div>
          <div v-if="u.last_login" class="meta meta-detail">
            Last login: {{ formatDate(u.last_login) }}
          </div>
          <div v-else class="meta meta-detail">Last login: Never</div>
          <div v-if="u.password_reset_expires_at" class="meta meta-detail">
            Reset link expires: {{ formatDate(u.password_reset_expires_at) }}
          </div>
        </div>

        <div class="card-actions">
          <button
            v-if="canEdit"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="openEdit(u)"
          >
            Edit
          </button>
          <button
            v-if="canToggleSchoolRoles(u)"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="toggleSchoolAdmin(u)"
            :disabled="settingPrimaryId === u.id"
          >
            {{ settingPrimaryId === u.id ? 'Saving…' : (u.is_school_admin ? 'Remove School Admin' : 'Make School Admin') }}
          </button>
          <button
            v-if="canToggleSchoolRoles(u)"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="toggleScheduler(u)"
            :disabled="settingSchedulerId === u.id"
          >
            {{ settingSchedulerId === u.id ? 'Saving…' : (u.is_scheduler ? 'Remove Scheduler' : 'Make Scheduler') }}
          </button>
          <button
            v-if="u.id !== currentUserId"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="openMessage(u)"
          >
            Message
          </button>

          <button
            v-if="canRemove(u)"
            class="btn btn-danger btn-sm"
            type="button"
            @click="removeUser(u)"
            :disabled="removingId === u.id"
          >
            {{ removingId === u.id ? 'Removing…' : 'Remove' }}
          </button>

          <button
            v-if="canSendReset(u)"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="sendResetPassword(u)"
            :disabled="sendingResetId === u.id"
          >
            {{ sendingResetId === u.id ? 'Sending…' : 'Send reset password' }}
          </button>

          <button
            v-if="canRequest && !canRemove(u) && !canSendReset(u)"
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

    <div v-if="canAdd" class="add-box">
      <div style="font-weight: 800; margin-bottom: 8px;">Add school staff</div>
      <div class="row">
        <label class="field">
          Name (optional)
          <input v-model="addName" class="input" type="text" placeholder="e.g., Jane Doe" />
        </label>
        <label class="field">
          Email (required)
          <input v-model="addEmail" class="input" type="email" placeholder="e.g., jane@school.org" />
        </label>
      </div>
      <div class="add-role-row">
        <label class="field add-role-field" style="margin: 0;">
          Access role
          <select v-model="addAccessRole" class="input role-select">
            <option value="standard">Standard account</option>
            <option value="school_admin">School Admin</option>
            <option value="scheduler">Scheduler</option>
            <option value="school_admin_scheduler">School Admin + Scheduler</option>
          </select>
        </label>
        <div class="role-helper">
          {{ addRoleHelperText }}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" type="button" @click="addStaff" :disabled="adding">
        {{ adding ? 'Adding…' : 'Add staff' }}
      </button>
      <div v-if="addSuccess" class="success">{{ addSuccess }}</div>
    </div>

    <div v-if="isCurrentUserSchoolAdmin" class="request-box">
      <div style="font-weight: 800; margin-bottom: 8px;">School Admin controls</div>
      <button class="btn btn-secondary btn-sm" type="button" @click="forfeitSchoolAdmin" :disabled="forfeiting">
        {{ forfeiting ? 'Saving…' : 'Forfeit School Admin (me)' }}
      </button>
    </div>

    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEdit">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Edit school staff</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeEdit">Close</button>
        </div>
        <div class="modal-body">
          <label class="field">
            First name
            <input v-model="editForm.firstName" class="input" type="text" placeholder="First name" />
          </label>
          <label class="field">
            Last name
            <input v-model="editForm.lastName" class="input" type="text" placeholder="Last name" />
          </label>
          <label class="field">
            Email
            <input v-model="editForm.email" class="input" type="email" placeholder="Email" />
          </label>
          <div class="modal-actions">
            <button class="btn btn-primary" type="button" @click="saveEdit" :disabled="savingEdit">
              {{ savingEdit ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canRequest && !canAdd" class="request-box">
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
import { useRoute, useRouter } from 'vue-router';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  schoolName: { type: String, default: '' }
});

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const currentUserId = computed(() => authStore.user?.id);

const isAgencyAdmin = computed(() =>
  ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);
const isCurrentUserSchoolAdmin = computed(() => {
  const uid = currentUserId.value;
  if (!uid) return false;
  return staff.value.some((s) => s.id === uid && s.is_school_admin);
});

const canRequest = computed(() => roleNorm.value === 'school_staff');
const canRemove = (u) =>
  isAgencyAdmin.value ||
  (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value && u.id !== currentUserId.value);
const canSendReset = (u) =>
  (isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value)) && u.id !== currentUserId.value;
const canAdd = computed(
  () => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value)
);
const canEdit = computed(() => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value));
const canToggleSchoolRoles = (u) => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value && u.id !== currentUserId.value);
const canManageTickets = computed(() =>
  ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);

const ticketsPath = computed(() => {
  const query = `schoolOrganizationId=${encodeURIComponent(props.schoolOrganizationId)}`;
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/tickets?${query}` : `/tickets?${query}`;
});

const staff = ref([]);
const loading = ref(false);
const error = ref('');
const removingId = ref(null);
const sendingResetId = ref(null);

const submitting = ref(false);
const requestName = ref('');
const requestEmail = ref('');
const success = ref('');

const adding = ref(false);
const addName = ref('');
const addEmail = ref('');
const addAccessRole = ref('standard');
const addSuccess = ref('');

const showEditModal = ref(false);
const editTarget = ref(null);
const editForm = ref({ firstName: '', lastName: '', email: '' });
const savingEdit = ref(false);
const settingPrimaryId = ref(null);
const settingSchedulerId = ref(null);
const forfeiting = ref(false);

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString();
};

const openMessage = (u) => {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'School staff';
  router.push({
    path: route.path,
    query: {
      ...route.query,
      openChatWith: String(u.id),
      agencyId: String(props.schoolOrganizationId),
      openChatWithName: name
    }
  });
};

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

const openEdit = (u) => {
  editTarget.value = u;
  editForm.value = {
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    email: u.email || ''
  };
  showEditModal.value = true;
};

const closeEdit = () => {
  showEditModal.value = false;
  editTarget.value = null;
};

const saveEdit = async () => {
  const u = editTarget.value;
  if (!u?.id) return;
  const firstName = String(editForm.value.firstName || '').trim();
  const lastName = String(editForm.value.lastName || '').trim();
  const email = String(editForm.value.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    error.value = 'Please enter a valid email address.';
    return;
  }
  try {
    savingEdit.value = true;
    error.value = '';
    await api.put(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}`, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email,
      isSchoolAdmin: !!u.is_school_admin,
      isScheduler: !!u.is_scheduler
    });
    closeEdit();
    await load();
    success.value = 'Staff updated.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update staff';
  } finally {
    savingEdit.value = false;
  }
};

const toggleSchoolAdmin = async (u) => {
  if (!u?.id) return;
  const next = !u.is_school_admin;
  const label = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'this user';
  const actionText = next
    ? `This will make ${label} a School Admin for this school. They will be able to add/edit school staff, reset passwords, remove access, and manage School Admin/Scheduler role assignments for this school.`
    : `This will remove School Admin access for ${label}. They will no longer be able to manage school staff or role assignments for this school unless another admin grants it again.`;
  if (!confirm(`${actionText}\n\nDo you want to continue?`)) return;
  try {
    settingPrimaryId.value = u.id;
    error.value = '';
    await api.patch(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/roles`, {
      isSchoolAdmin: next
    });
    await load();
    success.value = next ? 'School Admin assigned.' : 'School Admin removed.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update School Admin';
  } finally {
    settingPrimaryId.value = null;
  }
};

const toggleScheduler = async (u) => {
  if (!u?.id) return;
  const next = !u.is_scheduler;
  const label = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'this user';
  const actionText = next
    ? `This will make ${label} a Scheduler for this school. Scheduler users get limited/own-only school access by default and will not appear in Smart School ROI assignment lists.`
    : `This will remove Scheduler from ${label}. They will return to standard school staff behavior unless other role flags are set.`;
  if (!confirm(`${actionText}\n\nDo you want to continue?`)) return;
  try {
    settingSchedulerId.value = u.id;
    error.value = '';
    await api.patch(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/roles`, {
      isScheduler: next
    });
    await load();
    success.value = next ? 'Scheduler assigned.' : 'Scheduler removed.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update Scheduler';
  } finally {
    settingSchedulerId.value = null;
  }
};

const forfeitSchoolAdmin = async () => {
  if (!confirm('Forfeit your School Admin access for this school?')) return;
  try {
    forfeiting.value = true;
    error.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff/forfeit-school-admin`);
    await load();
    success.value = 'You are no longer a School Admin for this school.';
    setTimeout(() => { success.value = ''; }, 3500);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to forfeit School Admin';
  } finally {
    forfeiting.value = false;
  }
};

const removeUser = async (u) => {
  const id = Number(u?.id);
  if (!id) return;
  if (!confirm(`Remove ${u.email || 'this user'} from ${props.schoolName || 'this school'}? This will revoke their access and remove them from the school contact list.`)) return;
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

const sendResetPassword = async (u) => {
  const id = Number(u?.id);
  if (!id) return;
  if (!confirm(`Send a password reset link to ${u.email || 'this user'}? The link will expire in 48 hours.`)) return;
  try {
    sendingResetId.value = id;
    error.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff/${id}/send-reset-password`);
    await load();
    success.value = 'Reset password link sent.';
    setTimeout(() => { success.value = ''; }, 4000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send reset password link';
  } finally {
    sendingResetId.value = null;
  }
};

const addStaff = async () => {
  const email = addEmail.value.trim();
  if (!email || !email.includes('@')) {
    error.value = 'Please enter a valid email address.';
    return;
  }
  const roleFlags = roleFlagsFromAccessRole(addAccessRole.value);
  const selectedRoleLabel = roleLabelFromAccessRole(addAccessRole.value);
  const selectedRoleDescription = roleDescriptionFromAccessRole(addAccessRole.value);
  if (!confirm(`This will create a new school staff login as: ${selectedRoleLabel}.\n${selectedRoleDescription}\n\nContinue?`)) return;
  try {
    adding.value = true;
    error.value = '';
    addSuccess.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff`, {
      email,
      fullName: addName.value.trim() || undefined,
      isSchoolAdmin: roleFlags.isSchoolAdmin,
      isScheduler: roleFlags.isScheduler
    });
    addName.value = '';
    addEmail.value = '';
    addAccessRole.value = 'standard';
    addSuccess.value = 'Staff added. Setup email sent.';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add staff';
  } finally {
    adding.value = false;
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

const roleFlagsFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  return {
    isSchoolAdmin: role === 'school_admin' || role === 'school_admin_scheduler',
    isScheduler: role === 'scheduler' || role === 'school_admin_scheduler'
  };
};

const roleLabelFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') return 'School Admin';
  if (role === 'scheduler') return 'Scheduler';
  if (role === 'school_admin_scheduler') return 'School Admin + Scheduler';
  return 'Standard account';
};

const roleDescriptionFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') {
    return 'They can manage school staff accounts and role assignments for this school.';
  }
  if (role === 'scheduler') {
    return 'They get limited/own-only school access and will not appear in Smart School ROI staff assignment lists.';
  }
  if (role === 'school_admin_scheduler') {
    return 'They can manage school staff for this school, and scheduler constraints (limited/own-only ROI behavior and Smart ROI exclusion) still apply.';
  }
  return 'This is a general school staff account (not School Admin and not Scheduler).';
};

const addRoleHelperText = computed(() => {
  const role = String(addAccessRole.value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') {
    return 'Use School Admin if this user should manage staff, resets, and role assignments for this school.';
  }
  if (role === 'scheduler') {
    return 'Use Scheduler if this user should schedule only with limited/own-only ROI access and no Smart School ROI assignment visibility.';
  }
  if (role === 'school_admin_scheduler') {
    return 'Use this only when the person should both manage school staff and also operate under scheduler constraints.';
  }
  return 'Standard account is the default. If this user does not need ROI scheduling limits or School Admin permissions, keep Standard.';
});

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
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.name {
  font-weight: 800;
}
.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 600;
}
.badge-primary {
  background: var(--primary-light, #e8f4fd);
  color: var(--primary, #0d6efd);
}
.badge-secondary {
  background: #ede9fe;
  color: #5b21b6;
}
.meta {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.meta-detail {
  font-size: 11px;
  margin-top: 1px;
}
.card-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.add-box,
.request-box {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
.add-role-row {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  align-items: end;
  gap: 10px;
  margin-bottom: 10px;
}
.add-role-field {
  max-width: 320px;
}
.role-select {
  margin-top: 4px;
}
.role-helper {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
  padding-bottom: 8px;
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
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 400px;
  max-width: 95vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.modal-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-body {
  padding: 16px;
}
.modal-body .field {
  margin-bottom: 12px;
}
.modal-body .field:last-of-type {
  margin-bottom: 16px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 820px) {
  .row { grid-template-columns: 1fr; }
  .add-role-row { grid-template-columns: 1fr; }
  .role-helper { padding-bottom: 0; }
}
</style>

