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
          <div>
            <h2>#{{ detail.id }} · {{ detail.subject }}</h2>
            <p class="meta">
              <span class="badge" :class="statusTone(detail.escalation_status)">
                {{ statusLabel(detail.escalation_status) }}
              </span>
              · Submitted by {{ detail.created_by_name || '—' }}
              · {{ formatTime(detail.created_at) }}
            </p>
          </div>
        </div>

        <div class="fields-grid">
          <section>
            <h4>Issue</h4>
            <p>{{ detail.issue }}</p>
          </section>
          <section>
            <h4>Root cause</h4>
            <p>{{ detail.root_cause || '—' }}</p>
          </section>
          <section>
            <h4>Recommended resolution</h4>
            <p>{{ detail.recommended_resolution || '—' }}</p>
          </section>
          <section>
            <h4>Details</h4>
            <ul class="kv">
              <li><span>Department</span><strong>{{ detail.affected_department || '—' }}</strong></li>
              <li><span>Project</span><strong>{{ detail.related_project || '—' }}</strong></li>
              <li><span>Immediate</span><strong>{{ detail.immediate_action_required ? 'Yes' : 'No' }}</strong></li>
              <li><span>Owner</span><strong>{{ detail.claimed_by_name || 'Unassigned' }}</strong></li>
              <li v-if="detail.resolution_outcome"><span>Outcome</span><strong>{{ detail.resolution_outcome }}</strong></li>
            </ul>
          </section>
        </div>

        <div v-if="canManage" class="manage-bar">
          <label>
            Status
            <select v-model="statusDraft" @change="saveStatus">
              <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <label>
            Assign to
            <select v-model="assignDraft" @change="saveAssign">
              <option value="">—</option>
              <option v-for="u in assignees" :key="u.id" :value="String(u.id)">
                {{ u.last_name }}, {{ u.first_name }}
              </option>
            </select>
          </label>
          <label class="grow">
            Resolution outcome
            <input v-model="outcomeDraft" type="text" placeholder="Close the loop with the submitter…" />
          </label>
          <button type="button" class="btn secondary sm" @click="saveStatus">Save outcome</button>
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
              <p>{{ m.body }}</p>
            </li>
          </ul>
          <form class="composer" @submit.prevent="sendMessage">
            <textarea v-model="reply" rows="3" placeholder="Add an update…" />
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
  ESCALATION_STATUSES,
  escalationStatusLabel,
  escalationStatusTone
} from '../../utils/orgEscalations';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const statuses = ESCALATION_STATUSES;
const priorities = ESCALATION_PRIORITIES;
const statusLabel = escalationStatusLabel;
const statusTone = escalationStatusTone;

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManage = computed(() => ['admin', 'support', 'super_admin'].includes(role.value));
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
const replyInternal = ref(false);
const sendingMsg = ref(false);
const creating = ref(false);
const createError = ref('');
const form = ref({
  issue: '',
  rootCause: '',
  recommended: '',
  department: '',
  project: '',
  priority: 'medium',
  immediate: false
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
    if (canManage.value) await loadAssignees();
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
  try {
    const res = await api.get(`/escalations/${id}`, { skipGlobalLoading: true });
    detail.value = res.data;
    statusDraft.value = res.data?.escalation_status || 'submitted';
    assignDraft.value = res.data?.claimed_by_user_id ? String(res.data.claimed_by_user_id) : '';
    outcomeDraft.value = res.data?.resolution_outcome || '';
    messagesLoading.value = true;
    const msgRes = await api.get(`/escalations/${id}/messages`, { skipGlobalLoading: true });
    messages.value = msgRes.data?.messages || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load escalation';
  } finally {
    messagesLoading.value = false;
  }
}

async function saveStatus() {
  if (!detail.value || !canManage.value) return;
  try {
    const res = await api.patch(`/escalations/${detail.value.id}/status`, {
      status: statusDraft.value,
      resolutionOutcome: outcomeDraft.value || undefined
    });
    detail.value = { ...detail.value, ...res.data };
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update status';
  }
}

async function saveAssign() {
  if (!detail.value || !canManage.value || !assignDraft.value) return;
  try {
    const res = await api.post(`/escalations/${detail.value.id}/assign`, {
      assigneeUserId: Number(assignDraft.value)
    });
    detail.value = { ...detail.value, ...res.data };
    statusDraft.value = res.data?.escalation_status || statusDraft.value;
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign';
  }
}

async function sendMessage() {
  if (!detail.value || !reply.value.trim()) return;
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
      immediateActionRequired: form.value.immediate
    });
    showCreate.value = false;
    form.value = {
      issue: '',
      rootCause: '',
      recommended: '',
      department: '',
      project: '',
      priority: 'medium',
      immediate: false
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

onMounted(async () => {
  await refresh();
  const qid = route.query?.id ? parseInt(route.query.id, 10) : null;
  if (qid) await selectEscalation(qid);
});
</script>

<style scoped>
.esc-desk {
  padding: 20px 24px 40px;
  max-width: 1280px;
  margin: 0 auto;
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
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 14px;
  min-height: 520px;
}
@media (max-width: 900px) {
  .desk-body { grid-template-columns: 1fr; }
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
.list { list-style: none; margin: 0; padding: 0; overflow: auto; max-height: 70vh; }
.list li {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.list li.on { background: color-mix(in srgb, #1f6b4a 8%, #fff); }
.list li.urgent { border-left: 3px solid #b91c1c; }
.li-top { display: flex; justify-content: space-between; }
.mono { font-size: 11px; font-weight: 800; color: #1f6b4a; }
.list strong { font-size: 13px; }
.list small { font-size: 11px; color: #64748b; }
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
.detail-head h2 { margin: 0 0 6px; font-size: 1.15rem; }
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
.composer textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
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
