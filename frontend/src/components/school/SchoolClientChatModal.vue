<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h2>Student: {{ client.initials }}</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>

      <div class="phi-warning">
        <strong>Reminder:</strong> Use initials only. Do not include PHI. This is not an EHR.
      </div>

      <div class="status-bar">
        <div class="pill">
          <div class="k">Status</div>
          <div class="v">
            <span
              v-if="isWaitlist"
              class="waitlist-badge"
              role="button"
              tabindex="0"
              @mouseenter="onWaitlistHover"
              @mouseleave="hoveringWaitlist = false"
              @focus="onWaitlistHover"
              @click.stop="openWaitlistNote"
              @keydown.enter.stop.prevent="openWaitlistNote"
              @keydown.space.stop.prevent="openWaitlistNote"
              :title="waitlistTitle"
            >
              {{ formatKey(props.client?.client_status_label || props.client?.status) }}
              <div v-if="hoveringWaitlist" class="waitlist-tooltip" role="tooltip">
                <div class="waitlist-tooltip-title">Waitlist reason</div>
                <div class="waitlist-tooltip-body">{{ waitlistTooltipBody }}</div>
              </div>
            </span>
            <span v-else>
              {{ formatKey(props.client?.client_status_label || props.client?.status) }}
            </span>
          </div>
        </div>
        <div class="pill">
          <div class="k">Doc status</div>
          <div class="v">
            {{ formatKey(normalizeDocStatusLabel(props.client)) }}
            <span v-if="props.client?.paperwork_delivery_method_label"> · {{ formatKey(props.client?.paperwork_delivery_method_label) }}</span>
            <span v-if="props.client?.doc_date"> · {{ formatDateOnly(props.client?.doc_date) }}</span>
          </div>
        </div>
        <div class="pill">
          <div class="k">Assigned day</div>
          <div class="v">{{ props.client?.service_day || '—' }}</div>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="body">
        <div v-if="checklist" class="checklist">
          <div class="checklist-title">Compliance checklist (read-only)</div>
          <div class="checklist-grid">
            <div class="check-item">
              <div class="k">Parents Contacted</div>
              <div class="v">{{ formatDateOnly(checklist.parents_contacted_at) }}</div>
            </div>
            <div class="check-item">
              <div class="k">Successful?</div>
              <div class="v">
                {{ checklist.parents_contacted_successful === null ? '—' : (checklist.parents_contacted_successful ? 'Yes' : 'No') }}
              </div>
            </div>
            <div class="check-item">
              <div class="k">Intake Date</div>
              <div class="v">{{ formatDateOnly(checklist.intake_at) }}</div>
            </div>
            <div class="check-item">
              <div class="k">First Service</div>
              <div class="v">{{ formatDateOnly(checklist.first_service_at) }}</div>
            </div>
          </div>
          <div v-if="checklistAudit" class="checklist-audit">{{ checklistAudit }}</div>
        </div>

        <div class="tabs">
          <button type="button" class="tab" :class="{ active: activeTab === 'comments' }" @click="activeTab = 'comments'">
            Comments
          </button>
          <button type="button" class="tab" :class="{ active: activeTab === 'messages' }" @click="activeTab = 'messages'">
            Messages
          </button>
        </div>

        <div v-if="activeTab === 'comments'" class="tab-body">
          <div v-if="isSchoolStaff" class="comment-guidance">
            <strong>If you have a question about the client, please send us a message.</strong>
            Comments are meant to inform everyone of any info (non clinical and no PHI) that may be beneficial for all parties to be aware (e.g., the client is on vacation).
          </div>

          <div class="comments">
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
                  <td class="note">{{ c.message }}</td>
                  <td>{{ c.author_name || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="comment-composer">
            <textarea v-model="commentDraft" rows="3" placeholder="Add a brief comment (no PHI)..." />
            <div class="comment-actions">
              <button class="btn btn-primary" type="button" @click="sendComment" :disabled="commentSending || !commentDraft.trim()">
                {{ commentSending ? 'Saving…' : 'Save comment' }}
              </button>
              <div v-if="commentError" class="error">{{ commentError }}</div>
            </div>
          </div>
        </div>

        <div v-else class="tab-body">
          <div class="message-guidance">
            Messages are for questions/inquiries and are tracked as tickets (no PHI).
          </div>
          <ClientTicketThreadPanel
            v-if="props.schoolOrganizationId"
            :client="props.client"
            :school-organization-id="props.schoolOrganizationId"
          />
        </div>
      </div>
    </div>
  </div>

  <WaitlistNoteModal
    v-if="showWaitlistModal"
    :org-key="String(props.schoolOrganizationId || '')"
    :client="props.client"
    @close="showWaitlistModal = false"
  />
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import WaitlistNoteModal from './WaitlistNoteModal.vue';
import ClientTicketThreadPanel from './ClientTicketThreadPanel.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, default: null }
});
defineEmits(['close']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSchoolStaff = computed(() => roleNorm.value === 'school_staff');

const isWaitlist = computed(() => String(props.client?.client_status_key || '').toLowerCase() === 'waitlist');
const showWaitlistModal = ref(false);
const hoveringWaitlist = ref(false);
const waitlistLoading = ref(false);
const waitlistNote = ref(''); // singleton shared note message

const waitlistTitle = computed(() => (isWaitlist.value ? 'Click to view/edit waitlist note' : ''));
const waitlistTooltipBody = computed(() => {
  if (!hoveringWaitlist.value) return '';
  if (waitlistLoading.value) return 'Loading…';
  return waitlistNote.value || '(no note yet)';
});

const loadWaitlistNote = async () => {
  try {
    if (!isWaitlist.value) return;
    const orgId = Number(props.schoolOrganizationId || 0);
    const clientId = Number(props.client?.id || 0);
    if (!orgId || !clientId) return;
    waitlistLoading.value = true;
    const r = await api.get(`/school-portal/${encodeURIComponent(String(orgId))}/clients/${clientId}/waitlist-note`);
    waitlistNote.value = String(r.data?.note?.message || '').trim();
  } catch {
    // best-effort; tooltip should not block UI
    waitlistNote.value = '';
  } finally {
    waitlistLoading.value = false;
  }
};

const onWaitlistHover = () => {
  if (!isWaitlist.value) return;
  hoveringWaitlist.value = true;
  if (!waitlistNote.value && !waitlistLoading.value) loadWaitlistNote();
};

const openWaitlistNote = () => {
  if (!isWaitlist.value) return;
  if (!props.schoolOrganizationId) return;
  showWaitlistModal.value = true;
};

const normalizeDocStatusLabel = (c) => {
  const key = String(c?.paperwork_status_key || '').toLowerCase();
  const base = String(c?.paperwork_status_label || c?.document_status || '').trim();
  if (key === 'new_docs') return 'Docs Needed';
  if (key === 'completed') return 'Received';
  return base || '—';
};

const loading = ref(false);
const error = ref('');
const checklist = ref(null);
const checklistAudit = ref('');

const activeTab = ref('comments'); // 'comments' | 'messages'

const comments = ref([]);
const commentDraft = ref('');
const commentSending = ref(false);
const commentError = ref('');

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    // Comments (non-ticket notes) from school portal endpoint.
    if (props.schoolOrganizationId) {
      try {
        const r = await api.get(`/school-portal/${props.schoolOrganizationId}/clients/${props.client.id}/comments`);
        comments.value = Array.isArray(r.data) ? r.data : [];
      } catch {
        comments.value = [];
      }
    } else {
      comments.value = [];
    }

    // Compliance checklist (read-only for school staff)
    try {
      const c = (await api.get(`/clients/${props.client.id}`)).data || {};
      checklist.value = {
        parents_contacted_at: c.parents_contacted_at || null,
        parents_contacted_successful: c.parents_contacted_successful === null || c.parents_contacted_successful === undefined ? null : !!c.parents_contacted_successful,
        intake_at: c.intake_at || null,
        first_service_at: c.first_service_at || null
      };
      const who = c.checklist_updated_by_name || null;
      const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
      checklistAudit.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
    } catch {
      checklist.value = null;
      checklistAudit.value = '';
    }
    // Mark as read (best-effort).
    try {
      await api.post(`/clients/${props.client.id}/notes/read`);
    } catch {
      // ignore
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
};

const sendComment = async () => {
  try {
    if (!props.schoolOrganizationId) return;
    const body = String(commentDraft.value || '').trim();
    if (!body) return;
    commentSending.value = true;
    commentError.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/clients/${props.client.id}/comments`, {
      message: body
    });
    commentDraft.value = '';
    await load();
  } catch (e) {
    commentError.value = e.response?.data?.error?.message || 'Failed to save comment';
  } finally {
    commentSending.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');

const formatDateOnly = (d) => (d ? String(d).slice(0, 10) : '—');
const formatKey = (v) => {
  const s = String(v || '').trim();
  if (!s) return '—';
  return s.replace(/_/g, ' ');
};

onMounted(load);

watch(
  () => [props.client?.id, props.client?.client_status_key],
  () => {
    showWaitlistModal.value = false;
    hoveringWaitlist.value = false;
    waitlistLoading.value = false;
    waitlistNote.value = '';
    activeTab.value = 'comments';
    comments.value = [];
    commentDraft.value = '';
    commentError.value = '';
  }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.checklist {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
  margin-bottom: 12px;
}
.checklist-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.check-item .k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.check-item .v {
  margin-top: 2px;
}
.checklist-audit {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.close { border: none; background: none; font-size: 28px; cursor: pointer; }
.phi-warning {
  margin: 12px 16px 0 16px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}
.status-bar {
  margin: 10px 16px 0 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.pill {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px 12px;
}
.pill .k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 800;
}
.pill .v {
  margin-top: 2px;
  font-weight: 800;
  color: var(--text-primary);
}

.waitlist-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.waitlist-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-width: 60vw;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 50;
}

.waitlist-tooltip-title {
  font-weight: 900;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.waitlist-tooltip-body {
  font-size: 13px;
  line-height: 1.25;
  white-space: pre-wrap;
}
.body { padding: 16px; display: grid; grid-template-columns: 1fr; gap: 12px; }

.tabs {
  display: inline-flex;
  gap: 8px;
}
.tab {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 900;
  cursor: pointer;
}
.tab.active {
  border-color: rgba(0, 0, 0, 0.25);
  background: white;
}
.tab-body {
  display: grid;
  gap: 12px;
}
.comment-guidance,
.message-guidance {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
}

.comments {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 10px;
  overflow: auto;
  max-height: 40vh;
}
.comments-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.comments-table th,
.comments-table td {
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.comments-table th {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 900;
  background: rgba(255, 255, 255, 0.6);
  position: sticky;
  top: 0;
}
.comments-table td.note {
  white-space: pre-wrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}

.comment-composer textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.comment-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

textarea, select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.loading, .empty { color: var(--text-secondary); }
.error { color: #c33; }
@media (max-width: 900px) {
  .status-bar { grid-template-columns: 1fr; }
}
</style>

