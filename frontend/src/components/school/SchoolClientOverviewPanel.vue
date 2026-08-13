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
        <button
          v-if="canOpenDocuments"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="documentsOpen = true"
        >
          Documents
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

    <div v-if="client.paper_packet_staff_roi_notice" class="sco-packet-notice">
      <strong>Printed referral packet uploaded.</strong>
      If your name is on the signed form, you will receive access.
    </div>
    <div v-else-if="client.paper_packet_named_access_notice" class="sco-packet-notice">
      <strong>You were named on the printed referral packet.</strong>
      {{
        schoolStaffEffectiveState === 'roi'
          ? 'You have ROI (Speak) access. Referral documents, including the packet, stay hidden at this level.'
          : 'You have access because your name was on the signed form.'
      }}
    </div>

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

    <p v-if="isSchoolStaff" class="sco-phi muted">
      Reminder: Use initials only. Do not include PHI. This is not Therapy Notes.
    </p>

    <div class="sco-grid">
      <div class="sco-card">
        <div class="sco-k">Status</div>
        <div class="sco-v">{{ statusLabel }}</div>
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

    <div class="sco-mid">
      <div class="sco-box">
        <div class="sco-box-title">New client checklist</div>
        <div v-if="!checklist" class="muted sco-box-empty">No checklist on file.</div>
        <div v-else class="sco-check-grid">
          <div>
            <div class="sco-k">Parents contacted</div>
            <div class="sco-v">{{ formatDateOnly(checklist.parents_contacted_at) }}</div>
          </div>
          <div>
            <div class="sco-k">Successful?</div>
            <div class="sco-v">
              {{ checklist.parents_contacted_successful === null ? '—' : (checklist.parents_contacted_successful ? 'Yes' : 'No') }}
            </div>
          </div>
          <div>
            <div class="sco-k">First service</div>
            <div class="sco-v">{{ formatDateOnly(checklist.first_service_at) }}</div>
          </div>
        </div>
        <div v-if="checklistAudit" class="sco-audit">{{ checklistAudit }}</div>
      </div>

      <div class="sco-box">
        <div class="sco-box-title">School staff & ROI</div>
        <div v-if="!schoolOrganizationId" class="muted sco-box-empty">School context missing.</div>
        <div v-else-if="staffRoiError" class="error sco-box-empty">{{ staffRoiError }}</div>
        <div v-else-if="!staffRoiSummary" class="muted sco-box-empty">Loading…</div>
        <div v-else-if="!staffRoiSummary.staff?.length" class="muted sco-box-empty">No school staff found.</div>
        <div v-else class="sco-staff-wrap">
          <table class="sco-staff-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>ROI status</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in staffRoiSummary.staff" :key="`staff-roi-${s.school_staff_user_id}`">
                <td>{{ s.name }}</td>
                <td>
                  <span :title="s.status_hover || staffRoiHover(s.effective_access_state)">{{ s.status_label }}</span>
                </td>
                <td class="mono">{{ formatDateShort(s.roi_expires_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="dual" :class="dualClass">
      <section
        class="pane"
        :class="paneClass('comments')"
        @click="activatePane('comments')"
        @focusin="activatePane('comments')"
      >
        <div class="pane-header">
          <div class="pane-title">Comments</div>
          <button v-if="activePane" class="btn-link" type="button" @click.stop="activePane = null">Show both</button>
        </div>
        <div v-if="isSchoolStaff" class="comment-guidance">
          If you have a question about the client, please send a message. Comments are non-clinical info only (no PHI).
        </div>
        <div class="pane-scroll">
          <div v-if="comments.length === 0" class="empty">No comments yet.</div>
          <table v-else class="comments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Note</th>
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in comments" :key="c.id">
                <td class="mono">{{ formatDateTime(c.created_at) }}</td>
                <td>{{ c.message }}</td>
                <td>{{ c.author_name || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="comment-composer">
          <textarea v-model="commentDraft" rows="2" placeholder="Add a brief comment (no PHI)..." />
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="commentSending || !commentDraft.trim()"
            @click="sendComment"
          >
            {{ commentSending ? 'Saving…' : 'Save comment' }}
          </button>
          <div v-if="commentError" class="error">{{ commentError }}</div>
        </div>
      </section>

      <section
        class="pane"
        :class="paneClass('messages')"
        @click="activatePane('messages')"
        @focusin="activatePane('messages')"
      >
        <div class="pane-header">
          <div class="pane-title">Messages (ticketed)</div>
          <button v-if="activePane" class="btn-link" type="button" @click.stop="activePane = null">Show both</button>
        </div>
        <div class="comment-guidance">Messages are for questions/inquiries and are tracked as tickets (no PHI).</div>
        <div class="pane-scroll">
          <ClientTicketThreadPanel
            v-if="schoolOrganizationId"
            :key="`tickets-${client.id}`"
            :client="client"
            :school-organization-id="schoolOrganizationId"
          />
          <div v-else class="muted">Messages are not available (missing organization context).</div>
        </div>
      </section>
    </div>

    <div v-if="showOwnDocumentsSection" class="sco-box sco-own-docs">
      <div class="sco-box-title">My documents</div>
      <p class="muted sco-own-docs-hint">
        {{ ownDocsHint }}
      </p>
      <PhiDocumentsPanel
        :client-id="Number(client.id)"
        own-only
        embedded
        section="files"
      />
    </div>
  </div>

  <div v-if="documentsOpen" class="docs-overlay" @click.self="documentsOpen = false">
    <div class="docs-modal" @click.stop>
      <div class="docs-modal-head">
        <strong>{{ documentsModalTitle }}</strong>
        <button type="button" class="sco-close" aria-label="Close" @click="documentsOpen = false">×</button>
      </div>
      <PhiDocumentsPanel
        :client-id="Number(client.id)"
        :own-only="documentsOwnOnly"
        :section="documentsOwnOnly ? 'files' : 'all'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import ClientTicketThreadPanel from './ClientTicketThreadPanel.vue';
import PhiDocumentsPanel from '../admin/PhiDocumentsPanel.vue';
import {
  schoolStaffCanOpenFromState,
  schoolStaffOwnDocumentsOnly,
  schoolStaffRoiHover
} from '../../utils/schoolStaffRoiLabels.js';

const props = defineProps({
  client: { type: Object, required: true },
  canEditAction: { type: Boolean, default: false },
  schoolOrganizationId: { type: [Number, String], default: null }
});
defineEmits(['close', 'open-comments', 'open-profile']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSchoolStaff = computed(() => roleNorm.value === 'school_staff');
const canViewAdminNote = computed(() => ['super_admin', 'admin', 'support'].includes(roleNorm.value));
const schoolOrganizationId = computed(() =>
  Number(props.schoolOrganizationId || props.client?.organization_id || 0) || null
);
const schoolStaffEffectiveState = computed(() =>
  String(props.client?.school_staff_effective_access_state || props.client?.school_staff_access_level || '')
    .trim()
    .toLowerCase()
);
const canOpenDocuments = computed(() => {
  if (isSchoolStaff.value) {
    return schoolStaffCanOpenFromState(schoolStaffEffectiveState.value);
  }
  return ['provider', 'admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value);
});
const documentsOwnOnly = computed(() => isSchoolStaff.value && schoolStaffOwnDocumentsOnly(schoolStaffEffectiveState.value));
const showOwnDocumentsSection = computed(() => documentsOwnOnly.value);
const documentsModalTitle = computed(() => (documentsOwnOnly.value ? 'My documents' : 'Documents'));
const ownDocsHint = computed(() => {
  if (schoolStaffEffectiveState.value === 'roi') {
    return 'Upload and view files you added for this client. Referral documents stay hidden at ROI (Speak), including a printed packet you uploaded.';
  }
  return 'Upload and view files you added, including a printed referral packet you uploaded. Documents other staff upload stay hidden.';
});
const staffRoiHover = (state) => schoolStaffRoiHover(state);

const adminNoteLoading = ref(false);
const adminNoteSaving = ref(false);
const adminNoteMessage = ref('');
const adminNoteDraft = ref('');
const adminNotePopoverOpen = ref(false);
const adminNoteError = ref('');
let adminNoteCloseTimer = null;

const checklist = ref(null);
const checklistAudit = ref('');
const staffRoiSummary = ref(null);
const staffRoiError = ref('');
const comments = ref([]);
const commentDraft = ref('');
const commentSending = ref(false);
const commentError = ref('');
const activePane = ref(null);
const documentsOpen = ref(false);

const displayName = computed(() => {
  const c = props.client || {};
  return c.full_name || c.initials || c.identifier_code || `Client ${c.id}`;
});
const statusLabel = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  if (key === 'confirmation_pending') return 'Fall Confirmation Pending';
  if (key === 'ready_to_schedule') return 'Ready to Schedule';
  if (key === 'being_seen') return 'Being Seen';
  if (key === 'scheduled') return 'Scheduled';
  return props.client?.client_status_label || props.client?.status || '—';
});

const dualClass = computed(() => (activePane.value ? `dual-active-${activePane.value}` : 'dual-active-both'));
const paneClass = (pane) => ({
  active: activePane.value === pane,
  inactive: !!activePane.value && activePane.value !== pane
});
const activatePane = (pane) => {
  if (activePane.value === pane) return;
  activePane.value = pane;
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateOnly(d) {
  return d ? String(d).slice(0, 10) : '—';
}
function formatDateShort(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return String(d).slice(0, 10);
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatDateTime(d) {
  return d ? new Date(d).toLocaleString() : '';
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

async function loadOverviewBody() {
  const clientId = Number(props.client?.id || 0);
  const orgId = schoolOrganizationId.value;
  checklist.value = null;
  checklistAudit.value = '';
  staffRoiSummary.value = null;
  staffRoiError.value = '';
  comments.value = [];
  commentDraft.value = '';
  commentError.value = '';
  activePane.value = null;
  documentsOpen.value = false;
  if (!clientId) return;

  if (orgId) {
    try {
      const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/comments`, { skipGlobalLoading: true });
      comments.value = Array.isArray(r.data) ? r.data : [];
    } catch {
      comments.value = [];
    }
  }

  try {
    const c = (await api.get(`/clients/${clientId}`, { skipGlobalLoading: true })).data || {};
    checklist.value = {
      parents_contacted_at: c.parents_contacted_at || null,
      parents_contacted_successful: c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? null
        : !!c.parents_contacted_successful,
      first_service_at: c.first_service_at || null
    };
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAudit.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
  } catch {
    checklist.value = null;
  }

  if (orgId) {
    try {
      const r = await api.get(
        `/school-portal/${orgId}/clients/${clientId}/school-staff-roi-summary`,
        { skipGlobalLoading: true }
      );
      staffRoiSummary.value = r.data || null;
    } catch (e) {
      staffRoiSummary.value = null;
      staffRoiError.value = e.response?.data?.error?.message || e.message || 'Failed to load school staff ROI';
    }
  }
}

async function sendComment() {
  const orgId = schoolOrganizationId.value;
  const clientId = Number(props.client?.id || 0);
  const body = String(commentDraft.value || '').trim();
  if (!orgId || !clientId || !body) return;
  commentSending.value = true;
  commentError.value = '';
  try {
    await api.post(`/school-portal/${orgId}/clients/${clientId}/comments`, { message: body });
    commentDraft.value = '';
    const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/comments`, { skipGlobalLoading: true });
    comments.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    commentError.value = e.response?.data?.error?.message || 'Failed to save comment';
  } finally {
    commentSending.value = false;
  }
}

watch(() => props.client?.id, () => {
  adminNotePopoverOpen.value = false;
  adminNoteMessage.value = '';
  adminNoteDraft.value = '';
  if (canViewAdminNote.value) loadAdminNote();
  loadOverviewBody();
}, { immediate: true });
</script>

<style scoped>
.sco-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
  padding: 12px 14px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
  overflow: auto;
}
.sco-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.sco-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}
.sco-sub { margin: 2px 0 0; font-size: 0.78rem; }
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
.sco-phi {
  margin: 0;
  font-size: 0.72rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 6px 8px;
  border-radius: 8px;
}
.sco-admin-note {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed #fbbf24;
  background: #fffbeb;
}
.sco-admin-note-label {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #b45309;
  flex-shrink: 0;
}
.sco-admin-note-value { font-size: 0.8rem; color: #78350f; min-width: 0; }
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.sco-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 8px;
}
.sco-k {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 1px;
}
.sco-v { font-size: 0.8rem; font-weight: 600; color: #0f172a; }
.sco-mid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.sco-box {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 0;
}
.sco-box-title {
  font-size: 0.78rem;
  font-weight: 800;
  margin-bottom: 6px;
  color: #0f172a;
}
.sco-box-empty { font-size: 0.76rem; }
.sco-check-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.sco-audit { margin-top: 6px; font-size: 0.68rem; color: #64748b; }
.sco-staff-wrap { overflow: auto; max-height: 120px; }
.sco-staff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.74rem;
}
.sco-staff-table th,
.sco-staff-table td {
  text-align: left;
  padding: 3px 6px;
  border-bottom: 1px solid #e2e8f0;
}
.sco-staff-table th {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: stretch;
  min-height: 220px;
  flex: 1;
}
.dual.dual-active-comments {
  grid-template-columns: minmax(0, 4fr) minmax(0, 1fr);
}
.dual.dual-active-messages {
  grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
}
.pane {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.pane.inactive { opacity: 0.72; }
.pane-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.pane-title { font-weight: 800; font-size: 0.82rem; color: #0f172a; }
.pane-scroll { overflow: auto; min-height: 0; flex: 1; }
.comment-guidance {
  font-size: 0.7rem;
  color: #64748b;
  line-height: 1.35;
}
.comments-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.74rem;
}
.comments-table th,
.comments-table td {
  text-align: left;
  padding: 3px 6px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}
.empty { font-size: 0.76rem; color: #64748b; }
.comment-composer { display: grid; gap: 6px; }
.comment-composer textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  resize: vertical;
}
.btn-link {
  border: none;
  background: none;
  color: #1f6b4a;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.docs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
}
.docs-modal {
  width: min(920px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
}
.docs-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.sco-own-docs {
  margin-top: 12px;
}
.sco-packet-notice {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(217, 119, 6, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  font-size: 0.85rem;
  line-height: 1.4;
}
.sco-own-docs-hint {
  margin: 0 0 10px;
  font-size: 0.8rem;
}
.muted { color: #64748b; }
.error { color: #b91c1c; }
.mono { font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .sco-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sco-mid, .dual { grid-template-columns: 1fr; }
  .dual.dual-active-comments,
  .dual.dual-active-messages { grid-template-columns: 1fr; }
}
</style>
