<template>
  <main class="review-page" :aria-busy="loading">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Support email · supervised pilot</p>
        <h1>Daily reply review</h1>
        <p class="intro">See what arrived, the original draft, and the reply that was actually sent.</p>
      </div>
      <div class="day-controls">
        <label for="review-date">Review date</label>
        <div class="day-inputs">
          <input id="review-date" v-model="selectedDate" type="date" @change="syncDateToRoute" />
          <button class="btn btn-secondary" type="button" :disabled="loading || !agencyId" @click="loadReview">
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <div v-else-if="loading" class="loading" role="status">Loading the day’s email conversations…</div>
    <template v-else-if="report">
      <section class="review-window" aria-label="Review period">
        <div>
          <strong>{{ report.coverage?.inProgress ? 'Today’s review is still in progress' : 'Review period' }}</strong>
          <p>{{ formatTime(report.window?.start) }} – {{ formatTime(report.window?.end) }} · {{ timeZone }}</p>
        </div>
        <span class="schedule-label">{{ scheduleLabel }}</span>
      </section>

      <dl class="totals" aria-label="Daily totals">
        <div><dt>Conversations</dt><dd>{{ total('tickets') }}</dd></div>
        <div><dt>Drafts captured</dt><dd>{{ total('drafts') }}</dd></div>
        <div><dt>Sent replies</dt><dd>{{ total('sent') }}</dd></div>
        <div><dt>Unsent drafts</dt><dd>{{ total('unsentDrafts') }}</dd></div>
        <div :class="{ attention: Number(report.totals?.failed) > 0 }"><dt>Failed sends</dt><dd>{{ total('failed') }}</dd></div>
      </dl>

      <div v-if="report.coverage?.truncated" class="notice warning" role="status">This review reached its display limit. The counts and conversations shown are incomplete.</div>
      <details class="coverage-note">
        <summary>What this review includes</summary>
        <p>Received emails and replies recorded in the app, with each saved draft kept separately from the sent message.</p>
        <p v-if="report.coverage?.personalMailboxReplies">{{ report.coverage.personalMailboxReplies }}</p>
        <p v-if="report.coverage?.historicalDrafts">{{ report.coverage.historicalDrafts }}</p>
        <p v-if="report.coverage?.completeMailboxCoverage === false">Replies outside the shared mailbox may be missing. A closed ticket is not proof that an email was sent.</p>
      </details>

      <section v-if="!rows.length" class="empty-state">
        <h2>No conversations to review in this period</h2>
        <p>Choose another date, or return after the team has replied.</p>
      </section>
      <div v-else class="conversation-list">
        <article v-for="row in rows" :key="row.ticketId" class="conversation" :aria-labelledby="`subject-${row.ticketId}`">
          <header class="conversation-heading">
            <div>
              <h2 :id="`subject-${row.ticketId}`">{{ row.subject || 'Email conversation' }}</h2>
              <p>{{ row.owner?.name || 'Unclaimed conversation' }} <span class="separator">·</span> Ticket #{{ row.ticketId }}</p>
            </div>
            <span v-if="comparisonFor(row)?.draftUnavailable" class="badge warning">Saved draft unavailable</span>
            <span v-else-if="comparisonFor(row)?.edited === true" class="badge edited">Draft edited before sending</span>
            <span v-else-if="comparisonFor(row)?.edited === false" class="badge">Draft used unchanged</span>
            <span v-else-if="comparisonFor(row)?.missingDraft" class="badge warning">No captured draft to compare</span>
            <span v-else class="badge neutral">No confirmed sent reply</span>
          </header>

          <div v-if="row.coverageFlags?.length" class="row-notices">
            <span v-for="flag in row.coverageFlags" :key="flag">{{ flagLabel(flag) }}</span>
          </div>

          <div v-if="confirmedSent(row).length > 1" class="reply-picker">
            <label :for="`reply-${row.ticketId}`">Reply to review</label>
            <select :id="`reply-${row.ticketId}`" v-model="selectedReplies[row.ticketId]">
              <option v-for="(delivery, index) in confirmedSent(row)" :key="delivery.id" :value="delivery.id">
                {{ index + 1 }} of {{ confirmedSent(row).length }} · {{ formatTime(delivery.occurredAt) }}{{ delivery.external ? ' · Sent outside the app' : '' }}
              </option>
            </select>
          </div>

          <div class="comparison-grid">
            <section class="comparison-column received">
              <h3><span class="step-number">1</span> Email received</h3>
              <p class="message-meta">{{ formatTime(receivedFor(row)?.receivedAt) }}</p>
              <pre v-if="receivedFor(row)?.body" class="email-body">{{ receivedFor(row).body }}</pre>
              <p v-else class="unavailable">The original received email was not captured in this snapshot.</p>
            </section>
            <section class="comparison-column drafted">
              <h3><span class="step-number">2</span> Generated draft</h3>
              <p class="message-meta">Saved before staff edits · not an email send</p>
              <pre v-if="comparisonFor(row)?.generatedDraft" class="email-body">{{ comparisonFor(row).generatedDraft }}</pre>
              <p v-else-if="comparisonFor(row)?.draftUnavailable" class="unavailable">The saved draft could not be read.</p>
              <p v-else class="unavailable">No original draft was captured for this message.</p>
            </section>
            <section class="comparison-column actual">
              <h3><span class="step-number">3</span> Actually sent</h3>
              <p class="message-meta">{{ confirmedSent(row).length ? `${confirmedSent(row).length} confirmed sent ${confirmedSent(row).length === 1 ? 'reply' : 'replies'}` : 'No confirmed email delivery' }}</p>
              <template v-if="confirmedSent(row).length">
                <div v-for="delivery in [selectedSent(row)]" :key="delivery.id" class="sent-message">
                  <div class="delivery-heading"><span class="badge sent">Sent{{ delivery.external ? ' outside the app' : '' }}</span><time>{{ formatTime(delivery.occurredAt) }}</time></div>
                  <pre class="email-body">{{ delivery.body || 'The sent message body is unavailable.' }}</pre>
                </div>
              </template>
              <p v-else class="unavailable">A saved draft, queued email, or closed ticket does not appear as a sent reply.</p>
            </section>
          </div>

          <details v-if="row.draftSnapshots?.length || row.deliveries?.length" class="history">
            <summary>All saved drafts and delivery attempts <span>{{ row.draftSnapshots?.length || 0 }} drafts · {{ row.deliveries?.length || 0 }} attempts</span></summary>
            <div class="history-grid">
              <section>
                <h3>Original draft versions</h3>
                <div v-for="draft in row.draftSnapshots || []" :key="draft.id" class="history-item">
                  <div class="delivery-heading"><strong>Draft #{{ draft.id }}</strong><time>{{ formatTime(draft.createdAt) }}</time></div>
                  <p v-if="draft.readable === false" class="notice warning">This saved draft could not be read.</p>
                  <template v-else>
                    <pre v-if="draft.body" class="email-body">{{ draft.body }}</pre>
                    <p v-else class="unavailable">No reply generated{{ draft.sourceEvidence?.suppressionReason ? `: ${flagLabel(draft.sourceEvidence.suppressionReason)}` : '' }}.</p>
                    <details v-if="draft.originalReceived?.body" class="source-message"><summary>Email used for this draft</summary><pre class="email-body">{{ draft.originalReceived.body }}</pre></details>
                    <ul v-if="draft.sourceEvidence?.unresolvedFacts?.length" class="review-notes">
                      <li v-for="(fact, index) in draft.sourceEvidence.unresolvedFacts" :key="index">{{ flagLabel(fact) }}</li>
                    </ul>
                  </template>
                </div>
              </section>
              <section>
                <h3>Delivery attempts</h3>
                <div v-for="delivery in row.deliveries || []" :key="delivery.id" class="history-item">
                  <div class="delivery-heading"><span class="badge" :class="statusClass(delivery.status)">{{ statusLabel(delivery.status) }}</span><time>{{ formatTime(delivery.occurredAt) }}</time></div>
                  <p class="message-meta">{{ delivery.draftSnapshotId ? `Compared with draft #${delivery.draftSnapshotId}` : 'No draft linked to this reply' }}{{ delivery.external ? ' · Sent outside the app' : '' }}</p>
                  <p v-if="delivery.errorCode" class="notice warning">{{ flagLabel(delivery.errorCode) }}</p>
                  <pre v-if="delivery.body" class="email-body">{{ delivery.body }}</pre>
                </div>
              </section>
            </div>
          </details>
        </article>
      </div>
    </template>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
function mountainToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const selectedDate = ref(validDate(route.query.date) ? String(route.query.date) : mountainToday());
const agencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id || 0));
const report = ref(null);
const selectedReplies = ref({});
const loading = ref(false);
const error = ref('');
let requestVersion = 0;
const rows = computed(() => Array.isArray(report.value?.rows) ? report.value.rows : []);
const timeZone = computed(() => report.value?.window?.timeZone || report.value?.config?.timeZone || 'America/Denver');
const scheduleLabel = computed(() => {
  const config = report.value?.config;
  if (!config?.enabled) return 'Daily email summary is paused';
  return `${config.weekdaysOnly ? 'Weekdays' : 'Daily'} at ${config.sendTime || '18:00'} · ${config.timeZone || 'America/Denver'}`;
});
const total = (key) => report.value?.totals?.[key] ?? '—';
const confirmedSent = (row) => (row.deliveries || []).filter((delivery) => delivery.status === 'sent');
const selectedSent = (row) => confirmedSent(row).find((delivery) => delivery.id === selectedReplies.value[row.ticketId]) || confirmedSent(row).at(-1);
const draftFor = (row, delivery) => row.draftSnapshots?.find((draft) => draft.id === delivery?.draftSnapshotId);
function comparisonFor(row) {
  const delivery = selectedSent(row);
  if (!delivery || delivery === confirmedSent(row).at(-1)) return row.comparison;
  const draft = draftFor(row, delivery);
  const usable = draft?.readable !== false && !!String(draft?.body || '').trim();
  return { draftId: draft?.id, generatedDraft: usable ? draft.body : null, missingDraft: !draft,
    draftUnavailable: !!draft && !usable, edited: !usable ? null
    : delivery.composedBody != null ? String(delivery.composedBody).trim() !== String(draft.body).trim()
    : String(delivery.body).trim() === String(draft.body).trim() ? false : null };
}
function receivedFor(row) {
  const delivery = selectedSent(row);
  if (delivery && delivery !== confirmedSent(row).at(-1)) return draftFor(row, delivery)?.originalReceived || delivery.originalReceived;
  return row.draftSnapshots?.find((draft) => draft.id === row.comparison?.draftId)?.originalReceived || delivery?.originalReceived || row.originalReceived;
}
const statusLabel = (status) => ({ sent: 'Sent', failed: 'Failed — not confirmed sent', queued: 'Queued — not yet sent', sending: 'Sending — awaiting confirmation', skipped: 'Not sent', unknown: 'Delivery unconfirmed', held: 'Held for review', pending: 'Pending — not yet sent' }[status] || 'Delivery unconfirmed');
const statusClass = (status) => status === 'sent' ? 'sent' : status === 'failed' ? 'failed' : 'neutral';
function flagLabel(value) {
  const known = { missing_draft: 'No captured original draft', external_reply: 'Reply recorded outside the app', claimant_identity_unconfirmed: 'Claimant identity needs confirmation', client_identity_ambiguous: 'Client identity needs review', attachment_ingestion_incomplete: 'Attachment receipt is still being checked', conversation_unavailable: 'Conversation could not be read', automated_notification: 'Automated notification; no reply drafted', voicemail_requires_callback_review: 'Voicemail needs a callback review', marketing_or_newsletter: 'Newsletter or marketing email; no reply drafted' };
  return known[value] || String(value || '').replace(/_/g, ' ');
}
function formatTime(value) {
  if (!value) return 'Time unavailable';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', { timeZone: timeZone.value, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed);
}
async function loadReview() {
  const version = ++requestVersion;
  report.value = null;
  error.value = '';
  if (!agencyId.value) { error.value = 'Choose an agency to review its email conversations.'; loading.value = false; return; }
  if (!validDate(selectedDate.value)) { error.value = 'Choose a valid review date.'; loading.value = false; return; }
  loading.value = true;
  try {
    const response = await api.get('/support-email-review', { params: { agencyId: agencyId.value, date: selectedDate.value }, skipGlobalLoading: true });
    if (version !== requestVersion) return;
    report.value = response.data;
    selectedReplies.value = Object.fromEntries((response.data?.rows || []).map((row) => [row.ticketId, confirmedSent(row).at(-1)?.id]));
  } catch (err) {
    if (version !== requestVersion) return;
    error.value = err?.response?.data?.error?.message || 'The email review could not be loaded. Please try again.';
  } finally { if (version === requestVersion) loading.value = false; }
}
function syncDateToRoute() {
  if (validDate(selectedDate.value)) router.replace({ query: { ...route.query, date: selectedDate.value } });
}
watch(() => route.query.date, (date) => { if (validDate(date)) selectedDate.value = String(date); });
watch([agencyId, selectedDate], loadReview, { immediate: true });
onBeforeUnmount(() => { requestVersion += 1; });
</script>

<style scoped>
.review-page { max-width: 1560px; margin: 0 auto; padding: 32px 28px 64px; color: var(--text-primary, #243044); }
.page-heading, .conversation-heading, .review-window { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.eyebrow { color: var(--primary, #375d63); font-size: 12px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; margin: 0 0 8px; }
h1 { margin: 0; font-size: 30px; font-weight: 650; letter-spacing: -.025em; }
.intro { margin: 9px 0 0; color: var(--text-secondary, #647084); line-height: 1.5; }
.day-controls label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 7px; }
.day-inputs { display: flex; gap: 8px; }
input[type=date] { border: 1px solid var(--border-color, #d8dfe6); border-radius: 8px; padding: 10px 12px; color: inherit; background: var(--bg-primary, #fff); font: inherit; }
.btn { white-space: nowrap; }
.review-window { margin: 28px 0 18px; background: var(--bg-secondary, #f3f6f8); border: 1px solid var(--border-color, #e0e6ea); border-radius: 12px; padding: 16px 20px; }
.review-window p { margin: 5px 0 0; font-size: 13px; color: var(--text-secondary, #647084); }
.schedule-label { font-size: 12px; color: var(--text-secondary, #647084); text-align: right; }
.totals { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 0 0 18px; }
.totals > div { padding: 16px 20px; border: 1px solid var(--border-color, #e0e6ea); border-radius: 10px; background: var(--bg-primary, #fff); }
.totals dt { font-size: 12px; color: var(--text-secondary, #647084); }
.totals dd { margin: 6px 0 0; font-size: 27px; font-weight: 650; }
.totals .attention { border-color: #dba69d; }
.coverage-note { font-size: 13px; color: var(--text-secondary, #647084); margin-bottom: 24px; line-height: 1.55; }
summary { cursor: pointer; font-weight: 600; }
.coverage-note p { margin: 8px 0; }
.conversation-list { display: grid; gap: 24px; }
.conversation { background: var(--bg-primary, #fff); border: 1px solid var(--border-color, #dce3e8); border-radius: 14px; overflow: hidden; box-shadow: 0 3px 12px #152a3b04; }
.conversation-heading { padding: 20px 22px; }
.conversation-heading h2 { margin: 0; font-size: 17px; line-height: 1.4; overflow-wrap: anywhere; }
.conversation-heading p { margin: 7px 0 0; font-size: 12px; color: var(--text-secondary, #647084); }
.separator { padding: 0 6px; }
.badge { display: inline-block; font-size: 11px; font-weight: 600; border-radius: 5px; background: #edf2f8; color: #465b77; padding: 5px 8px; white-space: normal; }
.badge.edited { background: #eaf0fc; color: #3c5a91; }
.badge.sent { background: #e7f3ee; color: #286b50; }
.badge.failed { background: #fbecea; color: #9a4035; }
.badge.neutral { background: #f1f2f4; color: #66717f; }
.badge.warning { background: #fff3dc; color: #805f25; }
.row-notices { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 22px 14px; color: #805f25; font-size: 12px; }
.reply-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 0 22px 18px; font-size: 12px; }
.reply-picker label { font-weight: 600; }
.reply-picker select { max-width: 100%; min-width: 0; padding: 8px; border: 1px solid var(--border-color, #d8dfe6); border-radius: 6px; font: inherit; color: inherit; background: var(--bg-primary, #fff); }
.comparison-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--border-color, #e0e6ea); }
.comparison-column { padding: 20px 22px 24px; min-width: 0; }
.comparison-column + .comparison-column { border-left: 1px solid var(--border-color, #e0e6ea); }
.drafted { background: #f8fafc; }
h3 { font-size: 13px; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
.step-number { background: #edf1f5; color: #687990; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
.message-meta, .delivery-heading time { font-size: 11px; color: var(--text-secondary, #6f7b8d); line-height: 1.5; }
.message-meta { margin: 0 0 14px; }
.email-body { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; font-family: inherit; font-size: 13px; line-height: 1.7; margin: 0; color: inherit; }
.unavailable { font-size: 13px; line-height: 1.6; color: var(--text-secondary, #758195); margin: 0; }
.sent-message + .sent-message { border-top: 1px solid var(--border-color, #e0e6ea); margin-top: 20px; padding-top: 16px; }
.delivery-heading { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 12px; }
.history { border-top: 1px solid var(--border-color, #e0e6ea); padding: 16px 22px; }
.history > summary { font-size: 12px; }
.history > summary span { margin-left: 12px; color: var(--text-secondary, #758195); font-weight: 400; }
.history-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; padding-top: 22px; }
.history-item { border-top: 1px solid var(--border-color, #e0e6ea); padding: 16px 0; }
.source-message { margin-top: 14px; font-size: 12px; }
.source-message .email-body { margin-top: 10px; }
.review-notes { margin: 14px 0 0; padding-left: 18px; font-size: 12px; color: #805f25; }
.notice { padding: 12px 16px; border-radius: 8px; font-size: 13px; line-height: 1.5; margin: 16px 0; }
.notice.error { background: #fff0ee; color: #9a4035; }
.notice.warning { background: #fff7e8; color: #805f25; }
.loading, .empty-state { text-align: center; padding: 70px 20px; color: var(--text-secondary, #647084); }
.empty-state h2 { font-size: 18px; color: var(--text-primary, #243044); }
@media (max-width: 1000px) { .comparison-grid { grid-template-columns: 1fr; } .comparison-column + .comparison-column { border-left: 0; border-top: 1px solid var(--border-color, #e0e6ea); } .totals { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px) { .review-page { padding: 22px 14px 40px; } .page-heading, .review-window, .conversation-heading { flex-direction: column; align-items: flex-start; gap: 15px; } h1 { font-size: 26px; } .schedule-label { text-align: left; } .totals { grid-template-columns: repeat(2, 1fr); } .history-grid { grid-template-columns: 1fr; } .history > summary span { display: block; margin: 7px 0 0; } }
</style>
