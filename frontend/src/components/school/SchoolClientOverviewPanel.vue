<template>
  <div class="sco-panel">
    <header class="sco-header">
      <div>
        <h2 class="sco-title">{{ displayName }}</h2>
        <p class="sco-sub muted">
          {{ statusLabel }}
          <template v-if="client.service_day"> · {{ client.service_day }}</template>
          <template v-if="client.provider_name"> · {{ client.provider_name }}</template>
        </p>
      </div>
      <div class="sco-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('open-comments', client)">
          Comments
        </button>
        <button
          v-if="canEditAction"
          type="button"
          class="btn btn-primary btn-sm"
          @click="$emit('open-profile', client)"
        >
          Profile
        </button>
        <button type="button" class="sco-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>
    </header>

    <div
      v-if="canViewAdminNote"
      class="sco-admin-note"
      @mouseenter="openAdminNote"
      @mouseleave="scheduleCloseAdminNote"
    >
      <span class="sco-admin-note-label">Admin note</span>
      <span class="sco-admin-note-value">
        <span v-if="adminNoteLoading" class="muted">Loading…</span>
        <span v-else-if="adminNoteMessage" class="sco-admin-note-preview">
          {{ adminNoteMessage }}
        </span>
        <span v-else class="muted">Hover to view / edit</span>
      </span>
      <div
        v-if="adminNotePopoverOpen"
        class="sco-admin-note-popover"
        @mouseenter="cancelCloseAdminNote"
        @mouseleave="scheduleCloseAdminNote"
      >
        <div class="sco-admin-note-popover-title">Internal admin note</div>
        <textarea
          v-model="adminNoteDraft"
          class="sco-admin-note-textarea"
          rows="5"
          placeholder="Add an internal admin note…"
        />
        <div class="sco-admin-note-actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="adminNoteSaving" @click="closeAdminNote">
            Close
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="adminNoteSaving || !String(adminNoteDraft || '').trim()"
            @click="saveAdminNote"
          >
            {{ adminNoteSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <p v-if="adminNoteError" class="error sco-admin-note-error">{{ adminNoteError }}</p>
      </div>
    </div>

    <div class="sco-grid">
      <div class="sco-card">
        <div class="sco-k">Status</div>
        <div class="sco-v">{{ statusLabel }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Readiness</div>
        <div class="sco-v">{{ readinessLabel }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Assigned day</div>
        <div class="sco-v">{{ client.service_day || '—' }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Provider</div>
        <div class="sco-v">{{ client.provider_name || '—' }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Grade / year</div>
        <div class="sco-v">
          {{ client.grade || '—' }}
          <span v-if="client.school_year" class="muted"> · {{ client.school_year }}</span>
        </div>
      </div>
      <div class="sco-card">
        <div class="sco-k">ROI expires</div>
        <div class="sco-v">{{ formatDate(client.roi_expires_at) }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Submitted</div>
        <div class="sco-v">{{ formatDate(client.submission_date) }}</div>
      </div>
      <div class="sco-card">
        <div class="sco-k">Paperwork</div>
        <div class="sco-v">
          {{ client.paperwork_status_label || client.document_status || '—' }}
        </div>
      </div>
    </div>

    <p class="sco-hint muted">
      Select another name on the left to switch clients. Use Comments for messages, or Profile for the full chart.
    </p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { formatOnboardingSummary } from '../../utils/clientOnboardingSummary.js';

const props = defineProps({
  client: { type: Object, required: true },
  canEditAction: { type: Boolean, default: false }
});
defineEmits(['close', 'open-comments', 'open-profile']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canViewAdminNote = computed(() => ['super_admin', 'admin', 'support'].includes(roleNorm.value));

const adminNoteLoading = ref(false);
const adminNoteSaving = ref(false);
const adminNoteMessage = ref('');
const adminNoteDraft = ref('');
const adminNotePopoverOpen = ref(false);
const adminNoteError = ref('');
let adminNoteCloseTimer = null;

const displayName = computed(() => {
  const c = props.client || {};
  return c.full_name || c.initials || c.identifier_code || `Client ${c.id}`;
});
const statusLabel = computed(() =>
  props.client?.client_status_label
  || props.client?.client_status_key
  || props.client?.status
  || '—'
);
const readinessLabel = computed(() => formatOnboardingSummary(props.client));

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadAdminNote() {
  const id = Number(props.client?.id || 0);
  if (!id || !canViewAdminNote.value) return;
  adminNoteLoading.value = true;
  adminNoteError.value = '';
  try {
    const r = await api.get(`/clients/${id}/admin-note`, { skipGlobalLoading: true });
    const msg = String(r.data?.note?.message || r.data?.message || '').trim();
    adminNoteMessage.value = msg;
    adminNoteDraft.value = msg;
  } catch {
    adminNoteMessage.value = '';
    adminNoteDraft.value = '';
  } finally {
    adminNoteLoading.value = false;
  }
}

function openAdminNote() {
  cancelCloseAdminNote();
  adminNotePopoverOpen.value = true;
  if (!adminNoteMessage.value && !adminNoteDraft.value) loadAdminNote();
}

function scheduleCloseAdminNote() {
  cancelCloseAdminNote();
  adminNoteCloseTimer = setTimeout(() => {
    adminNotePopoverOpen.value = false;
  }, 220);
}

function cancelCloseAdminNote() {
  if (adminNoteCloseTimer) {
    clearTimeout(adminNoteCloseTimer);
    adminNoteCloseTimer = null;
  }
}

function closeAdminNote() {
  cancelCloseAdminNote();
  adminNotePopoverOpen.value = false;
}

async function saveAdminNote() {
  const id = Number(props.client?.id || 0);
  if (!id) return;
  adminNoteSaving.value = true;
  adminNoteError.value = '';
  try {
    const r = await api.put(`/clients/${id}/admin-note`, {
      message: String(adminNoteDraft.value || '').trim()
    }, { skipGlobalLoading: true });
    adminNoteMessage.value = String(r.data?.message || adminNoteDraft.value || '').trim();
    adminNotePopoverOpen.value = false;
  } catch (e) {
    adminNoteError.value = e?.response?.data?.error?.message || 'Failed to save admin note';
  } finally {
    adminNoteSaving.value = false;
  }
}

watch(() => props.client?.id, () => {
  adminNotePopoverOpen.value = false;
  adminNoteMessage.value = '';
  adminNoteDraft.value = '';
  if (canViewAdminNote.value) loadAdminNote();
}, { immediate: true });
</script>

<style scoped>
.sco-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  height: 100%;
  padding: 16px 18px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
}
.sco-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.sco-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}
.sco-sub { margin: 4px 0 0; font-size: 0.85rem; }
.sco-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.sco-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  padding: 0 4px;
}
.sco-admin-note {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed #fbbf24;
  background: #fffbeb;
}
.sco-admin-note-label {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #b45309;
  flex-shrink: 0;
}
.sco-admin-note-value { font-size: 0.86rem; color: #78350f; min-width: 0; }
.sco-admin-note-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sco-admin-note-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
  padding: 12px;
}
.sco-admin-note-popover-title {
  font-weight: 800;
  font-size: 0.85rem;
  margin-bottom: 8px;
}
.sco-admin-note-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
}
.sco-admin-note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.sco-admin-note-error { margin: 8px 0 0; font-size: 0.82rem; }
.sco-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sco-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
}
.sco-k {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 4px;
}
.sco-v { font-size: 0.92rem; font-weight: 600; color: #0f172a; }
.sco-hint { margin: 0; font-size: 0.8rem; line-height: 1.4; }
.muted { color: #64748b; }
.error { color: #b91c1c; }
@media (max-width: 720px) {
  .sco-grid { grid-template-columns: 1fr; }
  .sco-header { flex-direction: column; }
}
</style>
