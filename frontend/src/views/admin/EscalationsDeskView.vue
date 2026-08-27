<template>
  <div class="esc-desk">
    <header class="desk-header">
      <div>
        <h1>Escalations</h1>
        <p class="sub">
          Structured leadership workflow — issue, root cause, recommended resolution, ownership, and outcomes.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn secondary" :disabled="loading" @click="refresh">Refresh</button>
        <button v-if="canManage" type="button" class="btn secondary" @click="showRouting = !showRouting">
          {{ showRouting ? 'Hide routing' : 'Chain of responsibility' }}
        </button>
        <button type="button" class="btn primary" @click="showCreate = true">New escalation</button>
      </div>
    </header>

    <div v-if="showRouting && canManage" class="routing-panel">
      <h3>Chain of responsibility</h3>
      <p class="hint">New escalations auto-assign to the first available person or role in this list.</p>
      <div v-for="(step, idx) in routingDraft" :key="idx" class="routing-row">
        <select v-model="step.type">
          <option value="role">Role</option>
          <option value="user">User</option>
        </select>
        <select v-if="step.type === 'role'" v-model="step.value">
          <option value="admin">Admin</option>
          <option value="support">Support</option>
          <option value="staff">Staff</option>
        </select>
        <select v-else v-model="step.value">
          <option value="">Select user…</option>
          <option v-for="u in assignees" :key="u.id" :value="String(u.id)">
            {{ u.last_name }}, {{ u.first_name }} ({{ u.role }})
          </option>
        </select>
        <button type="button" class="btn secondary sm" @click="routingDraft.splice(idx, 1)">Remove</button>
      </div>
      <div class="routing-actions">
        <button type="button" class="btn secondary sm" @click="routingDraft.push({ type: 'role', value: 'admin' })">
          Add step
        </button>
        <button type="button" class="btn primary sm" :disabled="savingRouting" @click="saveRouting">
          {{ savingRouting ? 'Saving…' : 'Save routing' }}
        </button>
      </div>
    </div>

    <div class="metrics">
      <button
        v-for="m in metricCards"
        :key="m.key"
        type="button"
        class="metric"
        :class="{ on: statusFilter === m.key }"
        @click="toggleStatus(m.key)"
      >
        <span>{{ m.label }}</span>
        <strong>{{ m.value }}</strong>
      </button>
    </div>

    <div class="desk-body">
      <aside class="list-pane">
        <input v-model="search" type="search" class="search" placeholder="Search subject…" />
        <div v-if="error" class="error">{{ error }}</div>
        <div v-else-if="loading" class="muted pad">Loading…</div>
        <ul v-else class="list">
          <li
            v-for="e in filtered"
            :key="e.id"
            :class="{ on: selectedId === e.id, urgent: e.immediate_action_required }"
            @click="selectEscalation(e.id)"
          >
            <div class="li-top">
              <span class="mono">#{{ e.id }}</span>
              <i class="prio" :class="e.priority">{{ e.priority }}</i>
            </div>
            <strong>{{ e.subject }}</strong>
            <small>
              {{ statusLabel(e.escalation_status) }}
              <template v-if="e.claimed_by_name"> · {{ e.claimed_by_name }}</template>
            </small>
          </li>
        </ul>
        <p v-if="!loading && !filtered.length" class="muted pad">No escalations match.</p>
      </aside>

      <main v-if="detail" class="detail-pane">
        <div class="detail-head">
          <div class="detail-head-main">
            <h2>#{{ detail.id }} · {{ detail.subject }}</h2>
            <p class="meta">
              <span class="badge" :class="statusTone(detail.escalation_status)">
                {{ statusLabel(detail.escalation_status) }}
              </span>
              · Submitted by {{ detail.created_by_name || '—' }}
              · {{ formatTime(detail.created_at) }}
            </p>
          </div>
          <div v-if="canEditDetails" class="detail-head-actions">
            <template v-if="editingDetails">
              <button type="button" class="btn secondary sm" :disabled="savingDetails" @click="cancelEditDetails">
                Cancel
              </button>
              <button
                type="button"
                class="btn primary sm"
                :disabled="savingDetails || !detailsDraft.issue.trim() || !detailsDraft.recommended.trim()"
                @click="saveDetails"
              >
                {{ savingDetails ? 'Saving…' : 'Save details' }}
              </button>
            </template>
            <button v-else type="button" class="btn secondary sm" @click="startEditDetails">
              Edit details
            </button>
          </div>
        </div>

        <p v-if="detailsError" class="error details-error">{{ detailsError }}</p>

        <div class="fields-grid">
          <section>
            <h4>Issue</h4>
            <textarea
              v-if="editingDetails"
              v-model="detailsDraft.issue"
              class="field-input"
              rows="3"
            />
            <p v-else>{{ detail.issue }}</p>
          </section>
          <section>
            <h4>Root cause</h4>
            <textarea
              v-if="editingDetails"
              v-model="detailsDraft.rootCause"
              class="field-input"
              rows="3"
              placeholder="Optional"
            />
            <p v-else>{{ detail.root_cause || '—' }}</p>
          </section>
          <section>
            <h4>Recommended resolution</h4>
            <textarea
              v-if="editingDetails"
              v-model="detailsDraft.recommended"
              class="field-input"
              rows="3"
            />
            <p v-else>{{ detail.recommended_resolution || '—' }}</p>
          </section>
          <section>
            <h4>Details</h4>
            <ul v-if="editingDetails" class="kv kv--edit">
              <li>
                <span>Department</span>
                <input v-model="detailsDraft.department" class="field-input" type="text" placeholder="Department" />
              </li>
              <li>
                <span>Project</span>
                <input v-model="detailsDraft.project" class="field-input" type="text" placeholder="Related project" />
              </li>
              <li>
                <span>Immediate</span>
                <label class="check inline">
                  <input v-model="detailsDraft.immediate" type="checkbox" />
                  Required
                </label>
              </li>
              <li><span>Owner</span><strong>{{ detail.claimed_by_name || 'Unassigned' }}</strong></li>
            </ul>
            <ul v-else class="kv">
              <li><span>Department</span><strong>{{ detail.affected_department || '—' }}</strong></li>
              <li><span>Project</span><strong>{{ detail.related_project || '—' }}</strong></li>
              <li><span>Immediate</span><strong>{{ detail.immediate_action_required ? 'Yes' : 'No' }}</strong></li>
              <li><span>Owner</span><strong>{{ detail.claimed_by_name || 'Unassigned' }}</strong></li>
              <li v-if="detail.resolution_outcome"><span>Outcome</span><strong>{{ detail.resolution_outcome }}</strong></li>
            </ul>
          </section>
          <section class="meeting-link-section">
            <h4>Admin Meeting</h4>
            <p v-if="detail.linked_meeting">
              Tagged to
              <strong>{{ detail.linked_meeting.title || `Meeting #${detail.linked_meeting.id}` }}</strong>
              <template v-if="detail.linked_meeting.startAt">
                · {{ formatTime(detail.linked_meeting.startAt) }}
              </template>
            </p>
            <p v-else class="muted">Not tagged to an Admin Meeting yet.</p>
            <div class="meeting-link-row">
              <select v-model="meetingLinkDraft" class="meeting-select">
                <option value="">Select upcoming Admin Meeting…</option>
                <option v-for="m in adminMeetings" :key="m.id" :value="String(m.id)">
                  {{ m.title }} · {{ formatTime(m.startAt) }}
                </option>
              </select>
              <button type="button" class="btn secondary sm" :disabled="savingMeetingLink" @click="saveMeetingLink">
                {{ savingMeetingLink ? 'Saving…' : 'Tag meeting' }}
              </button>
              <button
                v-if="detail.linked_schedule_event_id"
                type="button"
                class="btn secondary sm"
                :disabled="savingMeetingLink"
                @click="clearMeetingLink"
              >
                Clear
              </button>
            </div>
          </section>
        </div>

        <div v-if="canManage" class="manage-bar">
          <label v-if="!isResolved">
            Status
            <select v-model="statusDraft" @change="saveStatus">
              <option v-for="s in workflowStatuses" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <label>
            Assign to
            <select v-model="assignDraft" :disabled="savingAssign || isResolved" @change="saveAssign">
              <option value="">Unassigned</option>
              <option
                v-for="u in assignOptions"
                :key="u.id"
                :value="String(u.id)"
              >
                {{ u.last_name }}, {{ u.first_name }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="canManage && !isResolved" class="resolve-panel">
          <label class="resolve-notes">
            Resolution notes
            <span class="optional">(optional)</span>
            <textarea
              v-model="outcomeDraft"
              rows="2"
              placeholder="How was this resolved? Leave blank if nothing to add."
            />
          </label>
          <button
            type="button"
            class="btn primary resolve-btn"
            :disabled="resolving"
            @click="resolveEscalation"
          >
            {{ resolving ? 'Resolving…' : 'Resolved' }}
          </button>
        </div>

        <div v-else-if="canManage && isResolved && detail.resolution_outcome" class="resolve-done">
          <strong>Resolution notes</strong>
          <p>{{ detail.resolution_outcome }}</p>
        </div>

        <div v-if="detail.attachments?.length" class="attachments">
          <h4>Attachments</h4>
          <ul>
            <li v-for="a in detail.attachments" :key="a.id">
              <a :href="uploadUrl(a.file_path)" target="_blank" rel="noopener">{{ a.file_name }}</a>
            </li>
          </ul>
        </div>

        <section class="thread">
          <h4>Conversation</h4>
          <div v-if="messagesLoading" class="muted">Loading messages…</div>
          <ul v-else class="msgs">
            <li v-for="m in messages" :key="m.id" :class="{ internal: m.is_internal }">
              <div class="msg-h">
                <strong>{{ m.author_name || 'User' }}</strong>
                <span v-if="m.is_internal" class="internal-tag">Internal</span>
                <time>{{ formatTime(m.created_at) }}</time>
              </div>
              <p class="msg-body" v-html="renderMessageBody(m.body)" />
            </li>
          </ul>
          <form class="composer" @submit.prevent="sendMessage">
            <div class="composer-field">
              <textarea
                ref="replyEl"
                v-model="reply"
                rows="3"
                placeholder="Add an update… use @ to mention"
                @input="onReplyInput"
                @keydown="onReplyKeydown"
              />
              <ul v-if="mentionSuggestions.length" class="mention-menu">
                <li
                  v-for="(u, idx) in mentionSuggestions"
                  :key="u.id"
                  :class="{ on: idx === mentionIndex }"
                  @mousedown.prevent="insertMention(u)"
                >
                  <strong>{{ u.first_name }} {{ u.last_name }}</strong>
                  <span>{{ roleLabel(u.role) }}</span>
                </li>
              </ul>
            </div>
            <div class="composer-actions">
              <label v-if="canManage" class="check">
                <input v-model="replyInternal" type="checkbox" /> Internal note
              </label>
              <label class="file-btn">
                Attach
                <input type="file" accept="image/*,.pdf,text/plain" @change="onAttach" />
              </label>
              <button type="submit" class="btn primary sm" :disabled="!reply.trim() || sendingMsg">
                {{ sendingMsg ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </form>
        </section>
      </main>
      <main v-else class="detail-pane empty-detail">
        Select an escalation to review ownership, conversation, and resolution.
      </main>
    </div>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <header>
          <h3>New escalation</h3>
          <button type="button" class="x" @click="showCreate = false">×</button>
        </header>
        <form @submit.prevent="createEscalation">
          <label>Issue *<textarea v-model="form.issue" rows="3" required /></label>
          <label>Root cause<textarea v-model="form.rootCause" rows="2" /></label>
          <label>Recommended resolution *<textarea v-model="form.recommended" rows="2" required /></label>
          <div class="form-row">
            <label>Priority
              <select v-model="form.priority">
                <option v-for="p in priorities" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </label>
            <label>Department<input v-model="form.department" type="text" /></label>
            <label>Related project<input v-model="form.project" type="text" /></label>
            <label v-if="canManage">
              Assign to
              <select v-model="form.assigneeUserId">
                <option value="">Auto (chain of responsibility)</option>
                <option v-for="u in assignees" :key="u.id" :value="String(u.id)">
                  {{ u.last_name }}, {{ u.first_name }}
                </option>
              </select>
            </label>
          </div>
          <label class="check"><input v-model="form.immediate" type="checkbox" /> Immediate action required</label>
          <p v-if="createError" class="error">{{ createError }}</p>
          <footer>
            <button type="button" class="btn secondary" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn primary" :disabled="creating || !form.issue.trim() || !form.recommended.trim()">{{ creating ? 'Submitting…' : 'Submit' }}</button>
          </footer>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  ESCALATION_PRIORITIES,
  ESCALATION_WORKFLOW_STATUSES,
  escalationStatusLabel,
  escalationStatusTone
} from '../../utils/orgEscalations';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const workflowStatuses = ESCALATION_WORKFLOW_STATUSES;
const priorities = ESCALATION_PRIORITIES;
const statusLabel = escalationStatusLabel;
const statusTone = escalationStatusTone;

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManage = computed(() => ['admin', 'support', 'super_admin', 'superadmin'].includes(role.value));
const canEditDetails = computed(() => {
  if (!detail.value) return false;
  if (canManage.value) return true;
  return Number(detail.value.created_by_user_id || 0) === Number(authStore.user?.id || 0);
});
const isResolved = computed(() => {
  const s = String(detail.value?.escalation_status || '').toLowerCase();
  return s === 'resolved' || s === 'closed';
});
const agencyId = computed(() => Number(agencyStore.currentAgency?.id) || null);

const loading = ref(false);
const error = ref('');
const items = ref([]);
const counts = ref({});
const selectedId = ref(null);
const detail = ref(null);
const messages = ref([]);
const messagesLoading = ref(false);
const search = ref('');
const statusFilter = ref('');
const showCreate = ref(false);
const showRouting = ref(false);
const routingDraft = ref([]);
const savingRouting = ref(false);
const assignees = ref([]);
const statusDraft = ref('submitted');
const assignDraft = ref('');
const outcomeDraft = ref('');
const reply = ref('');
const replyEl = ref(null);
const replyInternal = ref(false);
const sendingMsg = ref(false);
const mentionSuggestions = ref([]);
const mentionIndex = ref(0);
const creating = ref(false);
const createError = ref('');
const adminMeetings = ref([]);
const meetingLinkDraft = ref('');
const savingMeetingLink = ref(false);
const savingAssign = ref(false);
const resolving = ref(false);
const editingDetails = ref(false);
const savingDetails = ref(false);
const detailsError = ref('');
const detailsDraft = ref({
  issue: '',
  rootCause: '',
  recommended: '',
  department: '',
  project: '',
  immediate: false
});
const form = ref({
  issue: '',
  rootCause: '',
  recommended: '',
  department: '',
  project: '',
  priority: 'medium',
  immediate: false,
  assigneeUserId: ''
});

const metricCards = computed(() => [
  { key: '', label: 'Open', value: counts.value.open || 0 },
  { key: 'submitted', label: 'Submitted', value: counts.value.submitted || 0 },
  { key: 'under_review', label: 'Under review', value: counts.value.under_review || 0 },
  { key: 'assigned', label: 'Assigned', value: counts.value.assigned || 0 },
  { key: 'awaiting_information', label: 'Awaiting info', value: counts.value.awaiting_information || 0 },
  { key: 'resolved', label: 'Resolved', value: counts.value.resolved || 0 }
]);

const filtered = computed(() => {
  let list = items.value || [];
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => String(e.subject || '').toLowerCase().includes(q) || String(e.id).includes(q));
  }
  return list;
});

/** Keep current owner in the dropdown even if they are not in the assignees list. */
const assignOptions = computed(() => {
  const list = Array.isArray(assignees.value) ? [...assignees.value] : [];
  const ownerId = Number(detail.value?.claimed_by_user_id || 0);
  if (ownerId > 0 && !list.some((u) => Number(u.id) === ownerId)) {
    const name = String(detail.value?.claimed_by_name || '').trim();
    const parts = name.split(/\s+/);
    list.unshift({
      id: ownerId,
      first_name: parts[0] || 'Owner',
      last_name: parts.slice(1).join(' ') || '',
      role: 'assigned'
    });
  }
  return list;
});

/** Admin/support/super_admin only — small mention pool for escalation @. */
const mentionableUsers = computed(() => {
  const roles = new Set(['admin', 'support', 'super_admin', 'superadmin']);
  return (assignees.value || []).filter((u) => roles.has(String(u.role || '').toLowerCase()));
});

function roleLabel(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin' || r === 'superadmin') return 'Super admin';
  if (r === 'support') return 'Support';
  if (r === 'admin') return 'Admin';
  return r || 'User';
}

function renderMessageBody(body) {
  const escaped = String(body || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@\[([^\]]*)\]\((\d+)\)/g, '<span class="mention">@$1</span>');
}

function onReplyInput() {
  const m = /(^|\s)@([a-zA-Z]*)$/.exec(reply.value);
  if (!m) {
    mentionSuggestions.value = [];
    mentionIndex.value = 0;
    return;
  }
  const q = m[2].toLowerCase();
  // Show the full manager list (small) — filter as they type.
  mentionSuggestions.value = mentionableUsers.value.filter((u) => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    return !q || name.includes(q) || String(u.first_name || '').toLowerCase().startsWith(q);
  });
  mentionIndex.value = 0;
}

function onReplyKeydown(ev) {
  if (!mentionSuggestions.value.length) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    mentionIndex.value = (mentionIndex.value + 1) % mentionSuggestions.value.length;
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    mentionIndex.value =
      (mentionIndex.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length;
  } else if (ev.key === 'Enter' || ev.key === 'Tab') {
    ev.preventDefault();
    insertMention(mentionSuggestions.value[mentionIndex.value]);
  } else if (ev.key === 'Escape') {
    mentionSuggestions.value = [];
  }
}

function insertMention(u) {
  if (!u) return;
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  reply.value = reply.value.replace(/(^|\s)@([a-zA-Z]*)$/, `$1@[${name}](${u.id}) `);
  mentionSuggestions.value = [];
  mentionIndex.value = 0;
  replyEl.value?.focus?.();
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(iso);
  }
}

function uploadUrl(p) {
  return toUploadsUrl(p);
}

function toggleStatus(key) {
  statusFilter.value = statusFilter.value === key ? '' : key;
  refresh();
}

async function refresh() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = { agencyId: agencyId.value, limit: 100 };
    if (statusFilter.value) params.escalationStatus = statusFilter.value;
    else params.openOnly = statusFilter.value === '' ? undefined : 1;
    // When no status filter, show open by default in list; metrics still full counts
    if (!statusFilter.value) params.openOnly = 1;
    const res = await api.get('/escalations', { params, skipGlobalLoading: true });
    items.value = res.data?.escalations || [];
    counts.value = res.data?.counts || {};
    await loadAssignees();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load escalations';
  } finally {
    loading.value = false;
  }
}

async function loadAssignees() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/escalations/assignees', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    assignees.value = res.data?.users || [];
  } catch {
    assignees.value = [];
  }
}

async function loadAdminMeetings() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/escalations/admin-meetings', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    adminMeetings.value = res.data?.meetings || [];
  } catch {
    adminMeetings.value = [];
  }
}

async function saveMeetingLink() {
  if (!detail.value?.id || !meetingLinkDraft.value) return;
  savingMeetingLink.value = true;
  try {
    const res = await api.patch(`/escalations/${detail.value.id}/meeting-link`, {
      scheduleEventId: Number(meetingLinkDraft.value)
    }, { skipGlobalLoading: true });
    detail.value = res.data;
    meetingLinkDraft.value = String(res.data?.linked_schedule_event_id || '');
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to tag Admin Meeting';
  } finally {
    savingMeetingLink.value = false;
  }
}

async function clearMeetingLink() {
  if (!detail.value?.id) return;
  savingMeetingLink.value = true;
  try {
    const res = await api.patch(`/escalations/${detail.value.id}/meeting-link`, {
      clear: true
    }, { skipGlobalLoading: true });
    detail.value = res.data;
    meetingLinkDraft.value = '';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to clear meeting tag';
  } finally {
    savingMeetingLink.value = false;
  }
}

async function loadRouting() {
  if (!agencyId.value || !canManage.value) return;
  try {
    const res = await api.get('/escalations/routing', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    routingDraft.value = Array.isArray(res.data?.routing) ? res.data.routing.map((s) => ({ ...s, value: String(s.value ?? '') })) : [];
  } catch {
    routingDraft.value = [];
  }
}

async function saveRouting() {
  savingRouting.value = true;
  try {
    await api.put('/escalations/routing', {
      agencyId: agencyId.value,
      routing: routingDraft.value
    });
  } finally {
    savingRouting.value = false;
  }
}

async function selectEscalation(id) {
  selectedId.value = id;
  router.replace({ query: { ...route.query, id: String(id) } });
  await loadDetail(id);
}

async function loadDetail(id) {
  detail.value = null;
  messages.value = [];
  meetingLinkDraft.value = '';
  editingDetails.value = false;
  detailsError.value = '';
  try {
    const res = await api.get(`/escalations/${id}`, { skipGlobalLoading: true });
    detail.value = res.data;
    statusDraft.value = res.data?.escalation_status || 'submitted';
    assignDraft.value = res.data?.claimed_by_user_id ? String(res.data.claimed_by_user_id) : '';
    outcomeDraft.value = res.data?.resolution_outcome || '';
    meetingLinkDraft.value = res.data?.linked_schedule_event_id
      ? String(res.data.linked_schedule_event_id)
      : '';
    void loadAdminMeetings();
    messagesLoading.value = true;
    const msgRes = await api.get(`/escalations/${id}/messages`, { skipGlobalLoading: true });
    messages.value = msgRes.data?.messages || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load escalation';
  } finally {
    messagesLoading.value = false;
  }
}

function startEditDetails() {
  if (!detail.value) return;
  detailsDraft.value = {
    issue: String(detail.value.issue || ''),
    rootCause: String(detail.value.root_cause || ''),
    recommended: String(detail.value.recommended_resolution || ''),
    department: String(detail.value.affected_department || ''),
    project: String(detail.value.related_project || ''),
    immediate: !!detail.value.immediate_action_required
  };
  detailsError.value = '';
  editingDetails.value = true;
}

function cancelEditDetails() {
  editingDetails.value = false;
  detailsError.value = '';
}

async function saveDetails() {
  if (!detail.value || !canEditDetails.value) return;
  const issue = String(detailsDraft.value.issue || '').trim();
  const recommended = String(detailsDraft.value.recommended || '').trim();
  if (!issue || !recommended) {
    detailsError.value = 'Issue and recommended resolution are required.';
    return;
  }
  savingDetails.value = true;
  detailsError.value = '';
  try {
    const res = await api.patch(`/escalations/${detail.value.id}`, {
      issue,
      rootCause: String(detailsDraft.value.rootCause || '').trim() || null,
      recommendedResolution: recommended,
      affectedDepartment: String(detailsDraft.value.department || '').trim() || null,
      relatedProject: String(detailsDraft.value.project || '').trim() || null,
      immediateActionRequired: !!detailsDraft.value.immediate
    }, { skipGlobalLoading: true });
    detail.value = res.data;
    editingDetails.value = false;
    await refresh();
  } catch (e) {
    detailsError.value = e.response?.data?.error?.message || 'Failed to save details';
  } finally {
    savingDetails.value = false;
  }
}

async function saveStatus() {
  if (!detail.value || !canManage.value || isResolved.value) return;
  try {
    const res = await api.patch(`/escalations/${detail.value.id}/status`, {
      status: statusDraft.value
    });
    detail.value = { ...detail.value, ...res.data };
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update status';
  }
}

async function resolveEscalation() {
  if (!detail.value || !canManage.value || isResolved.value || resolving.value) return;
  resolving.value = true;
  error.value = '';
  try {
    const res = await api.patch(`/escalations/${detail.value.id}/status`, {
      status: 'resolved',
      resolutionOutcome: outcomeDraft.value.trim() || undefined
    });
    detail.value = { ...detail.value, ...res.data };
    statusDraft.value = 'resolved';
    outcomeDraft.value = res.data?.resolution_outcome || outcomeDraft.value;
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to resolve escalation';
  } finally {
    resolving.value = false;
  }
}

async function saveAssign() {
  if (!detail.value || !canManage.value || savingAssign.value) return;
  savingAssign.value = true;
  error.value = '';
  try {
    const assigneeUserId = assignDraft.value ? Number(assignDraft.value) : null;
    const res = await api.post(`/escalations/${detail.value.id}/assign`, {
      assigneeUserId
    }, { skipGlobalLoading: true });
    detail.value = res.data;
    statusDraft.value = res.data?.escalation_status || statusDraft.value;
    assignDraft.value = res.data?.claimed_by_user_id ? String(res.data.claimed_by_user_id) : '';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign';
    // Revert draft to the persisted owner so the dropdown does not lie.
    assignDraft.value = detail.value?.claimed_by_user_id ? String(detail.value.claimed_by_user_id) : '';
  } finally {
    savingAssign.value = false;
  }
}

async function sendMessage() {
  if (!detail.value || !reply.value.trim()) return;
  mentionSuggestions.value = [];
  sendingMsg.value = true;
  try {
    await api.post(`/escalations/${detail.value.id}/messages`, {
      body: reply.value.trim(),
      isInternal: replyInternal.value
    });
    reply.value = '';
    replyInternal.value = false;
    await loadDetail(detail.value.id);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send';
  } finally {
    sendingMsg.value = false;
  }
}

async function onAttach(ev) {
  const file = ev.target?.files?.[0];
  if (!file || !detail.value) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api.post(`/escalations/${detail.value.id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await loadDetail(detail.value.id);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Upload failed';
  } finally {
    ev.target.value = '';
  }
}

async function createEscalation() {
  if (!form.value.issue.trim() || !form.value.recommended.trim()) return;
  creating.value = true;
  createError.value = '';
  try {
    const res = await api.post('/escalations', {
      agencyId: agencyId.value,
      issue: form.value.issue.trim(),
      rootCause: form.value.rootCause.trim() || undefined,
      recommendedResolution: form.value.recommended.trim(),
      affectedDepartment: form.value.department.trim() || undefined,
      relatedProject: form.value.project.trim() || undefined,
      priority: form.value.priority,
      immediateActionRequired: form.value.immediate,
      ...(canManage.value && form.value.assigneeUserId
        ? { assigneeUserId: Number(form.value.assigneeUserId) }
        : {})
    });
    showCreate.value = false;
    form.value = {
      issue: '',
      rootCause: '',
      recommended: '',
      department: '',
      project: '',
      priority: 'medium',
      immediate: false,
      assigneeUserId: ''
    };
    await refresh();
    if (res.data?.id) await selectEscalation(res.data.id);
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create';
  } finally {
    creating.value = false;
  }
}

watch(
  () => showRouting.value,
  (on) => {
    if (on) loadRouting();
  }
);

watch(
  () => route.query?.id,
  async (id) => {
    const qid = id ? parseInt(id, 10) : null;
    if (qid && qid !== selectedId.value) await selectEscalation(qid);
  }
);

onMounted(async () => {
  await refresh();
  void loadAdminMeetings();
  const qid = route.query?.id ? parseInt(route.query.id, 10) : null;
  if (qid) await selectEscalation(qid);
});
</script>

<style scoped>
.esc-desk {
  width: 100%;
  max-width: none;
  min-height: calc(100vh - 120px);
  margin: 0;
  padding: 16px clamp(12px, 2vw, 28px) 28px;
  box-sizing: border-box;
  color: #0f172a;
}
.desk-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.desk-header h1 {
  margin: 0 0 4px;
  font-size: 1.5rem;
  font-weight: 800;
  color: #1f6b4a;
}
.sub { margin: 0; color: #64748b; font-size: 14px; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  border-radius: 10px;
  padding: 9px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: #fff;
}
.btn.primary { background: #1f6b4a; color: #fff; border-color: transparent; }
.btn.secondary { color: #0f172a; }
.btn.sm { padding: 6px 10px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.routing-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}
.routing-panel h3 { margin: 0 0 4px; font-size: 0.95rem; }
.hint { margin: 0 0 10px; font-size: 12px; color: #64748b; }
.routing-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.routing-row select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  min-width: 140px;
}
.routing-actions { display: flex; gap: 8px; }
.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.metric {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  min-width: 110px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.metric.on { border-color: #1f6b4a; box-shadow: 0 0 0 1px #1f6b4a; }
.metric span { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
.metric strong { font-size: 1.2rem; }
.desk-body {
  display: grid;
  grid-template-columns: minmax(300px, 36%) minmax(0, 1fr);
  gap: 16px;
  min-height: calc(100vh - 280px);
}
@media (min-width: 1400px) {
  .desk-body {
    grid-template-columns: minmax(360px, 32%) minmax(0, 1fr);
  }
}
@media (max-width: 900px) {
  .desk-body { grid-template-columns: 1fr; min-height: 0; }
}
.list-pane, .detail-pane {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
}
.list-pane { display: flex; flex-direction: column; }
.search {
  margin: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}
.list { list-style: none; margin: 0; padding: 0; overflow: auto; max-height: calc(100vh - 280px); }
.list li {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.list li.on { background: color-mix(in srgb, #1f6b4a 8%, #fff); }
.list li.urgent { border-left: 3px solid #b91c1c; }
.li-top { display: flex; justify-content: space-between; }
.mono { font-size: 11px; font-weight: 800; color: #1f6b4a; }
.list strong {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 700;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: normal;
}
.list small { font-size: 11px; color: #64748b; line-height: 1.35; }
.prio {
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
}
.prio.high { background: #fee2e2; color: #b91c1c; }
.detail-pane { padding: 16px 18px; }
.empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
}
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.detail-head-main {
  flex: 1;
  min-width: 0;
}
.detail-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.details-error {
  margin: 0 0 10px;
}
.detail-head h2 {
  margin: 0 0 6px;
  font-size: 1.15rem;
  line-height: 1.35;
  font-weight: 800;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.meta { margin: 0; font-size: 12px; color: #64748b; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 11px;
  background: #e2e8f0;
}
.badge.new { background: #dbeafe; color: #1d4ed8; }
.badge.active { background: #dcfce7; color: #15803d; }
.badge.wait { background: #ffedd5; color: #c2410c; }
.badge.done { background: #f1f5f9; color: #475569; }
.fields-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 14px 0;
}
@media (max-width: 700px) {
  .fields-grid { grid-template-columns: 1fr; }
}
.fields-grid section {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
}
.fields-grid h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #64748b; }
.fields-grid p { margin: 0; font-size: 13px; white-space: pre-wrap; }
.field-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  background: #fff;
  box-sizing: border-box;
}
.kv--edit li {
  align-items: center;
}
.kv--edit .field-input {
  max-width: 62%;
}
.check.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.meeting-link-section { grid-column: 1 / -1; }
.meeting-link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.meeting-select {
  flex: 1;
  min-width: 220px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
}
.kv { list-style: none; margin: 0; padding: 0; }
.kv li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  padding: 3px 0;
}
.kv span { color: #64748b; }
.manage-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
  padding: 12px;
  background: #f0fdf4;
  border-radius: 12px;
  margin-bottom: 14px;
}
.manage-bar label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.resolve-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  margin-bottom: 14px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 12px;
}
.resolve-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}
.resolve-notes .optional {
  font-weight: 500;
  color: #94a3b8;
}
.resolve-notes textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-weight: 400;
  resize: vertical;
  min-height: 56px;
}
.resolve-btn {
  width: 100%;
  padding: 14px 20px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.resolve-done {
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  font-size: 14px;
}
.resolve-done strong {
  display: block;
  margin-bottom: 6px;
  color: #166534;
}
.resolve-done p {
  margin: 0;
  color: #334155;
  white-space: pre-wrap;
}
.manage-bar select, .manage-bar input {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  min-width: 140px;
  font-size: 13px;
}
.manage-bar .grow { flex: 1; min-width: 180px; }
.thread h4, .attachments h4 { margin: 0 0 8px; font-size: 0.95rem; }
.msgs { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow: auto; }
.msgs li {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
}
.msgs li.internal { background: #fffbeb; border-color: #fde68a; }
.msg-h { display: flex; gap: 8px; align-items: center; font-size: 12px; margin-bottom: 4px; }
.msg-h time { margin-left: auto; color: #94a3b8; }
.internal-tag { font-size: 10px; font-weight: 800; color: #b45309; }
.msgs p { margin: 0; font-size: 13px; white-space: pre-wrap; }
.msg-body :deep(.mention) {
  color: #166534;
  font-weight: 700;
  background: #ecfdf5;
  border-radius: 4px;
  padding: 0 3px;
}
.composer-field { position: relative; }
.composer textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.mention-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 4px);
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 220px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  z-index: 8;
}
.mention-menu li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.mention-menu li span {
  font-size: 11px;
  color: #64748b;
  text-transform: capitalize;
}
.mention-menu li.on,
.mention-menu li:hover {
  background: #f0fdf4;
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.check { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
.file-btn {
  font-size: 12px;
  font-weight: 700;
  color: #1f6b4a;
  cursor: pointer;
}
.file-btn input { display: none; }
.muted { color: #94a3b8; font-size: 13px; }
.pad { padding: 12px; }
.error { color: #b91c1c; font-size: 13px; padding: 8px 12px; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 80; padding: 20px;
}
.modal {
  width: min(560px, 100%); background: #fff; border-radius: 16px; padding: 16px 18px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}
.modal header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.modal h3 { margin: 0; }
.x { border: none; background: none; font-size: 22px; cursor: pointer; color: #64748b; }
.modal form { display: flex; flex-direction: column; gap: 10px; }
.modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #475569; }
.modal input, .modal textarea, .modal select {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font: inherit; font-weight: 500; color: #0f172a;
}
.form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }
.modal footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
</style>
