<template>
  <section class="cc-mode cc-automation">
    <div class="cc-mode-intro split">
      <div>
        <h2>Automation &amp; system messages</h2>
        <p>Emails and texts the app sends automatically — new hire, reminders, paperwork, and queued deliveries awaiting approval.</p>
      </div>
          <div class="cc-intro-actions">
            <button type="button" class="cc-btn outline" @click="$emit('go-home')">← Center Home</button>
            <router-link class="cc-btn outline" :to="emailSettingsTo">Email settings</router-link>
            <button type="button" class="cc-btn outline" :disabled="loading" @click="loadRows">Refresh</button>
          </div>
    </div>

    <div v-if="roiPaused" class="cc-alert warn">
      <div>
        <strong>School ROI emails paused</strong>
        <span> — release/signing emails queue for approval before they send</span>
      </div>
      <router-link class="cc-alert-btn" :to="emailSettingsTo">Email settings</router-link>
    </div>

    <div v-if="pendingCount > 0" class="cc-alert warn">
      <div>
        <strong>{{ pendingCount }} pending approval</strong>
        <span> — review and approve before they send</span>
      </div>
      <button type="button" class="cc-alert-btn" @click="setStatus('pending')">Review pending</button>
    </div>

    <div v-if="qualityIssuesCount > 0" class="cc-alert warn">
      <div>
        <strong>{{ qualityIssuesCount }} quality issue{{ qualityIssuesCount === 1 ? '' : 's' }}</strong>
        <span> — missing links, attachments, or other problems detected</span>
      </div>
      <button type="button" class="cc-alert-btn" @click="setQualityView">Review flagged</button>
    </div>

    <div class="cc-kpi-row automation-kpis">
      <button type="button" class="cc-kpi kpi-pending" :class="{ 'cc-kpi-active': status === 'pending' }" @click="setStatus('pending')">
        <span class="cc-kpi-label">Pending approval</span>
        <strong class="cc-kpi-value">{{ pendingCount }}</strong>
        <span class="cc-kpi-hint">Needs review →</span>
      </button>
      <button type="button" class="cc-kpi kpi-failed" :class="{ 'cc-kpi-active': status === 'failed' }" @click="setStatus('failed')">
        <span class="cc-kpi-label">Failed</span>
        <strong class="cc-kpi-value">{{ failedCount }}</strong>
        <span class="cc-kpi-hint">Delivery errors →</span>
      </button>
      <button
        type="button"
        class="cc-kpi kpi-quality"
        :class="{ 'cc-kpi-active': isQualityView }"
        @click="setQualityView"
      >
        <span class="cc-kpi-label">Quality issues</span>
        <strong class="cc-kpi-value">{{ qualityIssuesCount }}</strong>
        <span class="cc-kpi-hint">Flagged messages →</span>
      </button>
      <button type="button" class="cc-kpi kpi-sent accent" :class="{ 'cc-kpi-active': status === 'sent' && !isQualityView && !categoryFilter }" @click="setStatus('sent')">
        <span class="cc-kpi-label">Recently sent</span>
        <strong class="cc-kpi-value">{{ sentKpiValue }}</strong>
        <span class="cc-kpi-hint">Total sent →</span>
      </button>
      <article class="cc-kpi kpi-rate pop">
        <span class="cc-kpi-label">Delivery rate (7d)</span>
        <strong class="cc-kpi-value">{{ deliveryRate }}%</strong>
        <span class="cc-kpi-hint">Org-wide</span>
      </article>
    </div>

    <section class="cc-panel">
      <header class="cc-panel-h">
        <div>
          <h3>{{ statusTitle }}</h3>
          <p class="cc-panel-sub">
            <template v-if="totalCount > 0">
              Showing {{ listRangeStart }}–{{ listRangeEnd }} of {{ totalCount }}
              <span v-if="categoryFilter"> · filtered</span>
            </template>
            <template v-else>Click any row to view full details{{ status === 'pending' ? ' and approve or cancel' : '' }}.</template>
          </p>
        </div>
        <div class="cc-seg">
          <button type="button" :class="{ on: channel === 'email' }" @click="setChannel('email')">Email</button>
          <button type="button" :class="{ on: channel === 'sms' }" @click="setChannel('sms')">Text</button>
        </div>
      </header>

      <div class="cc-list-toolbar">
        <input
          v-model="searchQuery"
          type="search"
          class="cc-search"
          placeholder="Search subject, recipient, client…"
          @keydown.enter.prevent="loadRows"
        />
        <select v-model="categoryFilter" class="cc-sort cc-type-filter" @change="onCategoryChange">
          <option value="">All message types</option>
          <optgroup v-for="group in messageCategoryGroups" :key="group" :label="group">
            <option
              v-for="cat in categoriesForGroup(group)"
              :key="cat.key"
              :value="cat.key"
            >
              {{ categoryOptionLabel(cat) }}
            </option>
          </optgroup>
        </select>
        <select v-model="sortBy" class="cc-sort" @change="loadRows">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="subject">Subject A–Z</option>
          <option value="recipient">Recipient A–Z</option>
          <option value="template">Template type</option>
        </select>
        <button type="button" class="cc-btn outline sm" :disabled="loading" @click="loadRows">Search</button>
      </div>

      <div v-if="rows.length" class="cc-bulk-bar">
        <label class="cc-bulk-check">
          <input
            type="checkbox"
            :checked="allVisibleSelected"
            :indeterminate.prop="someVisibleSelected && !allVisibleSelected"
            @change="toggleSelectAllVisible"
          />
          <span>Select all on this page ({{ rows.length }})</span>
        </label>
        <span v-if="selectedCount" class="cc-bulk-count">{{ selectedCount }} selected</span>
        <button
          type="button"
          class="cc-btn outline sm"
          :disabled="!selectedCount"
          @click="copySelectedEmails"
        >
          {{ copyFeedback || `Copy ${selectedCount || ''} email${selectedCount === 1 ? '' : 's'}` }}
        </button>
        <button
          v-if="isQualityView && selectedCount"
          type="button"
          class="cc-btn outline sm"
          :disabled="resolveLoading"
          @click="resolveSelectedQuality"
        >
          {{ resolveLoading ? 'Working…' : 'Mark resolved' }}
        </button>
        <button v-if="selectedCount" type="button" class="cc-btn outline sm" @click="clearSelection">Clear</button>
      </div>

      <div v-if="error" class="cc-banner-err">{{ error }}</div>
      <div v-else-if="loading" class="cc-empty pad">Loading delivery queue…</div>
      <ul v-else-if="rows.length" class="cc-tickets">
        <li
          v-for="row in rows"
          :key="row.id"
          class="cc-msg-row"
          :class="{
            selected: selected?.id === row.id,
            'has-quality-issue': row.has_quality_issues,
            'quality-resolved': row.is_quality_resolved
          }"
          @click="selectRow(row)"
        >
          <label class="cc-row-check" @click.stop>
            <input
              type="checkbox"
              :checked="isRowSelected(row.id)"
              @change="toggleRowSelection(row.id)"
            />
          </label>
          <span class="cc-eng-ch">{{ String(row.channel || 'email').toUpperCase() }}</span>
          <div class="cc-eng-body">
            <strong>{{ rowTitle(row) }}</strong>
            <small>
              {{ rowRecipient(row) }} · {{ formatStatus(row.delivery_status) }} · {{ formatTime(row.generated_at || row.sent_at || row.created_at) }}
              <span v-if="row.has_quality_issues" class="cc-quality-flag"> · quality issue</span>
              <span v-else-if="row.quality_blocked_before_send" class="cc-quality-flag"> · blocked before send</span>
            </small>
            <p v-if="previewText(row)" class="cc-row-preview">{{ previewText(row) }}</p>
          </div>
          <span v-if="isPending(row)" class="prio prio-medium">pending</span>
          <span v-else-if="row.has_quality_issues" class="prio prio-high">flagged</span>
          <span v-else-if="row.quality_blocked_before_send" class="prio prio-high">blocked</span>
        </li>
      </ul>
      <div v-if="rows.length && hasMore" class="cc-list-more">
        <button type="button" class="cc-btn outline" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : `Load next ${pageSize}` }}
        </button>
        <span class="muted">{{ rows.length }} of {{ totalCount }} loaded</span>
      </div>
      <p v-else-if="!rows.length && !loading" class="cc-empty pad">
        No {{ channel }} items in <strong>{{ status }}</strong> right now.
        <template v-if="status === 'sent'"> Try switching to Pending if you expected drafts.</template>
      </p>
    </section>

  </section>

  <div v-if="selected" class="cc-detail-overlay" @click="closeDetail">
    <aside class="cc-detail-panel" @click.stop>
      <header class="cc-detail-head">
        <div>
          <span class="cc-eng-ch">{{ String(selected.channel || 'email').toUpperCase() }}</span>
          <h3>{{ rowTitle(detail || selected) }}</h3>
          <p class="cc-panel-sub">{{ formatStatus((detail || selected).delivery_status) }} · {{ formatTime((detail || selected).generated_at || (detail || selected).sent_at || (detail || selected).created_at) }}</p>
        </div>
        <button type="button" class="cc-detail-close" aria-label="Close" @click="closeDetail">×</button>
      </header>

      <div class="cc-detail-body">
        <div v-if="detailLoading" class="cc-empty pad">Loading full details…</div>
        <template v-else-if="detail || selected">
          <section v-if="activeQualityFlags.length" class="cc-detail-section quality-alert">
            <h4>{{ activeDetail.quality_blocked_before_send ? 'Blocked before send' : 'Quality issues' }}</h4>
            <p v-if="activeDetail.quality_blocked_before_send" class="hint tight">
              This message was stopped before delivery. Fix the problems below, then save and resend.
            </p>
            <ul class="context-gaps">
              <li v-for="(flag, idx) in activeQualityFlags" :key="`qf-${idx}`">{{ flag.message || flag.code }}</li>
            </ul>
          </section>

          <section v-else-if="activeDetail.is_quality_resolved && resolvedQualityFlags.length" class="cc-detail-section quality-resolved-block">
            <h4>Resolved</h4>
            <p class="hint tight">
              Marked resolved {{ formatTime(activeDetail.quality_resolved_at) }}
              <span v-if="activeDetail.quality_resolved_note"> · {{ activeDetail.quality_resolved_note }}</span>
            </p>
            <p class="context-summary">What was flagged:</p>
            <ul class="context-gaps resolved">
              <li v-for="(flag, idx) in resolvedQualityFlags" :key="`rqf-${idx}`">{{ flag.message || flag.code }}</li>
            </ul>
          </section>

          <section v-if="canEditDraft" class="cc-detail-section edit-block">
            <h4>Fix &amp; resend</h4>
            <p class="hint tight">Edit the message to resolve quality problems, then save or send.</p>
            <label class="cc-edit-field">
              <span>Subject</span>
              <input v-model="editDraft.subject" type="text" class="cc-search" />
            </label>
            <label class="cc-edit-field">
              <span>To</span>
              <input v-model="editDraft.recipient_address" type="email" class="cc-search" />
            </label>
            <label class="cc-edit-field">
              <span>Signing / intake link URL</span>
              <input v-model="editDraft.linkUrl" type="url" class="cc-search" placeholder="https://…" />
            </label>
            <label class="cc-edit-field">
              <span>Message body</span>
              <textarea v-model="editDraft.body" class="cc-edit-body" rows="10" />
            </label>
            <div v-if="draftQualityPreview.length" class="cc-draft-preview-warn">
              <strong>Still failing checks:</strong>
              <ul>
                <li v-for="(flag, idx) in draftQualityPreview" :key="`dpf-${idx}`">{{ flag.message || flag.code }}</li>
              </ul>
            </div>
          </section>

          <section v-if="sendContext" class="cc-detail-section context-block">
            <h4>Why this was sent</h4>
            <p class="context-summary">{{ sendContext.summary }}</p>
            <dl v-if="sendContext.relatedClient || sendContext.triggeredBy || sendContext.auditEvent" class="cc-detail-meta compact">
              <template v-if="sendContext.relatedClient">
                <dt>About client</dt>
                <dd>
                  {{ sendContext.relatedClient.name || `Client #${sendContext.relatedClient.id}` }}
                  <span v-if="sendContext.relatedClient.identifier" class="muted">({{ sendContext.relatedClient.identifier }})</span>
                  <span v-if="sendContext.relatedClient.inferred" class="muted"> · inferred from guardian email</span>
                  <button
                    v-if="sendContext.relatedClient.id"
                    type="button"
                    class="cc-inline-link"
                    @click="openClient(sendContext.relatedClient.id)"
                  >
                    Open client
                  </button>
                </dd>
              </template>
              <template v-if="sendContext.triggeredBy">
                <dt>Sent by</dt>
                <dd>
                  {{ sendContext.triggeredBy.name || 'Staff' }}
                  <span v-if="sendContext.triggeredBy.email" class="muted"> · {{ sendContext.triggeredBy.email }}</span>
                  <span v-if="sendContext.triggeredBy.inferred" class="muted"> · inferred from audit log</span>
                </dd>
              </template>
              <template v-if="sendContext.auditEvent">
                <dt>Audit action</dt>
                <dd>{{ formatAuditAction(sendContext.auditEvent.actionType) }}</dd>
              </template>
            </dl>
            <ul v-if="sendContext.gaps?.length" class="context-gaps">
              <li v-for="(gap, idx) in sendContext.gaps" :key="`gap-${idx}`">{{ gap }}</li>
            </ul>
          </section>

          <section v-if="relatedRecords.length" class="cc-detail-section">
            <h4>Related records</h4>
            <ul class="cc-related-list">
              <li v-for="record in relatedRecords" :key="relatedRecordKey(record)">
                <div class="cc-related-main">
                  <strong>{{ record.label }}</strong>
                  <small v-if="record.submittedAt" class="muted"> · {{ formatTime(record.submittedAt) }}</small>
                  <small v-if="record.documentCount" class="muted"> · {{ record.documentCount }} signed doc{{ record.documentCount === 1 ? '' : 's' }}</small>
                  <small v-if="record.inferred" class="muted"> · inferred</small>
                </div>
                <div class="cc-related-actions">
                  <a
                    v-if="record.pdfDownloadUrl"
                    :href="record.pdfDownloadUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="cc-btn outline sm"
                  >
                    Download application PDF
                  </a>
                  <button
                    v-if="record.type === 'hiring_applicant' && record.userId"
                    type="button"
                    class="cc-btn outline sm"
                    @click="openApplicant(record.userId)"
                  >
                    View applicant
                  </button>
                  <button
                    v-if="record.type === 'client' && record.clientId"
                    type="button"
                    class="cc-btn outline sm"
                    @click="openClient(record.clientId)"
                  >
                    Open client
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <dl class="cc-detail-meta">
            <dt>Status</dt>
            <dd><span class="prio" :class="statusClass(activeDetail.delivery_status)">{{ formatStatus(activeDetail.delivery_status) }}</span></dd>

            <dt>Subject</dt>
            <dd>{{ activeDetail.subject || '—' }}</dd>

            <dt>From</dt>
            <dd>{{ activeDetail.from_label || activeDetail.from_email || '—' }}</dd>

            <dt>To</dt>
            <dd>{{ rowRecipient(activeDetail) }}</dd>

            <dt v-if="activeDetail.reply_to">Reply-to</dt>
            <dd v-if="activeDetail.reply_to">{{ activeDetail.reply_to }}</dd>

            <dt v-if="activeDetail.template_type">Template</dt>
            <dd v-if="activeDetail.template_type">{{ formatTemplateType(activeDetail.template_type) }}</dd>

            <dt v-if="activeDetail.trigger_key">Trigger</dt>
            <dd v-if="activeDetail.trigger_key">{{ activeDetail.trigger_key }}</dd>

            <dt v-if="activeDetail.email_source">Source</dt>
            <dd v-if="activeDetail.email_source">{{ activeDetail.email_source }}</dd>

            <dt v-if="activeDetail.client_name || activeDetail.client_id">Client</dt>
            <dd v-if="activeDetail.client_name || activeDetail.client_id">
              {{ activeDetail.client_name || `Client #${activeDetail.client_id}` }}
              <span v-if="activeDetail.client_identifier" class="muted">({{ activeDetail.client_identifier }})</span>
            </dd>

            <dt v-if="activeDetail.user_first_name || activeDetail.user_last_name || activeDetail.user_email">Recipient user</dt>
            <dd v-if="activeDetail.user_first_name || activeDetail.user_last_name || activeDetail.user_email">
              {{ [activeDetail.user_first_name, activeDetail.user_last_name].filter(Boolean).join(' ') || '—' }}
              <span v-if="activeDetail.user_email" class="muted"> · {{ activeDetail.user_email }}</span>
            </dd>

            <dt v-if="activeDetail.generated_by_first_name || activeDetail.generated_by_last_name">Triggered by</dt>
            <dd v-if="activeDetail.generated_by_first_name || activeDetail.generated_by_last_name">
              {{ [activeDetail.generated_by_first_name, activeDetail.generated_by_last_name].filter(Boolean).join(' ') }}
              <span v-if="activeDetail.generated_by_email" class="muted"> · {{ activeDetail.generated_by_email }}</span>
            </dd>

            <dt v-if="activeDetail.agency_name">Agency</dt>
            <dd v-if="activeDetail.agency_name">{{ activeDetail.agency_name }}</dd>
          </dl>

          <section class="cc-detail-section">
            <h4>Links included</h4>
            <ul v-if="detailLinks.length" class="cc-link-list">
              <li v-for="(link, idx) in detailLinks" :key="`link-${idx}`">
                <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.url }}</a>
                <small v-if="link.label">{{ link.label }}</small>
                <small v-if="link.source" class="muted"> · {{ link.source }}</small>
              </li>
            </ul>
            <p v-else class="hint tight">No links were stored on this message. If the email mentioned a private link, it may not have been saved on the record.</p>
          </section>

          <section class="cc-detail-section">
            <h4>Delivery timeline</h4>
            <ul class="cc-timeline">
              <li :class="{ done: !!activeDetail.generated_at }">
                <strong>Created / queued</strong>
                <span>{{ formatTime(activeDetail.generated_at || activeDetail.created_at) }}</span>
              </li>
              <li :class="{ done: !!activeDetail.sent_at }">
                <strong>{{ sentTimelineLabel(activeDetail) }}</strong>
                <span>
                  {{ activeDetail.sent_at ? formatTime(activeDetail.sent_at) : 'Not yet sent' }}
                  <small v-if="activeDetail.sent_at && rowRecipient(activeDetail) !== '—'" class="muted">
                    · {{ rowRecipient(activeDetail) }}
                  </small>
                </span>
              </li>
              <li :class="{ done: !!activeDetail.delivered_at }">
                <strong>Delivered</strong>
                <span>{{ activeDetail.delivered_at ? formatTime(activeDetail.delivered_at) : (activeDetail.sent_at ? 'No delivery confirmation yet' : '—') }}</span>
              </li>
              <li :class="{ done: !!activeDetail.opened_at }">
                <strong>Opened</strong>
                <span>{{ activeDetail.opened_at ? formatTime(activeDetail.opened_at) : 'Not opened yet' }}</span>
              </li>
              <li v-if="activeDetail.first_clicked_at" class="done">
                <strong>Link clicked</strong>
                <span>{{ formatTime(activeDetail.first_clicked_at) }}</span>
              </li>
            </ul>
          </section>

          <section v-if="activeDetail.external_message_id || activeDetail.gmail_thread_id || activeDetail.tracking_token" class="cc-detail-section">
            <h4>Technical</h4>
            <dl class="cc-detail-meta compact">
              <dt v-if="activeDetail.external_message_id">Provider message ID</dt>
              <dd v-if="activeDetail.external_message_id" class="mono">{{ activeDetail.external_message_id }}</dd>
              <dt v-if="activeDetail.gmail_thread_id">Thread ID</dt>
              <dd v-if="activeDetail.gmail_thread_id" class="mono">{{ activeDetail.gmail_thread_id }}</dd>
              <dt v-if="activeDetail.tracking_token">Open tracking</dt>
              <dd v-if="activeDetail.tracking_token">Enabled</dd>
              <dt>Record ID</dt>
              <dd class="mono">#{{ activeDetail.id }}</dd>
            </dl>
          </section>

          <div v-if="activeDetail.body" class="cc-detail-message">
            <h4>Message</h4>
            <div v-if="looksLikeHtml(activeDetail.body)" class="cc-detail-html" v-html="activeDetail.body" />
            <pre v-else class="cc-detail-plain">{{ activeDetail.body }}</pre>
          </div>
          <p v-else class="cc-empty">No message body stored for this item.</p>

          <div v-if="activeDetail.error_message" class="cc-banner-err">{{ activeDetail.error_message }}</div>
        </template>

        <div v-if="actionError" class="cc-banner-err">{{ actionError }}</div>
        <div v-if="actionSuccess" class="cc-alert info">{{ actionSuccess }}</div>
      </div>

      <footer class="cc-detail-foot">
        <button v-if="activeDetail.client_id" type="button" class="cc-btn outline" @click="openClient(activeDetail.client_id)">
          Open client
        </button>
        <button v-else-if="activeDetail.user_id" type="button" class="cc-btn outline" @click="openUser(activeDetail.user_id)">
          Open user profile
        </button>
        <button
          v-if="canMarkResolved"
          type="button"
          class="cc-btn outline"
          :disabled="resolveLoading"
          @click="resolveCurrentQuality"
        >
          {{ resolveLoading ? 'Working…' : 'Mark resolved' }}
        </button>
        <button
          v-if="canEditDraft"
          type="button"
          class="cc-btn outline"
          :disabled="actionLoading"
          @click="saveDraft"
        >
          {{ actionLoading ? 'Saving…' : 'Save changes' }}
        </button>
        <button
          v-if="canEditDraft"
          type="button"
          class="cc-btn solid"
          :disabled="actionLoading"
          @click="retrySend"
        >
          {{ actionLoading ? 'Sending…' : 'Save & send' }}
        </button>
        <button
          v-if="canCancel(activeDetail)"
          type="button"
          class="cc-btn outline"
          :disabled="actionLoading"
          @click="cancelSelected"
        >
          {{ actionLoading ? 'Working…' : 'Cancel delivery' }}
        </button>
        <button
          v-if="canApprove(activeDetail) && !canEditDraft"
          type="button"
          class="cc-btn solid"
          :disabled="actionLoading"
          @click="approveSelected"
        >
          {{ actionLoading ? 'Sending…' : 'Approve & send now' }}
        </button>
        <button
          v-else-if="canApprove(activeDetail) && canEditDraft"
          type="button"
          class="cc-btn outline"
          :disabled="actionLoading"
          @click="approveSelected"
        >
          {{ actionLoading ? 'Sending…' : 'Approve without edits' }}
        </button>
        <button type="button" class="cc-btn outline" @click="closeDetail">Close</button>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import {
  MESSAGE_CATEGORY_GROUPS,
  categoriesForGroup as getCategoriesForGroup,
  getCategoryLabel
} from '../../constants/communicationMessageCategories.js';

const props = defineProps({
  prefix: { type: String, default: '' },
  initialChannel: { type: String, default: 'email' },
  initialStatus: { type: String, default: 'sent' },
  initialCategory: { type: String, default: '' },
  initialCommId: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  qualityIssuesCount: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  deliveryRate: { type: [Number, String], default: '—' }
});

const emit = defineEmits(['go-home', 'counts-changed']);

const router = useRouter();
const agencyStore = useAgencyStore();
const emailSettingsTo = computed(() => `${props.prefix}/admin/email-settings`);

const PAGE_SIZE = 50;

const channel = ref(props.initialChannel === 'sms' ? 'sms' : 'email');
const status = ref(['pending', 'failed', 'sent'].includes(props.initialStatus) ? props.initialStatus : 'sent');
const searchQuery = ref('');
const sortBy = ref('newest');
const categoryFilter = ref(props.initialCategory === 'quality' ? 'quality' : '');
const selectedIds = ref(new Set());
const copyFeedback = ref('');
const rows = ref([]);
const totalCount = ref(0);
const listOffset = ref(0);
const hasMore = ref(false);
const loadingMore = ref(false);
const pageSize = PAGE_SIZE;
const loading = ref(false);
const error = ref('');
const selected = ref(null);
const detail = ref(null);
const detailLoading = ref(false);
const actionLoading = ref(false);
const actionError = ref('');
const actionSuccess = ref('');
const roiPaused = ref(true);
const categoryCounts = ref({});
const resolveLoading = ref(false);
const editDraft = ref({
  subject: '',
  recipient_address: '',
  linkUrl: '',
  body: ''
});

const messageCategoryGroups = MESSAGE_CATEGORY_GROUPS;

function categoriesForGroup(group) {
  return getCategoriesForGroup(group);
}

function categoryOptionLabel(cat) {
  const count = Number(categoryCounts.value[cat.key] || 0);
  return count > 0 ? `${cat.label} (${count})` : cat.label;
}

const statusTitle = computed(() => {
  if (categoryFilter.value && categoryFilter.value !== 'quality') {
    return getCategoryLabel(categoryFilter.value);
  }
  if (isQualityView.value) return 'Quality issues';
  if (status.value === 'pending') return 'Pending approval';
  if (status.value === 'failed') return 'Failed deliveries';
  return 'Recently sent';
});

const isQualityView = computed(() => categoryFilter.value === 'quality');

const sentKpiValue = computed(() => {
  if (status.value === 'sent' && !categoryFilter.value && totalCount.value > 0) {
    return totalCount.value;
  }
  return Number(props.sentCount || 0);
});

const listRangeStart = computed(() => (rows.value.length ? 1 : 0));
const listRangeEnd = computed(() => rows.value.length);

const activeDetail = computed(() => detail.value || selected.value || {});

const sendContext = computed(() => detail.value?.send_context || null);

const activeQualityFlags = computed(() => {
  if (activeDetail.value?.is_quality_resolved) return [];
  const flags = detail.value?.active_quality_flags
    ?? detail.value?.quality_flags
    ?? selected.value?.active_quality_flags
    ?? selected.value?.quality_flags;
  return Array.isArray(flags) ? flags : [];
});

const resolvedQualityFlags = computed(() => {
  if (!activeDetail.value?.is_quality_resolved) return [];
  const flags = detail.value?.quality_flags ?? selected.value?.quality_flags;
  return Array.isArray(flags) ? flags : [];
});

const canEditDraft = computed(() => !!activeDetail.value?.can_edit_and_resend);

const canMarkResolved = computed(() => {
  return !!activeDetail.value?.has_quality_issues && !activeDetail.value?.is_quality_resolved;
});

const draftQualityPreview = computed(() => {
  if (!canEditDraft.value) return [];
  return clientSideQualityCheck(editDraft.value, activeDetail.value);
});

const selectedCount = computed(() => selectedIds.value.size);
const allVisibleSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => selectedIds.value.has(r.id)));
const someVisibleSelected = computed(() => rows.value.some((r) => selectedIds.value.has(r.id)));

const relatedRecords = computed(() => {
  const records = detail.value?.send_context?.relatedRecords;
  return Array.isArray(records) ? records : [];
});

const detailLinks = computed(() => {
  const fromApi = Array.isArray(detail.value?.links) ? detail.value.links : [];
  if (fromApi.length) return fromApi;
  return extractLinks(activeDetail.value);
});

function parseMeta(row) {
  if (!row) return {};
  if (row.meta && typeof row.meta === 'object') return row.meta;
  if (typeof row.metadata === 'object') return row.metadata || {};
  try {
    return JSON.parse(row.metadata || '{}');
  } catch {
    return {};
  }
}

function syncEditDraft(row) {
  if (!row) {
    editDraft.value = { subject: '', recipient_address: '', linkUrl: '', body: '' };
    return;
  }
  const meta = parseMeta(row);
  editDraft.value = {
    subject: row.subject || '',
    recipient_address: row.recipient_address || row.user_email || '',
    linkUrl: row.link_url || meta.linkUrl || meta.link_url || '',
    body: row.body || ''
  };
}

function clientSideQualityCheck(draft, row) {
  const flags = [];
  const combined = `${draft.subject || ''}\n${String(draft.body || '').replace(/<[^>]+>/g, ' ')}`;
  const linkUrl = String(draft.linkUrl || '').trim();
  const hasLinkInBody = /https?:\/\/[^\s<>"']+/i.test(String(draft.body || '')) || /^https?:\/\//i.test(linkUrl);

  if (/\battach(ed|ment|ments|ing)?\b|see attached/i.test(combined)) {
    flags.push({ message: 'Message says something is attached, but no attachment was included.' });
  }
  if (/private link|secure link|link below|signing link|release of information/i.test(combined) && !hasLinkInBody) {
    flags.push({ message: 'Message references a link or download, but no URL was included.' });
  }
  if (/download a copy from/i.test(combined) && !hasLinkInBody) {
    flags.push({ message: 'Message references downloading a copy, but no link or attachment was included.' });
  }
  const tpl = String(row?.template_type || '').toLowerCase();
  const isRoi = ['school_roi_signing', 'school_roi_release', 'smart_school_roi'].includes(tpl)
    || /release of information/i.test(draft.subject || '');
  if (isRoi) {
    if (!row?.client_id) flags.push({ message: 'ROI email is not linked to a client record.' });
    if (!hasLinkInBody) flags.push({ message: 'ROI email has no signing link.' });
  }
  return flags;
}

function draftPayload() {
  return {
    subject: editDraft.value.subject,
    recipient_address: editDraft.value.recipient_address,
    linkUrl: editDraft.value.linkUrl,
    body: editDraft.value.body
  };
}

function extractLinks(row) {
  if (!row) return [];
  const links = [];
  const seen = new Set();
  const add = (url, label = null) => {
    const u = String(url || '').trim();
    if (!u || !/^https?:\/\//i.test(u) || seen.has(u) || isTrackingPixelUrl(u)) return;
    seen.add(u);
    links.push({ url: u, label: label || (isSigningLinkUrl(u) ? 'Signing link' : null) });
  };

  const body = String(row.body || '');
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(body))) add(match[1]);

  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  while ((match = urlRegex.exec(body))) add(match[0]);

  const meta = parseMeta(row);
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value !== 'string') continue;
    if (/url|link|href/i.test(key) && /^https?:\/\//i.test(value)) {
      add(value, key.replace(/_/g, ' '));
    }
  }
  return links;
}

function statusClass(statusValue) {
  const s = String(statusValue || '').toLowerCase();
  if (s === 'failed' || s === 'bounced' || s === 'undelivered') return 'prio-high';
  if (s === 'pending') return 'prio-medium';
  return 'prio-low';
}

watch(
  () => [props.initialChannel, props.initialStatus, props.initialCategory, props.initialCommId],
  ([ch, st, cat]) => {
    if (ch === 'email' || ch === 'sms') channel.value = ch;
    if (['pending', 'failed', 'sent'].includes(st)) status.value = st;
    if (cat === 'quality') categoryFilter.value = 'quality';
    else if (cat === '') categoryFilter.value = '';
    maybeSelectFromQuery();
    loadRows();
  }
);

function maybeSelectFromQuery() {
  const id = String(props.initialCommId || '').trim();
  if (!id) return;
  const match = rows.value.find((r) => String(r.id) === id);
  if (match) selectRow(match);
}

function setChannel(next) {
  channel.value = next;
  loadRows();
}

function setStatus(next) {
  status.value = next;
  categoryFilter.value = '';
  loadRows();
}

function setQualityView() {
  status.value = 'sent';
  categoryFilter.value = 'quality';
  clearSelection();
  loadRows();
}

function formatTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatStatus(s) {
  return String(s || 'unknown').replace(/_/g, ' ');
}

function formatTemplateType(t) {
  return String(t || '').replace(/_/g, ' ').trim() || 'Message';
}

function rowTitle(row) {
  return row.subject || formatTemplateType(row.template_type) || 'Message';
}

function rowRecipient(row) {
  return row.recipient_address || row.user_email || '—';
}

function sentTimelineLabel(row) {
  const template = String(row?.template_type || '').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  if (
    ['school_roi_signing', 'school_roi_signer_completion', 'school_roi_release', 'smart_school_roi'].includes(template)
    || subject.includes('release of information')
  ) {
    return 'Sent to guardian / signer';
  }
  if (row?.client_id && !row?.user_id) {
    return 'Sent to recipient';
  }
  return 'Sent';
}

function formatAuditAction(actionType) {
  return String(actionType || '').replace(/_/g, ' ').trim() || '—';
}

function isTrackingPixelUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('/api/email/track-open/') || u.includes('track-open') || /\.gif(\?|$)/i.test(u);
}

function isSigningLinkUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u || isTrackingPixelUrl(u)) return false;
  return u.includes('/intake/') || u.includes('public_key=') || u.includes('/roi') || u.includes('school-roi');
}

function mentionsSigningLink(row) {
  const body = String(row?.body || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  const template = String(row?.template_type || '').toLowerCase();
  if (['school_roi_signing', 'school_roi_signer_completion', 'school_roi_release', 'smart_school_roi'].includes(template)) {
    return true;
  }
  return body.includes('release of information') || body.includes('private link') || subject.includes('release of information');
}

function looksLikeHtml(text) {
  return /<[a-z][\s\S]*>/i.test(String(text || ''));
}

function previewText(row) {
  const raw = String(row.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}

function isPending(row) {
  return String(row?.delivery_status || '').toLowerCase() === 'pending';
}

function canApprove(row) {
  return isPending(row) && String(row?.channel || 'email').toLowerCase() === 'email';
}

function canCancel(row) {
  const s = String(row?.delivery_status || '').toLowerCase();
  return s === 'pending' || s === 'failed';
}

function selectRow(row) {
  selected.value = { ...row };
  detail.value = { ...row };
  syncEditDraft(row);
  actionError.value = '';
  actionSuccess.value = '';
  loadDetail(row.id);
}

async function loadDetail(id) {
  if (!id) return;
  detailLoading.value = true;
  try {
    const resp = await api.get(`/communications/${id}/detail`, { skipGlobalLoading: true });
    detail.value = resp.data || detail.value;
    selected.value = { ...(selected.value || {}), ...(resp.data || {}) };
    syncEditDraft(detail.value);
  } catch {
    // keep list row data if detail fetch fails
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selected.value = null;
  detail.value = null;
  syncEditDraft(null);
  actionError.value = '';
  actionSuccess.value = '';
}

function onCategoryChange() {
  if (categoryFilter.value === 'quality') {
    status.value = 'sent';
  } else if (categoryFilter.value && status.value !== 'sent') {
    status.value = 'sent';
  }
  clearSelection();
  loadRows();
}

function isRowSelected(id) {
  return selectedIds.value.has(id);
}

function toggleRowSelection(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
  copyFeedback.value = '';
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    clearSelection();
    return;
  }
  selectedIds.value = new Set(rows.value.map((r) => r.id));
  copyFeedback.value = '';
}

function clearSelection() {
  selectedIds.value = new Set();
  copyFeedback.value = '';
}

async function copySelectedEmails() {
  const emails = [];
  const seen = new Set();
  for (const row of rows.value) {
    if (!selectedIds.value.has(row.id)) continue;
    const email = String(rowRecipient(row) || '').trim().toLowerCase();
    if (!email || email === '—' || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  if (!emails.length) {
    copyFeedback.value = 'No emails to copy';
    return;
  }
  const text = emails.join(', ');
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.value = `Copied ${emails.length}`;
    setTimeout(() => { copyFeedback.value = ''; }, 2500);
  } catch {
    copyFeedback.value = 'Copy failed';
  }
}

function relatedRecordKey(record) {
  return `${record?.type || 'record'}-${record?.submissionId || record?.userId || record?.clientId || record?.label || 'x'}`;
}

function openApplicant(userId) {
  router.push({
    path: `${props.prefix}/admin/hiring`,
    query: { candidateId: String(userId) }
  }).catch(() => {});
}

function openClient(clientId) {
  router.push({ path: `${props.prefix}/admin/clients/${clientId}`, query: { tab: 'communications' } }).catch(() => {});
}

function openUser(userId) {
  router.push({ path: `${props.prefix}/admin/users/${userId}`, query: { tab: 'communications' } }).catch(() => {});
}

async function loadRoiSetting() {
  const agencyId = agencyStore.currentAgency?.id;
  if (!agencyId) return;
  try {
    const resp = await api.get('/email-settings', { skipGlobalLoading: true });
    const row = (resp.data?.agencies || []).find((a) => Number(a.agencyId) === Number(agencyId));
    roiPaused.value = row ? row.schoolRoiEmailsRequireApproval !== false : true;
  } catch {
    roiPaused.value = true;
  }
}

function listQueryParams(offset = 0) {
  const agencyId = agencyStore.currentAgency?.id;
  return {
    agencyId,
    channel: channel.value,
    status: categoryFilter.value === 'quality' ? 'all' : status.value,
    limit: PAGE_SIZE,
    offset,
    q: searchQuery.value.trim() || undefined,
    sort: sortBy.value,
    category: categoryFilter.value || undefined
  };
}

function parseListResponse(data) {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, offset: 0, hasMore: false };
  }
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total || 0),
    offset: Number(data?.offset || 0),
    hasMore: !!data?.hasMore
  };
}

async function loadCategoryCounts() {
  const agencyId = agencyStore.currentAgency?.id;
  if (!agencyId) {
    categoryCounts.value = {};
    return;
  }
  try {
    const resp = await api.get('/communications/categories', {
      params: {
        agencyId,
        channel: channel.value,
        status: status.value === 'pending' || status.value === 'failed' ? status.value : 'sent'
      },
      skipGlobalLoading: true
    });
    const map = {};
    for (const row of Array.isArray(resp.data) ? resp.data : []) {
      if (row?.key) map[row.key] = Number(row.count || 0);
    }
    categoryCounts.value = map;
  } catch {
    categoryCounts.value = {};
  }
}

async function loadRows() {
  const agencyId = agencyStore.currentAgency?.id;
  if (!agencyId) {
    rows.value = [];
    totalCount.value = 0;
    hasMore.value = false;
    listOffset.value = 0;
    error.value = 'Select an agency to view automation messages.';
    return;
  }
  loading.value = true;
  loadingMore.value = false;
  error.value = '';
  listOffset.value = 0;
  try {
    const resp = await api.get('/communications/pending', {
      params: listQueryParams(0),
      skipGlobalLoading: true
    });
    const parsed = parseListResponse(resp.data);
    rows.value = parsed.items;
    totalCount.value = parsed.total;
    hasMore.value = parsed.hasMore;
    clearSelection();
    maybeSelectFromQuery();
    loadCategoryCounts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load automation messages';
    rows.value = [];
    totalCount.value = 0;
    hasMore.value = false;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  const agencyId = agencyStore.currentAgency?.id;
  if (!agencyId) return;
  loadingMore.value = true;
  const nextOffset = rows.value.length;
  try {
    const resp = await api.get('/communications/pending', {
      params: listQueryParams(nextOffset),
      skipGlobalLoading: true
    });
    const parsed = parseListResponse(resp.data);
    rows.value = [...rows.value, ...parsed.items];
    totalCount.value = parsed.total;
    hasMore.value = parsed.hasMore;
    listOffset.value = 0;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load more messages';
  } finally {
    loadingMore.value = false;
  }
}

async function saveDraft() {
  if (!detail.value?.id) return;
  actionLoading.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    const resp = await api.patch(`/communications/${detail.value.id}`, draftPayload(), { skipGlobalLoading: true });
    detail.value = resp.data;
    selected.value = { ...(selected.value || {}), ...(resp.data || {}) };
    syncEditDraft(detail.value);
    actionSuccess.value = resp.data?.has_quality_issues
      ? 'Saved — quality checks still failing. Fix remaining issues before sending.'
      : 'Changes saved. Quality checks pass — you can send now.';
    emit('counts-changed');
    await loadRows();
  } catch (e) {
    const err = e?.response?.data?.error;
    actionError.value = err?.message || 'Failed to save changes';
    if (Array.isArray(err?.qualityFlags)) {
      actionError.value = err.qualityFlags.map((f) => f.message || f.code).filter(Boolean).join(' ') || actionError.value;
    }
  } finally {
    actionLoading.value = false;
  }
}

async function retrySend() {
  if (!detail.value?.id) return;
  actionLoading.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    const resp = await api.post(`/communications/${detail.value.id}/retry-send`, draftPayload(), { skipGlobalLoading: true });
    detail.value = resp.data;
    actionSuccess.value = 'Sent successfully.';
    emit('counts-changed');
    await loadRows();
    closeDetail();
  } catch (e) {
    const err = e?.response?.data?.error;
    actionError.value = err?.message || 'Failed to send message';
    if (Array.isArray(err?.qualityFlags)) {
      actionError.value = err.qualityFlags.map((f) => f.message || f.code).filter(Boolean).join(' ') || actionError.value;
    }
    if (detail.value?.id) await loadDetail(detail.value.id);
  } finally {
    actionLoading.value = false;
  }
}

async function resolveCurrentQuality() {
  if (!detail.value?.id) return;
  const note = window.prompt('Optional note — what did you do about this? (e.g. resent manually, false positive)') || '';
  resolveLoading.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    const resp = await api.post(
      `/communications/${detail.value.id}/resolve-quality`,
      note.trim() ? { note: note.trim() } : {},
      { skipGlobalLoading: true }
    );
    detail.value = resp.data;
    selected.value = { ...(selected.value || {}), ...(resp.data || {}) };
    actionSuccess.value = 'Marked resolved.';
    emit('counts-changed');
    await loadRows();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to mark resolved';
  } finally {
    resolveLoading.value = false;
  }
}

async function resolveSelectedQuality() {
  const ids = rows.value
    .filter((r) => selectedIds.value.has(r.id) && r.has_quality_issues && !r.is_quality_resolved)
    .map((r) => r.id);
  if (!ids.length) {
    copyFeedback.value = 'No flagged items selected';
    setTimeout(() => { copyFeedback.value = ''; }, 2000);
    return;
  }
  const note = window.prompt(`Mark ${ids.length} item(s) resolved? Optional note:`) ?? null;
  if (note === null) return;
  resolveLoading.value = true;
  error.value = '';
  try {
    const resp = await api.post(
      '/communications/resolve-quality-bulk',
      { ids, note: note.trim() || undefined },
      { skipGlobalLoading: true }
    );
    emit('counts-changed');
    await loadRows();
    copyFeedback.value = `Resolved ${resp.data?.resolved || 0}`;
    setTimeout(() => { copyFeedback.value = ''; }, 2500);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Bulk resolve failed';
  } finally {
    resolveLoading.value = false;
  }
}

async function approveSelected() {
  if (!detail.value?.id) return;
  actionLoading.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    await api.post(`/communications/${detail.value.id}/approve`, {}, { skipGlobalLoading: true });
    actionSuccess.value = 'Approved and sent.';
    emit('counts-changed');
    await loadRows();
    closeDetail();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to approve message';
  } finally {
    actionLoading.value = false;
  }
}

async function cancelSelected() {
  if (!detail.value?.id) return;
  if (!window.confirm('Cancel this delivery? It will not be sent.')) return;
  actionLoading.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    await api.post(`/communications/${detail.value.id}/cancel`, {}, { skipGlobalLoading: true });
    actionSuccess.value = 'Delivery cancelled.';
    emit('counts-changed');
    await loadRows();
    closeDetail();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to cancel delivery';
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  loadRows();
  loadRoiSetting();
});
watch(() => agencyStore.currentAgency?.id, () => {
  loadRows();
  loadRoiSetting();
});
</script>

<style scoped>
.cc-kpi-active {
  outline: 2px solid color-mix(in srgb, var(--cc-primary, #1f6b4a) 55%, #fff);
  outline-offset: 1px;
}
.cc-row-preview {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--cc-muted, #64748b);
  line-height: 1.35;
}
.cc-tickets li.selected {
  background: color-mix(in srgb, var(--cc-primary, #1f6b4a) 8%, #f8fafc);
}
.cc-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
}
.cc-detail-panel {
  width: min(640px, 100%);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 40px rgba(15, 23, 42, 0.18);
}
.cc-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.cc-detail-head h3 {
  margin: 8px 0 0;
  font-size: 1.1rem;
}
.cc-detail-close {
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.cc-detail-body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px 24px;
}
.cc-detail-meta {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px 12px;
  margin: 0 0 16px;
  font-size: 13px;
}
.cc-detail-meta dt {
  margin: 0;
  color: #64748b;
  font-weight: 700;
}
.cc-detail-meta dd {
  margin: 0;
}
.cc-detail-message h4 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.cc-detail-html {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #f8fafc;
  font-size: 14px;
  line-height: 1.5;
  overflow: auto;
}
.cc-detail-plain {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #f8fafc;
  font-size: 13px;
  font-family: inherit;
}
.cc-detail-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.cc-detail-meta.compact {
  margin-bottom: 0;
}
.cc-detail-section {
  margin-bottom: 18px;
}
.cc-detail-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.context-block {
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #f8fbff;
}
.context-summary {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.45;
}
.context-gaps {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #92400e;
}
.context-gaps li {
  margin: 4px 0;
}
.cc-inline-link {
  margin-left: 8px;
  padding: 0;
  border: none;
  background: none;
  color: #1f6b4a;
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.hint.tight {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.cc-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 20px 12px;
  align-items: center;
}
.cc-bulk-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 0 20px 12px;
  font-size: 13px;
}
.cc-bulk-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.cc-bulk-count {
  color: #64748b;
}
.cc-row-check {
  display: flex;
  align-items: center;
  padding: 0 4px 0 0;
}
.cc-msg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.cc-quality-flag {
  color: #b45309;
}
.cc-msg-row.has-quality-issue {
  border-left: 3px solid #f59e0b;
}
.quality-alert {
  padding: 12px 14px;
  border: 1px solid #fde68a;
  border-radius: 12px;
  background: #fffbeb;
}
.quality-resolved-block {
  padding: 12px 14px;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  background: #f0fdf4;
}
.context-gaps.resolved {
  color: #166534;
}
.edit-block {
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #f8fbff;
}
.cc-edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 13px;
}
.cc-edit-field span {
  font-weight: 700;
  color: #64748b;
}
.cc-edit-body {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.45;
  resize: vertical;
}
.cc-draft-preview-warn {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  font-size: 12px;
  color: #9a3412;
}
.cc-draft-preview-warn ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.cc-search {
  flex: 1 1 220px;
  min-width: 180px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
}
.cc-sort {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  background: #fff;
}
.cc-btn.sm {
  padding: 6px 10px;
  font-size: 12px;
}
.cc-related-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-related-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
.cc-related-main strong {
  display: block;
}
.cc-related-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.cc-list-more {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 16px 20px 20px;
  border-top: 1px solid #e2e8f0;
}
.cc-link-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-link-list li {
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
.cc-link-list a {
  color: #1f6b4a;
  word-break: break-all;
}
.cc-link-list small {
  display: block;
  color: #64748b;
  margin-top: 2px;
}
.cc-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-timeline li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
  color: #94a3b8;
}
.cc-timeline li.done {
  color: #0f172a;
}
.cc-timeline strong {
  font-weight: 700;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.muted { color: #64748b; }
.hot { color: #dc2626; }
</style>
