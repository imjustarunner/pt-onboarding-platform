<template>
  <div class="page">
    <div class="header" data-tour="tickets-header">
      <div>
        <h2 style="margin: 0;" data-tour="tickets-title">Tickets</h2>
        <div class="muted">Queue (school staff requests)</div>
      </div>
      <div class="actions" data-tour="tickets-filters">
        <label class="field">
          Search (optional)
          <input v-model="searchInput" class="input" type="text" placeholder="Subject, question, or school…" />
        </label>
        <label class="field">
          Agency
          <select v-model="agencyIdInput" class="input">
            <option value="">All</option>
            <option v-for="a in agencyFilterOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </label>
        <label class="field">
          School
          <select v-model="schoolIdInput" class="input">
            <option value="">All</option>
            <option v-for="s in schoolFilterOptions" :key="s.school_organization_id || s.id" :value="String(s.school_organization_id ?? s.id)">{{ s.school_name || s.name }}</option>
          </select>
        </label>
        <label class="field">
          Status
          <select v-model="status" class="input">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label class="field">
          Source
          <select v-model="sourceChannel" class="input">
            <option value="">All</option>
            <option value="portal">Portal</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label class="field">
          Draft State
          <select v-model="draftState" class="input">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="edited">Edited</option>
            <option value="rejected">Rejected</option>
            <option value="needs_review">Needs review</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="field">
          Sent
          <select v-model="sentState" class="input">
            <option value="">All</option>
            <option value="sent">Sent</option>
            <option value="unsent">Unsent</option>
          </select>
        </label>
        <button
          class="btn btn-secondary"
          type="button"
          @click="toggleViewMode"
          :title="viewMode === 'mine' ? 'Show all tickets' : 'Show my claimed tickets'"
        >
          {{ viewMode === 'mine' ? 'Show all tickets' : 'Show my tickets' }}
        </button>
        <button class="btn btn-primary" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          @click="toggleClientLabelMode"
          :title="clientLabelMode === 'codes' ? 'Show initials' : 'Show codes'"
        >
          {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="tickets.length === 0" class="muted">No tickets found.</div>

    <div v-else class="list" data-tour="tickets-list">
      <div v-for="t in tickets" :key="t.id" class="ticket" :class="ticketClass(t)">
        <div class="ticket-top" data-tour="tickets-row">
          <div class="left">
            <div class="ticket-line">
              <span v-if="t.client_id" class="client-pill" :title="clientLabelTitle(t)">
                {{ formatClientLabel(t) }}
              </span>
              <strong class="ticket-subject">{{ t.subject || 'Support ticket' }}</strong>
              <span class="inline-sep">•</span>
              <span class="inline-meta">
                Submitted by {{ formatCreatedBy(t) }}
                <span v-if="t.created_by_email">({{ t.created_by_email }})</span>
              </span>
              <span class="inline-sep">•</span>
              <span class="inline-meta">
                <template v-if="t.agency_name || t.school_name || t.school_organization_id">
                  <span v-if="t.agency_name">{{ t.agency_name }}</span>
                  <span v-if="t.agency_name && (t.school_name || t.school_organization_id)"> → </span>
                  <span v-if="t.school_name">{{ t.school_name }}</span>
                  <span v-else-if="t.school_organization_id">School ID {{ t.school_organization_id }}</span>
                </template>
                <span v-else>—</span>
              </span>
              <span class="inline-sep">•</span>
              <span class="inline-meta">{{ formatDateTime(t.created_at) }}</span>
              <span class="inline-sep">•</span>
              <span class="inline-meta ellipsis" :title="t.question">Q: {{ t.question }}</span>
              <span v-if="t.source_channel === 'email'" class="pill status-pill">Email</span>
              <span v-if="t.escalation_reason" class="pill stale">Needs review: {{ formatEscalationReason(t.escalation_reason) }}</span>
              <span v-if="t.sent_at" class="pill status-pill">Sent</span>
              <span v-if="t.answer" class="inline-sep">•</span>
              <span v-if="t.answer" class="inline-meta ellipsis">A: {{ t.answer }}</span>
              <span class="pill status-pill">{{ formatStatus(t.status) }}</span>
              <span class="ticket-id">#{{ t.id }}</span>
              <button
                v-if="t.claimed_by_user_id"
                class="pill claimed claimed-btn"
                type="button"
                :disabled="!canAssignOthers"
                @click.stop="toggleAssignPicker(t)"
                :title="canAssignOthers ? 'Change assignee' : 'Claimed'"
              >
                Claimed: {{ formatClaimedBy(t) }}
              </button>
              <span v-if="isStale(t)" class="pill stale">STALE</span>
            </div>
          </div>
          <div class="right">
            <button
              v-if="t.client_id"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="openAdminClientEditor(t)"
              :disabled="adminClientLoading"
              title="Edit this client"
            >
              {{ adminClientLoading ? 'Loading…' : 'Edit client' }}
            </button>
            <button
              v-if="!t.claimed_by_user_id"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="claimTicket(t)"
              :disabled="claimingId === t.id"
              title="Assign this ticket to you"
            >
              {{ claimingId === t.id ? 'Assigning…' : claimLabel }}
            </button>
            <button
              v-else-if="Number(t.claimed_by_user_id) === Number(myUserId)"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="unclaimTicket(t)"
              :disabled="unclaimingId === t.id"
              title="Return this ticket to the unclaimed queue"
            >
              {{ unclaimingId === t.id ? 'Unclaiming…' : 'Unclaim' }}
            </button>
            <button
              v-else-if="Number(t.claimed_by_user_id) !== Number(myUserId) && canAssignOthers"
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="assigningId === t.id"
              @click="takeOverTicket(t)"
              :title="isStale(t) ? 'Take over this stale ticket' : 'Reassign this ticket to you'"
            >
              {{ assigningId === t.id ? 'Taking over…' : 'Take over' }}
            </button>
            <button
              v-else-if="Number(t.claimed_by_user_id) !== Number(myUserId) && !canAssignOthers"
              class="btn btn-secondary btn-sm"
              type="button"
              disabled
              title="This ticket is already claimed"
            >
              Claimed
            </button>
            <button
              v-if="openAnswerId !== t.id"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="toggleAnswer(t.id)"
            >
              Answer
            </button>
            <button
              v-if="Number(t.claimed_by_user_id) && Number(t.claimed_by_user_id) !== Number(myUserId)"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="confirmJoin(t)"
              title="Join this ticket thread"
            >
              Join
            </button>
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              @click="confirmClose(t)"
              title="Close this ticket"
            >
              Close
            </button>
            <div v-if="canAssignOthers && showAssignByTicketId[t.id]" class="assign">
              <select v-model="assigneeByTicket[t.id]" class="input input-sm">
                <option value="">Assign…</option>
                <option v-for="u in assignees" :key="u.id" :value="String(u.id)">
                  {{ formatAssignee(u) }}
                </option>
              </select>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="assigningId === t.id || !assigneeByTicket[t.id]"
                @click="confirmAssign(t)"
              >
                {{ assigningId === t.id ? 'Assigning…' : 'Assign' }}
              </button>
            </div>
            <button
              v-if="t.answer && (String(t.status || '').toLowerCase() === 'answered' || String(t.status || '').toLowerCase() === 'closed')"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="convertToFaq(t)"
              :disabled="convertingFaqId === t.id"
              title="Create a pending School Portal FAQ entry from this ticket"
            >
              {{ convertingFaqId === t.id ? 'Creating…' : 'To FAQ' }}
            </button>
          </div>
        </div>

          <div v-if="openAnswerId === t.id" class="answer-box" data-tour="tickets-answer-box">
          <div v-if="t.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)" class="error">
            This ticket is claimed by {{ formatClaimedBy(t) }}. You can still view it, but you can’t answer unless you are the claimant.
          </div>
            <div class="answer-question" v-if="t.question">
              <div class="label">Question</div>
              <div class="text">{{ t.question }}</div>
            </div>
            <div v-if="t.ai_draft_response" class="answer-question">
              <div class="label">AI draft</div>
              <div class="text">{{ t.ai_draft_response }}</div>
              <div v-if="t._draftMeta?.extractedClientReference || t.source_email_from" class="muted" style="margin-top: 8px;">
                <div v-if="t.source_email_from"><strong>From:</strong> {{ t.source_email_from }}</div>
                <div v-if="t.source_email_subject"><strong>Email subject:</strong> {{ t.source_email_subject }}</div>
                <div v-if="t.email_ingested_at || t.source_email_received_at"><strong>Received:</strong> {{ formatDateTime(t.email_ingested_at || t.source_email_received_at) }}</div>
                <div v-if="t._draftMeta?.extractedClientReference"><strong>Extracted client:</strong> {{ t._draftMeta.extractedClientReference }}</div>
                <div v-if="t._draftMeta?.matchReason"><strong>Match reason:</strong> {{ t._draftMeta.matchReason }}</div>
                <div v-if="t._draftMeta?.knownContact !== undefined || t._draftMeta?.knownAccount !== undefined">
                  <strong>Sender known:</strong>
                  contact={{ t._draftMeta?.knownContact ? 'yes' : 'no' }}, account={{ t._draftMeta?.knownAccount ? 'yes' : 'no' }}
                </div>
              </div>
              <div class="answer-buttons" style="margin-top: 8px;">
                <button class="btn btn-secondary btn-sm" type="button" @click="useAiDraft(t)" :disabled="submitting">
                  Use draft
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="copyAiDraft(t)" :disabled="submitting">
                  Copy draft
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="markDraftReview(t, 'accepted')"
                  :disabled="reviewingDraftId === t.id"
                >
                  {{ reviewingDraftId === t.id ? 'Saving…' : 'Mark accepted' }}
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="markDraftReview(t, 'rejected')"
                  :disabled="reviewingDraftId === t.id"
                >
                  {{ reviewingDraftId === t.id ? 'Saving…' : 'Mark rejected' }}
                </button>
                <button
                  v-if="t.source_channel === 'email' && !t.sent_at"
                  class="btn btn-primary btn-sm"
                  type="button"
                  @click="markDraftSent(t)"
                  :disabled="markingSentId === t.id"
                >
                  {{ markingSentId === t.id ? 'Saving…' : 'Mark sent' }}
                </button>
              </div>
              <div v-if="t.ai_draft_review_state || t.sent_at" class="muted" style="margin-top: 8px;">
                <span v-if="t.ai_draft_review_state">Review: {{ t.ai_draft_review_state }}</span>
                <span v-if="t.approved_by_first_name || t.approved_by_last_name">
                  {{ t.ai_draft_review_state ? ' • ' : '' }}
                  Approved by: {{ [t.approved_by_first_name, t.approved_by_last_name].filter(Boolean).join(' ') }}
                </span>
                <span v-if="t.sent_at">{{ (t.ai_draft_review_state || t.approved_by_first_name || t.approved_by_last_name) ? ' • ' : '' }}Sent: {{ formatDateTime(t.sent_at) }}</span>
              </div>
            </div>
          <label class="field" style="width: 100%;">
            Answer
            <textarea v-model="answerText" class="textarea" rows="4" placeholder="Type your response…" />
          </label>
          <div class="answer-actions">
            <div class="answer-note">Submit as answered, or close when read.</div>
            <div class="answer-buttons">
              <button
                class="btn btn-secondary"
                type="button"
                @click="generateDraftResponse(t)"
                :disabled="generatingResponse || submitting"
              >
                {{ generatingResponse ? 'Generating…' : 'Generate draft' }}
              </button>
              <button
                class="btn btn-primary"
                type="button"
                @click="submitAnswer(t, 'answered')"
                :disabled="submitting || !answerText.trim()"
              >
                {{ submitting ? 'Sending…' : 'Submit Answer' }}
              </button>
              <button
                class="btn btn-secondary"
                type="button"
                @click="submitAnswer(t, 'close_on_read')"
                :disabled="submitting || !answerText.trim()"
              >
                Submit & Close on Read
              </button>
              <button class="btn btn-secondary" type="button" @click="toggleAnswer(t.id)" :disabled="submitting">
                Back
              </button>
            </div>
          </div>
          <div v-if="answerError" class="error">{{ answerError }}</div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="confirmOpen" class="modal-overlay" @click.self="closeConfirm">
    <div class="modal-content">
      <div class="modal-header">
        <h3 style="margin:0;">{{ confirmTitle }}</h3>
        <button class="btn-close" type="button" title="Close" @click="closeConfirm">×</button>
      </div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom: 10px;">{{ confirmMessage }}</div>
        <label class="field">
          Type <strong>{{ confirmWord }}</strong> to confirm
          <input v-model="confirmInput" class="input" type="text" />
        </label>
        <div style="display:flex; gap: 8px; margin-top: 10px;">
          <button class="btn btn-primary" type="button" :disabled="!confirmReady" @click="submitConfirm">
            Confirm
          </button>
          <button class="btn btn-secondary" type="button" @click="closeConfirm">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="threadOpen" class="modal-overlay" @click.self="closeThread">
    <div class="modal-content">
      <div class="modal-header">
        <h3 style="margin:0;">Ticket thread</h3>
        <button class="btn-close" type="button" title="Close" @click="closeThread">×</button>
      </div>
      <div class="modal-body">
        <div v-if="threadLoading" class="muted">Loading…</div>
        <div v-else-if="threadError" class="error">{{ threadError }}</div>
        <div v-else class="thread-list">
          <div v-if="threadMessages.length === 0" class="muted">No messages yet.</div>
          <div v-else class="thread-item" v-for="m in threadMessages" :key="m.id">
            <div class="thread-meta">
              <span class="thread-author">{{ formatThreadAuthor(m) }}</span>
              <span class="thread-time">{{ formatDateTime(m.created_at) }}</span>
            </div>
            <div class="thread-body">{{ m.body || '(deleted)' }}</div>
          </div>
        </div>
        <label class="field" style="margin-top: 12px;">
          Add message
          <textarea v-model="threadBody" class="textarea" rows="3" placeholder="Type a reply…" />
        </label>
        <div style="display:flex; gap: 8px;">
          <button class="btn btn-primary" type="button" :disabled="threadSending || !threadBody.trim()" @click="sendThreadMessage">
            {{ threadSending ? 'Sending…' : 'Send' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="closeThread">Close</button>
        </div>
      </div>
    </div>
  </div>

  <ClientDetailPanel
    v-if="adminSelectedClient"
    :client="adminSelectedClient"
    @close="closeAdminClientEditor"
    @updated="handleAdminClientUpdated"
  />
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const myUserId = authStore.user?.id || null;
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperAdmin = computed(() => roleNorm.value === 'super_admin');
const canAssignOthers = computed(() => (
  roleNorm.value === 'admin' ||
  roleNorm.value === 'support' ||
  roleNorm.value === 'super_admin' ||
  roleNorm.value === 'clinical_practice_assistant' ||
  roleNorm.value === 'provider_plus'
));
const claimLabel = computed(() => (roleNorm.value === 'school_staff' || roleNorm.value === 'staff' ? 'Assign to me' : 'Claim'));

const tickets = ref([]);
const loading = ref(false);
const error = ref('');

const agencyIdInput = ref('');
const schoolIdInput = ref('');
const schoolFilterOptions = ref([]);
const status = ref('');
const sourceChannel = ref('');
const draftState = ref('');
const sentState = ref('');
const viewMode = ref('all');
const searchInput = ref('');

const openAnswerId = ref(null);
const answerText = ref('');
const submitting = ref(false);
const generatingResponse = ref(false);
const reviewingDraftId = ref(null);
const markingSentId = ref(null);
const answerError = ref('');
const claimingId = ref(null);
const unclaimingId = ref(null);
const convertingFaqId = ref(null);
const assignees = ref([]);
const assigneeByTicket = ref({});
const assigningId = ref(null);
const confirmOpen = ref(false);
const confirmAction = ref('');
const confirmTicket = ref(null);
const confirmInput = ref('');
const threadOpen = ref(false);
const threadTicket = ref(null);
const threadMessages = ref([]);
const threadLoading = ref(false);
const threadError = ref('');
const threadBody = ref('');
const threadSending = ref(false);
const adminSelectedClient = ref(null);
const adminClientLoading = ref(false);
const clientLabelMode = ref('codes'); // 'codes' | 'initials'
const showAssignByTicketId = ref({});

const confirmWord = computed(() => {
  if (confirmAction.value === 'assign') return 'ASSIGN';
  if (confirmAction.value === 'join') return 'JOIN';
  if (confirmAction.value === 'close') return 'CLOSE';
  return 'CONFIRM';
});
const confirmTitle = computed(() => {
  if (confirmAction.value === 'assign') return 'Re-assign ticket';
  if (confirmAction.value === 'join') return 'Join ticket';
  if (confirmAction.value === 'close') return 'Close ticket';
  return 'Confirm';
});
const confirmMessage = computed(() => {
  if (confirmAction.value === 'assign') return 'This will re-assign the ticket. Continue?';
  if (confirmAction.value === 'join') return 'You are about to join a ticket claimed by another team member.';
  if (confirmAction.value === 'close') return 'This will close the ticket.';
  return 'Please confirm.';
});
const confirmReady = computed(() => String(confirmInput.value || '').trim().toUpperCase() === confirmWord.value);

const agencyFilterOptions = computed(() => {
  const list = isSuperAdmin.value
    ? (agencyStore.agencies?.value || agencyStore.agencies || [])
    : (agencyStore.userAgencies?.value || agencyStore.userAgencies || []);
  return (Array.isArray(list) ? list : []).filter(
    (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
  );
});

const fetchSchoolsForAgency = async (agencyId) => {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid < 1) {
    schoolFilterOptions.value = [];
    return;
  }
  try {
    const r = await api.get(`/agencies/${aid}/schools`);
    schoolFilterOptions.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    schoolFilterOptions.value = [];
  }
};

watch(agencyIdInput, async (val) => {
  if (val) {
    await fetchSchoolsForAgency(val);
    const sid = Number(schoolIdInput.value);
    if (Number.isFinite(sid) && sid > 0) {
      const inList = (schoolFilterOptions.value || []).some((s) => Number(s?.id) === sid);
      if (!inList) schoolIdInput.value = '';
    }
  } else {
    schoolFilterOptions.value = [];
    schoolIdInput.value = '';
  }
});

const syncFromQuery = () => {
  const qAgency = route.query?.agencyId;
  if (qAgency !== undefined && qAgency !== null && String(qAgency).trim() !== '') {
    const n = Number(qAgency);
    if (Number.isFinite(n) && n > 0) {
      agencyIdInput.value = String(n);
      fetchSchoolsForAgency(n);
    }
  }
  const qSchool = route.query?.schoolOrganizationId;
  if (qSchool !== undefined && qSchool !== null && String(qSchool).trim() !== '') {
    const n = Number(qSchool);
    if (Number.isFinite(n) && n > 0) schoolIdInput.value = String(n);
  }
  const qStatus = String(route.query?.status || '').trim().toLowerCase();
  if (qStatus === 'open' || qStatus === 'answered' || qStatus === 'closed') status.value = qStatus;
  const qSource = String(route.query?.sourceChannel || '').trim().toLowerCase();
  if (qSource === 'portal' || qSource === 'email') sourceChannel.value = qSource;
  const qDraftState = String(route.query?.draftState || '').trim().toLowerCase();
  if (['pending', 'accepted', 'edited', 'rejected', 'needs_review', 'none'].includes(qDraftState)) {
    draftState.value = qDraftState;
  }
  const qSentState = String(route.query?.sentState || '').trim().toLowerCase();
  if (qSentState === 'sent' || qSentState === 'unsent') sentState.value = qSentState;
  const qMine = String(route.query?.mine || '').trim().toLowerCase();
  viewMode.value = qMine === 'true' || qMine === '1' ? 'mine' : 'all';
  const qSearch = route.query?.q;
  if (qSearch !== undefined && qSearch !== null && String(qSearch).trim() !== '') {
    searchInput.value = String(qSearch).slice(0, 120);
  }

  const qTicketId = route.query?.ticketId;
  if (qTicketId !== undefined && qTicketId !== null && String(qTicketId).trim() !== '') {
    const n = Number(qTicketId);
    if (Number.isFinite(n) && n > 0) openAnswerId.value = n;
  }
};

const resolveAgencyId = () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (current?.id) return Number(current.id);
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  return list?.[0]?.id ? Number(list[0].id) : null;
};

const loadAssignees = async () => {
  if (!canAssignOthers.value) return;
  try {
    await agencyStore.fetchUserAgencies();
    const agencyId = resolveAgencyId();
    if (!agencyId) return;
    const resp = await api.get('/support-tickets/assignees', { params: { agencyId } });
    assignees.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  } catch {
    assignees.value = [];
  }
};

const formatAssignee = (u) => {
  const name = [String(u.first_name || '').trim(), String(u.last_name || '').trim()].filter(Boolean).join(' ').trim();
  return name || `User #${u.id}`;
};

const toggleClientLabelMode = () => {
  const next = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  clientLabelMode.value = next;
  try {
    window.localStorage.setItem('adminTicketsClientLabelMode', next);
  } catch {
    // ignore
  }
};

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'mine' ? 'all' : 'mine';
  load();
};

const formatClientLabel = (t) => {
  const initials = String(t?.client_initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(t?.client_identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (clientLabelMode.value === 'initials') return initials || code || '—';
  return code || initials || '—';
};

const clientLabelTitle = (t) => {
  if (clientLabelMode.value !== 'codes') return '';
  const initials = String(t?.client_initials || '').replace(/\s+/g, '').toUpperCase();
  return initials || '';
};

const formatCreatedBy = (t) => {
  const fn = String(t?.created_by_first_name || '').trim();
  const ln = String(t?.created_by_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  if (name) return name;
  return t?.created_by_email || `User #${t?.created_by_user_id || '—'}`;
};

const pushQuery = () => {
  const q = { ...route.query };
  const aid = Number(agencyIdInput.value);
  if (Number.isFinite(aid) && aid > 0) q.agencyId = String(aid);
  else delete q.agencyId;
  const sid = Number(schoolIdInput.value);
  if (Number.isFinite(sid) && sid > 0) q.schoolOrganizationId = String(sid);
  else delete q.schoolOrganizationId;
  if (status.value) q.status = status.value;
  else delete q.status;
  if (sourceChannel.value) q.sourceChannel = sourceChannel.value;
  else delete q.sourceChannel;
  if (draftState.value) q.draftState = draftState.value;
  else delete q.draftState;
  if (sentState.value) q.sentState = sentState.value;
  else delete q.sentState;
  if (viewMode.value === 'mine') q.mine = 'true';
  else delete q.mine;
  if (searchInput.value && searchInput.value.trim()) q.q = searchInput.value.trim().slice(0, 120);
  else delete q.q;
  // Keep ticketId only when we have an open answer box (so deep links are stable).
  if (openAnswerId.value) q.ticketId = String(openAnswerId.value);
  else delete q.ticketId;
  router.replace({ query: q });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    pushQuery();

    const params = {};
    const aid = Number(agencyIdInput.value);
    if (Number.isFinite(aid) && aid > 0) params.agencyId = aid;
    const sid = Number(schoolIdInput.value);
    if (Number.isFinite(sid) && sid > 0) params.schoolOrganizationId = sid;
    if (status.value) params.status = status.value;
    if (sourceChannel.value) params.sourceChannel = sourceChannel.value;
    if (draftState.value) params.draftState = draftState.value;
    if (sentState.value) params.sentState = sentState.value;
    if (viewMode.value === 'mine') params.mine = true;
    if (searchInput.value && searchInput.value.trim()) params.q = searchInput.value.trim().slice(0, 120);

    const r = await api.get('/support-tickets', { params });
    tickets.value = (Array.isArray(r.data) ? r.data : []).map((ticket) => ({
      ...ticket,
      _draftMeta: parseDraftMetadata(ticket?.ai_draft_metadata_json)
    }));

    const nextAssignees = {};
    for (const t of tickets.value) {
      if (t?.claimed_by_user_id) nextAssignees[t.id] = String(t.claimed_by_user_id);
    }
    assigneeByTicket.value = nextAssignees;

    // If a ticketId was supplied in the URL but isn't in the current list, clear it.
    if (openAnswerId.value && !(tickets.value || []).some((t) => Number(t?.id) === Number(openAnswerId.value))) {
      openAnswerId.value = null;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load support tickets';
    tickets.value = [];
  } finally {
    loading.value = false;
  }
};

const parseDraftMetadata = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
};

const autoClaimedTicketId = ref(null);

const toggleAnswer = async (ticketId) => {
  if (openAnswerId.value === ticketId) {
    openAnswerId.value = null;
    answerText.value = '';
    answerError.value = '';
    if (Number(autoClaimedTicketId.value) === Number(ticketId)) {
      const t = (tickets.value || []).find((row) => Number(row?.id) === Number(ticketId));
      if (t && Number(t.claimed_by_user_id) === Number(myUserId)) {
        unclaimingId.value = t.id;
        try {
          await api.post(`/support-tickets/${t.id}/unclaim`);
          await load();
        } catch (e) {
          error.value = e.response?.data?.error?.message || 'Failed to unclaim ticket';
        } finally {
          unclaimingId.value = null;
        }
      }
      autoClaimedTicketId.value = null;
    }
    return;
  }
  openAnswerId.value = ticketId;
  answerText.value = '';
  answerError.value = '';
  const t = (tickets.value || []).find((row) => Number(row?.id) === Number(ticketId));
  if (t && !t.claimed_by_user_id) {
    claimingId.value = t.id;
    try {
      await api.post(`/support-tickets/${t.id}/claim`);
      await load();
      autoClaimedTicketId.value = t.id;
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to claim ticket';
    } finally {
      claimingId.value = null;
    }
  }
};

const formatClaimedBy = (t) => {
  const fn = String(t?.claimed_by_first_name || '').trim();
  const ln = String(t?.claimed_by_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  if (name) return name;
  return `User #${t.claimed_by_user_id}`;
};

const toggleAssignPicker = (t) => {
  if (!canAssignOthers.value || !t?.id) return;
  const key = String(t.id);
  showAssignByTicketId.value = {
    ...(showAssignByTicketId.value || {}),
    [key]: !showAssignByTicketId.value?.[key]
  };
};

const ticketClass = (t) => {
  const claimedId = Number(t?.claimed_by_user_id || 0);
  const me = Number(myUserId || 0);
  const status = String(t?.status || '').toLowerCase();
  if (claimedId && claimedId === me) return 'ticket-assigned-me';
  if (claimedId && claimedId !== me) return 'ticket-assigned-other';
  if (status === 'answered') return 'ticket-answered';
  if (status === 'closed') return 'ticket-closed';
  return 'ticket-open';
};

const claimTicket = async (t) => {
  try {
    if (!t?.id) return;
    claimingId.value = t.id;
    await api.post(`/support-tickets/${t.id}/claim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to claim ticket';
  } finally {
    claimingId.value = null;
  }
};

const unclaimTicket = async (t) => {
  try {
    if (!t?.id) return;
    unclaimingId.value = t.id;
    await api.post(`/support-tickets/${t.id}/unclaim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to unclaim ticket';
  } finally {
    unclaimingId.value = null;
  }
};

const confirmAssign = (t) => {
  const current = Number(t?.claimed_by_user_id || 0);
  const next = Number(assigneeByTicket.value?.[t?.id] || 0);
  if (!t?.id || !next) return;
  if (current && current !== next) {
    confirmAction.value = 'assign';
    confirmTicket.value = t;
    confirmInput.value = '';
    confirmOpen.value = true;
    return;
  }
  assignTicket(t);
};

const confirmJoin = (t) => {
  if (!t?.id) return;
  confirmAction.value = 'join';
  confirmTicket.value = t;
  confirmInput.value = '';
  confirmOpen.value = true;
};

const confirmClose = (t) => {
  if (!t?.id) return;
  confirmAction.value = 'close';
  confirmTicket.value = t;
  confirmInput.value = '';
  confirmOpen.value = true;
};

const closeConfirm = () => {
  confirmOpen.value = false;
  confirmAction.value = '';
  confirmTicket.value = null;
  confirmInput.value = '';
};

const submitConfirm = async () => {
  if (!confirmReady.value) return;
  const t = confirmTicket.value;
  const action = confirmAction.value;
  closeConfirm();
  if (action === 'assign') {
    await assignTicket(t);
    return;
  }
  if (action === 'join') {
    await openThread(t);
    return;
  }
  if (action === 'close') {
    await closeTicket(t);
  }
};

const takeOverTicket = async (t) => {
  try {
    if (!t?.id || !myUserId) return;
    assigningId.value = t.id;
    await api.post(`/support-tickets/${t.id}/assign`, { assigneeUserId: myUserId });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to take over ticket';
  } finally {
    assigningId.value = null;
  }
};

const assignTicket = async (t) => {
  try {
    if (!t?.id) return;
    const assigneeUserId = Number(assigneeByTicket.value?.[t.id] || 0);
    if (!assigneeUserId) return;
    assigningId.value = t.id;
    await api.post(`/support-tickets/${t.id}/assign`, { assigneeUserId });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign ticket';
  } finally {
    assigningId.value = null;
  }
};

const closeTicket = async (t) => {
  try {
    if (!t?.id) return;
    assigningId.value = t.id;
    await api.post(`/support-tickets/${t.id}/close`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to close ticket';
  } finally {
    assigningId.value = null;
  }
};

const openThread = async (t) => {
  try {
    threadOpen.value = true;
    threadTicket.value = t;
    threadLoading.value = true;
    threadError.value = '';
    const r = await api.get(`/support-tickets/${t.id}/messages`);
    threadMessages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
  } catch (e) {
    threadError.value = e.response?.data?.error?.message || 'Failed to load thread';
    threadMessages.value = [];
  } finally {
    threadLoading.value = false;
  }
};

const closeThread = () => {
  threadOpen.value = false;
  threadTicket.value = null;
  threadMessages.value = [];
  threadError.value = '';
  threadBody.value = '';
};

const sendThreadMessage = async () => {
  try {
    if (!threadTicket.value?.id) return;
    threadSending.value = true;
    const r = await api.post(`/support-tickets/${threadTicket.value.id}/messages`, { body: threadBody.value });
    const msg = r.data?.message || null;
    if (msg) threadMessages.value = [...threadMessages.value, msg];
    threadBody.value = '';
  } catch (e) {
    threadError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    threadSending.value = false;
  }
};

const formatThreadAuthor = (m) => {
  const fn = String(m?.author_first_name || '').trim();
  const ln = String(m?.author_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  return name || `User #${m?.author_user_id || '—'}`;
};

const isStale = (t) => {
  if (!t?.claimed_by_user_id || Number(t.claimed_by_user_id) === Number(myUserId)) return false;
  if (String(t.status || '').toLowerCase() !== 'open') return false;
  const claimedAt = t.claimed_at ? new Date(t.claimed_at).getTime() : 0;
  if (!Number.isFinite(claimedAt) || claimedAt <= 0) return false;
  const hours = (Date.now() - claimedAt) / (1000 * 60 * 60);
  return hours >= 24;
};

const submitAnswer = async (t, mode = 'answered') => {
  try {
    submitting.value = true;
    answerError.value = '';
    // Prevent answering if someone else owns it
    if (t?.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)) {
      answerError.value = `Ticket is claimed by ${formatClaimedBy(t)}.`;
      return;
    }
    const closeOnRead = mode === 'close_on_read';
    const draftText = String(t?.ai_draft_response || '').trim();
    const answerFinal = answerText.value.trim();
    let aiDraftDecision = null;
    if (draftText) aiDraftDecision = draftText === answerFinal ? 'accepted' : 'edited';
    await api.post(`/support-tickets/${t.id}/answer`, {
      answer: answerFinal,
      status: 'answered',
      closeOnRead,
      aiDraftDecision
    });
    autoClaimedTicketId.value = null;
    openAnswerId.value = null;
    answerText.value = '';
    await load();
  } catch (e) {
    answerError.value = e.response?.data?.error?.message || 'Failed to submit answer';
  } finally {
    submitting.value = false;
  }
};

const useAiDraft = (t) => {
  const draft = String(t?.ai_draft_response || '').trim();
  if (!draft) return;
  answerText.value = draft;
};

const copyAiDraft = async (t) => {
  const draft = String(t?.ai_draft_response || '').trim();
  if (!draft) return;
  try {
    await navigator.clipboard.writeText(draft);
  } catch {
    // ignore
  }
};

const markDraftReview = async (t, state) => {
  if (!t?.id) return;
  try {
    reviewingDraftId.value = t.id;
    await api.post(`/support-tickets/${t.id}/review-draft`, { state });
    await load();
  } catch (e) {
    answerError.value = e.response?.data?.error?.message || 'Failed to update draft review state';
  } finally {
    reviewingDraftId.value = null;
  }
};

const markDraftSent = async (t) => {
  if (!t?.id) return;
  try {
    markingSentId.value = t.id;
    await api.post(`/support-tickets/${t.id}/mark-sent`);
    await load();
  } catch (e) {
    answerError.value = e.response?.data?.error?.message || 'Failed to mark draft as sent';
  } finally {
    markingSentId.value = null;
  }
};

const generateDraftResponse = async (t) => {
  try {
    if (!t?.id) return;
    answerError.value = '';
    // Prevent generating if someone else owns it
    if (t?.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)) {
      answerError.value = `Ticket is claimed by ${formatClaimedBy(t)}.`;
      return;
    }
    generatingResponse.value = true;
    const r = await api.post(`/support-tickets/${t.id}/generate-response`);
    const draft = String(r.data?.suggestedAnswer || '').trim();
    if (!draft) {
      answerError.value = 'No draft was generated.';
      return;
    }
    const existing = String(answerText.value || '').trim();
    answerText.value = existing ? `${existing}\n\n---\n\n${draft}` : draft;
  } catch (e) {
    answerError.value = e.response?.data?.error?.message || 'Failed to generate draft response';
  } finally {
    generatingResponse.value = false;
  }
};

const convertToFaq = async (t) => {
  try {
    if (!t?.id) return;
    convertingFaqId.value = t.id;
    await api.post('/faqs/from-ticket', { ticketId: t.id });
    alert('Created a pending FAQ entry. You can edit/publish it under Admin → FAQ.');
  } catch (e) {
    const msg = e.response?.data?.error?.message || 'Failed to create FAQ from ticket';
    alert(msg);
  } finally {
    convertingFaqId.value = null;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
};

const formatEscalationReason = (value) => {
  const v = String(value || '').trim().replace(/_/g, ' ');
  if (!v) return '';
  return v.charAt(0).toUpperCase() + v.slice(1);
};

const openAdminClientEditor = async (ticket) => {
  const clientId = Number(ticket?.client_id || 0);
  if (!clientId) return;
  adminClientLoading.value = true;
  try {
    const r = await api.get(`/clients/${clientId}`);
    adminSelectedClient.value = r.data || null;
  } catch (e) {
    console.error('Failed to open client editor:', e);
    alert(e.response?.data?.error?.message || e.message || 'Failed to open client editor');
    adminSelectedClient.value = null;
  } finally {
    adminClientLoading.value = false;
  }
};

const closeAdminClientEditor = () => {
  adminSelectedClient.value = null;
};

const handleAdminClientUpdated = (payload) => {
  if (payload?.client) {
    adminSelectedClient.value = payload.client;
  }
};

onMounted(async () => {
  try {
    const saved = window.localStorage.getItem('adminTicketsClientLabelMode');
    if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
  syncFromQuery();
  await agencyStore.fetchUserAgencies();
  if (isSuperAdmin.value) {
    const agencies = agencyStore.agencies?.value ?? agencyStore.agencies ?? [];
    if (!Array.isArray(agencies) || agencies.length === 0) await agencyStore.fetchAgencies();
  }
  if (agencyIdInput.value) await fetchSchoolsForAgency(agencyIdInput.value);
  await loadAssignees();
  await load();
});
</script>

<style scoped>
.page {
  padding: 22px;
}
.header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.muted {
  color: var(--text-secondary);
}
.actions {
  display: flex;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
}
.stale {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #b91c1c;
}
.thread-list {
  display: grid;
  gap: 10px;
}
.thread-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--bg-alt);
}
.thread-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.thread-body {
  white-space: pre-wrap;
}
.assign {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.input-sm {
  padding: 6px 8px;
  font-size: 12px;
}
.field {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  display: block;
}
.input, .textarea {
  width: 100%;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
  margin-top: 6px;
}
.textarea {
  min-width: 0;
}
.error {
  color: #b32727;
  margin: 10px 0;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ticket {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 12px;
}
.ticket-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.ticket-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 0;
}
.ticket-subject {
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inline-meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.inline-sep {
  color: var(--text-secondary);
  font-size: 12px;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.client-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.pill {
  font-size: 12px;
  color: var(--text-secondary);
}
.status-pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--bg-alt);
}
.pill.claimed {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--bg-alt);
}
.pill.claimed-btn {
  cursor: pointer;
}
.pill.claimed-btn:disabled {
  cursor: default;
}
.ticket-id {
  font-size: 10px;
  color: var(--text-secondary);
  align-self: flex-end;
  line-height: 1;
}
.answer-note {
  font-size: 12px;
  color: var(--text-secondary);
}
.answer-buttons {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.ticket-open {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.25);
}
.ticket-answered {
  background: rgba(37, 99, 235, 0.06);
  border-color: rgba(37, 99, 235, 0.25);
}
.ticket-closed {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.35);
}
.ticket-assigned-me {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.35);
}
.ticket-assigned-other {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.35);
}
.answer-box {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.answer-question {
  margin-bottom: 10px;
}
.answer-question .label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.answer-question .text {
  white-space: pre-wrap;
  color: var(--text-primary);
  font-size: 13px;
}
.answer-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
  margin-top: 10px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.modal-content {
  width: min(720px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  padding: 0;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 16px 18px;
}
</style>

