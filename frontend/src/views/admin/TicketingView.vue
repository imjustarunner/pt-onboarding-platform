<template>
  <div class="page">
    <div v-if="!ready" class="muted" style="padding: 24px;">Loading ticketing...</div>
    <div v-else>
      <div class="header" data-tour="tickets-header">
        <div>
          <h2 style="margin: 0;" data-tour="tickets-title">Ticketing</h2>
          <div class="muted">Queue (school staff requests)</div>
        </div>
        <div class="actions" data-tour="tickets-filters">
          <label class="field">
            Search (optional)
            <input v-model="searchInput" class="input" type="text" placeholder="Subject, question, or school..." />
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
              <option
                v-for="s in schoolFilterOptions"
                :key="s.school_organization_id || s.id"
                :value="String(s.school_organization_id ?? s.id)"
              >
                {{ s.school_name || s.name }}
              </option>
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
            {{ loading ? 'Loading...' : 'Refresh' }}
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
      <div v-if="loading" class="muted">Loading...</div>
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
                <span class="inline-meta">{{ t.agency_name || '-' }} / {{ t.school_name || t.school_organization_id || '-' }}</span>
                <span class="inline-sep">•</span>
                <span class="inline-meta">{{ formatDateTime(t.created_at) }}</span>
                <span v-if="t.source_channel === 'email'" class="pill status-pill">Email</span>
                <span v-if="t.escalation_reason" class="pill stale">Needs review: {{ formatEscalationReason(t.escalation_reason) }}</span>
                <span v-if="t.sent_at" class="pill status-pill">Sent</span>
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
              <div class="inline-meta question-row">Q: {{ t.question }}</div>
              <div v-if="t.answer" class="inline-meta answer-row">A: {{ t.answer }}</div>
            </div>
            <div class="right">
              <button
                v-if="t.client_id"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="openAdminClientEditor(t)"
                :disabled="adminClientLoading"
              >
                {{ adminClientLoading ? 'Loading...' : 'Edit client' }}
              </button>
              <button v-if="!t.claimed_by_user_id" class="btn btn-secondary btn-sm" type="button" @click="claimTicket(t)" :disabled="claimingId === t.id">
                {{ claimingId === t.id ? 'Assigning...' : claimLabel }}
              </button>
              <button
                v-else-if="Number(t.claimed_by_user_id) === Number(myUserId)"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="unclaimTicket(t)"
                :disabled="unclaimingId === t.id"
              >
                {{ unclaimingId === t.id ? 'Unclaiming...' : 'Unclaim' }}
              </button>
              <button
                v-else-if="Number(t.claimed_by_user_id) !== Number(myUserId) && canAssignOthers"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="assigningId === t.id"
                @click="takeOverTicket(t)"
              >
                {{ assigningId === t.id ? 'Taking over...' : 'Take over' }}
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
              >
                Join
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="confirmClose(t)">Close</button>
              <div v-if="canAssignOthers && showAssignByTicketId[t.id]" class="assign">
                <select v-model="assigneeByTicket[t.id]" class="input input-sm">
                  <option value="">Assign...</option>
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
                  {{ assigningId === t.id ? 'Assigning...' : 'Assign' }}
                </button>
              </div>
              <button
                v-if="t.answer && (String(t.status || '').toLowerCase() === 'answered' || String(t.status || '').toLowerCase() === 'closed')"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="convertToFaq(t)"
                :disabled="convertingFaqId === t.id"
              >
                {{ convertingFaqId === t.id ? 'Creating...' : 'To FAQ' }}
              </button>
            </div>
          </div>

          <div v-if="openAnswerId === t.id" class="answer-box" data-tour="tickets-answer-box">
            <div v-if="t.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)" class="error">
              This ticket is claimed by {{ formatClaimedBy(t) }}. You can still view it, but you cannot answer unless you are the claimant.
            </div>
            <div v-if="t.ai_draft_response" class="answer-question">
              <div class="label">AI draft</div>
              <div class="text">{{ t.ai_draft_response }}</div>
              <div class="answer-buttons" style="margin-top: 8px;">
                <button class="btn btn-secondary btn-sm" type="button" @click="useAiDraft(t)" :disabled="submitting">Use draft</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="copyAiDraft(t)" :disabled="submitting">Copy draft</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="markDraftReview(t, 'accepted')" :disabled="reviewingDraftId === t.id">
                  {{ reviewingDraftId === t.id ? 'Saving...' : 'Mark accepted' }}
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="markDraftReview(t, 'rejected')" :disabled="reviewingDraftId === t.id">
                  {{ reviewingDraftId === t.id ? 'Saving...' : 'Mark rejected' }}
                </button>
                <button v-if="t.source_channel === 'email' && !t.sent_at" class="btn btn-primary btn-sm" type="button" @click="markDraftSent(t)" :disabled="markingSentId === t.id">
                  {{ markingSentId === t.id ? 'Saving...' : 'Mark sent' }}
                </button>
              </div>
            </div>
            <label class="field" style="width: 100%;">
              Answer
              <textarea v-model="answerText" class="textarea" rows="4" placeholder="Type your response..." />
            </label>
            <div class="answer-actions">
              <div class="answer-note">Submit as answered, or close when read.</div>
              <div class="answer-buttons">
                <button class="btn btn-secondary" type="button" @click="generateDraftResponse(t)" :disabled="generatingResponse || submitting">
                  {{ generatingResponse ? 'Generating...' : 'Generate draft' }}
                </button>
                <button class="btn btn-primary" type="button" @click="submitAnswer(t, 'answered')" :disabled="submitting || !answerText.trim()">
                  {{ submitting ? 'Sending...' : 'Submit Answer' }}
                </button>
                <button class="btn btn-secondary" type="button" @click="submitAnswer(t, 'close_on_read')" :disabled="submitting || !answerText.trim()">
                  Submit & Close on Read
                </button>
                <button class="btn btn-secondary" type="button" @click="toggleAnswer(t.id)" :disabled="submitting">Back</button>
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
          <button class="btn-close" type="button" title="Close" @click="closeConfirm">x</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 10px;">{{ confirmMessage }}</div>
          <label class="field">
            Type <strong>{{ confirmWord }}</strong> to confirm
            <input v-model="confirmInput" class="input" type="text" />
          </label>
          <div style="display:flex; gap: 8px; margin-top: 10px;">
            <button class="btn btn-primary" type="button" :disabled="!confirmReady" @click="submitConfirm">Confirm</button>
            <button class="btn btn-secondary" type="button" @click="closeConfirm">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="threadOpen" class="modal-overlay" @click.self="closeThread">
      <div class="modal-content">
        <div class="modal-header">
          <h3 style="margin:0;">Ticket thread</h3>
          <button class="btn-close" type="button" title="Close" @click="closeThread">x</button>
        </div>
        <div class="modal-body">
          <div v-if="threadLoading" class="muted">Loading...</div>
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
            <textarea v-model="threadBody" class="textarea" rows="3" placeholder="Type a reply..." />
          </label>
          <div style="display:flex; gap: 8px;">
            <button class="btn btn-primary" type="button" :disabled="threadSending || !threadBody.trim()" @click="sendThreadMessage">
              {{ threadSending ? 'Sending...' : 'Send' }}
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
  </div>
</template>

<script setup>
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import { useTicketingQueue } from '../../composables/useTicketingQueue';

const {
  myUserId,
  canAssignOthers,
  claimLabel,
  tickets,
  loading,
  error,
  ready,
  agencyIdInput,
  schoolIdInput,
  schoolFilterOptions,
  status,
  sourceChannel,
  draftState,
  sentState,
  viewMode,
  searchInput,
  openAnswerId,
  answerText,
  submitting,
  generatingResponse,
  reviewingDraftId,
  markingSentId,
  answerError,
  claimingId,
  unclaimingId,
  convertingFaqId,
  assignees,
  assigneeByTicket,
  assigningId,
  confirmOpen,
  confirmInput,
  threadOpen,
  threadMessages,
  threadLoading,
  threadError,
  threadBody,
  threadSending,
  adminSelectedClient,
  adminClientLoading,
  clientLabelMode,
  showAssignByTicketId,
  confirmWord,
  confirmTitle,
  confirmMessage,
  confirmReady,
  agencyFilterOptions,
  formatAssignee,
  formatClaimedBy,
  formatDateTime,
  formatStatus,
  formatEscalationReason,
  formatCreatedBy,
  formatThreadAuthor,
  isStale,
  formatClientLabel,
  clientLabelTitle,
  ticketClass,
  load,
  toggleAssignPicker,
  claimTicket,
  unclaimTicket,
  takeOverTicket,
  confirmAssign,
  confirmJoin,
  confirmClose,
  closeConfirm,
  submitConfirm,
  closeThread,
  sendThreadMessage,
  toggleAnswer,
  submitAnswer,
  generateDraftResponse,
  useAiDraft,
  copyAiDraft,
  markDraftReview,
  markDraftSent,
  convertToFaq,
  toggleClientLabelMode,
  toggleViewMode,
  openAdminClientEditor,
  closeAdminClientEditor,
  handleAdminClientUpdated
} = useTicketingQueue();
</script>

<style scoped>
.page { padding: 22px; }
.header { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.muted { color: var(--text-secondary); }
.actions { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
.stale { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #b91c1c; }
.field { font-size: 12px; font-weight: 800; color: var(--text-secondary); display: block; }
.input, .textarea { width: 100%; min-width: 180px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); margin-top: 6px; }
.error { color: #b32727; margin: 10px 0; }
.list { display: flex; flex-direction: column; gap: 10px; }
.ticket { border: 1px solid var(--border); border-radius: 12px; background: white; padding: 12px; }
.ticket-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.ticket-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
.ticket-subject { white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.inline-meta { font-size: 12px; color: var(--text-secondary); }
.inline-sep { color: var(--text-secondary); font-size: 12px; }
.client-pill { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); font-size: 12px; font-weight: 800; letter-spacing: 0.04em; }
.pill { font-size: 12px; color: var(--text-secondary); }
.status-pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; background: var(--bg-alt); }
.pill.claimed { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; background: var(--bg-alt); }
.pill.claimed-btn { cursor: pointer; }
.ticket-id { font-size: 10px; color: var(--text-secondary); align-self: flex-end; line-height: 1; }
.question-row, .answer-row { margin-top: 4px; }
.answer-box { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.answer-question { margin-bottom: 10px; }
.answer-question .label { font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 4px; }
.answer-question .text { white-space: pre-wrap; color: var(--text-primary); font-size: 13px; }
.answer-actions { display: flex; justify-content: space-between; gap: 10px; align-items: end; flex-wrap: wrap; margin-top: 10px; }
.answer-note { font-size: 12px; color: var(--text-secondary); }
.answer-buttons { display: inline-flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.assign { display: inline-flex; align-items: center; gap: 6px; }
.input-sm { padding: 6px 8px; font-size: 12px; }
.ticket-open { background: rgba(16, 185, 129, 0.06); border-color: rgba(16, 185, 129, 0.25); }
.ticket-answered { background: rgba(37, 99, 235, 0.06); border-color: rgba(37, 99, 235, 0.25); }
.ticket-closed { background: rgba(148, 163, 184, 0.08); border-color: rgba(148, 163, 184, 0.35); }
.ticket-assigned-me { background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.35); }
.ticket-assigned-other { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); }
.thread-list { display: grid; gap: 10px; }
.thread-item { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; background: var(--bg-alt); }
.thread-meta { display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px; }
.thread-body { white-space: pre-wrap; }
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-content { width: min(720px, 92vw); max-height: 90vh; overflow: auto; background: white; border-radius: 14px; border: 1px solid var(--border); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2); padding: 0; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 16px 18px; }
</style>
