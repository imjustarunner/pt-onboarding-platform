<template>
  <div class="client-communications-tab">
    <div class="tab-header">
      <div>
        <h3 style="margin: 0;">Communications</h3>
        <p class="muted" style="margin: 6px 0 0 0;">
          Every email and text we've sent on this client's behalf — including messages addressed to a linked guardian.
          <span v-if="counts.opened > 0" style="color: #166534; font-weight: 700;">
            {{ counts.opened }} opened
          </span>
        </p>
      </div>
      <div class="filter-controls" v-if="!loading && items.length">
        <select v-model="channelFilter" class="form-select">
          <option value="">All channels ({{ counts.total }})</option>
          <option value="email">Email ({{ counts.email }})</option>
          <option value="sms">Text/SMS ({{ counts.sms }})</option>
        </select>
        <select v-model="statusFilter" class="form-select">
          <option value="">All statuses</option>
          <option value="opened">Opened (email)</option>
          <option value="delivered">Delivered (no open yet)</option>
          <option value="sent">Sent (no delivery confirmation)</option>
          <option value="pending">Pending (not yet sent)</option>
          <option value="failed">Failed / Bounced</option>
        </select>
      </div>
    </div>

    <div v-if="guardians.length" class="guardian-summary">
      <span class="muted" style="font-weight: 700;">On this client's account:</span>
      <span
        v-for="g in guardians"
        :key="`g-${g.id}`"
        class="guardian-chip"
        :title="g.email || ''"
      >
        {{ g.relationshipTitle || 'Guardian' }}: {{ g.name || g.email || `User #${g.id}` }}
      </span>
    </div>

    <div v-if="loading" class="loading">Loading communications…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!filteredItems.length" class="empty-state">
      <p v-if="!items.length">No emails or texts have been sent to this client (or their guardians) yet.</p>
      <p v-else>No communications match the current filters.</p>
    </div>

    <div v-else class="communications-list">
      <div v-for="item in filteredItems" :key="item.id" class="communication-card">
        <div class="communication-header">
          <div class="communication-info" style="min-width: 0;">
            <div class="communication-title-row">
              <span class="channel-chip" :class="`chip-${item.channel}`">
                {{ item.channel === 'sms' ? 'TEXT' : 'EMAIL' }}
              </span>
              <span
                v-if="item.direction === 'inbound'"
                class="dir-chip dir-in"
                title="Received from this client / guardian"
              >Inbound</span>
              <span
                class="status-pill"
                :class="`status-${statusInfo(item).key}`"
                :title="statusInfo(item).tooltip"
              >{{ statusInfo(item).label }}</span>
              <h4 :title="item.subject || item.body || ''">
                {{ titleFor(item) }}
              </h4>
            </div>
            <div class="communication-meta">
              <span class="meta-item">
                <strong>To:</strong>
                <template v-if="item.recipientIsGuardian">
                  <span class="meta-strong-label">Guardian {{ item.recipientUserName || '' }}</span>
                  <span v-if="item.guardianRelationship && item.guardianRelationship !== 'Guardian'" class="muted">
                    ({{ item.guardianRelationship }})
                  </span>
                </template>
                <template v-else-if="item.recipientUserName">{{ item.recipientUserName }}</template>
                <template v-else-if="item.toNumber">{{ formatPhone(item.toNumber) }}</template>
                <template v-else-if="item.recipientAddress">{{ item.recipientAddress }}</template>
                <template v-else>—</template>
              </span>
              <span v-if="item.recipientAddress && item.channel === 'email'" class="meta-item muted small">
                {{ item.recipientAddress }}
              </span>
              <span v-if="item.toNumber && item.channel === 'sms' && item.recipientUserName" class="meta-item muted small">
                {{ formatPhone(item.toNumber) }}
              </span>
              <span v-if="item.sentAt" class="meta-item">
                <strong>{{ item.direction === 'inbound' ? 'Received:' : 'Sent:' }}</strong>
                {{ formatDate(item.sentAt) }}
              </span>
              <span v-if="item.deliveredAt" class="meta-item delivered-chip" title="Provider confirmed delivery to recipient mailbox">
                Delivered {{ formatRelative(item.deliveredAt) }}
              </span>
              <span v-if="item.openedAt" class="meta-item open-chip" title="Tracking pixel detected an open">
                Opened {{ formatRelative(item.openedAt) }}
              </span>
              <span v-if="item.firstClickedAt" class="meta-item clicked-chip" title="Recipient clicked a tracked link">
                Clicked {{ formatRelative(item.firstClickedAt) }}
              </span>
              <span
                v-if="item.channel === 'email' && !item.openedAt && !isFailureStatus(item.deliveryStatus) && (item.deliveryStatus === 'sent' || item.deliveryStatus === 'delivered')"
                class="meta-item muted small"
                title="No open detected yet — recipient may have images blocked, may not have opened it, or the email may have been sent without an open-tracking pixel (fallback path)"
              >Open not yet detected</span>
              <span
                v-if="isFailureStatus(item.deliveryStatus)"
                class="meta-item failed-chip"
                :title="item.errorMessage || ''"
              >
                {{ String(item.deliveryStatus).toUpperCase() }}{{ item.errorMessage ? ` — ${truncate(item.errorMessage, 80)}` : '' }}
              </span>
              <span v-if="item.agencyName" class="meta-item muted small">
                {{ item.agencyName }}
              </span>
              <span v-if="item.generatedByName" class="meta-item muted small">
                Triggered by {{ item.generatedByName }}
              </span>
              <span v-else-if="item.actorName" class="meta-item muted small">
                By {{ item.actorName }}
              </span>
            </div>
            <div v-if="item.channel === 'sms' && item.body" class="sms-preview">
              {{ item.body }}
            </div>
          </div>
          <div class="communication-actions">
            <button
              v-if="item.channel === 'email'"
              class="btn btn-sm btn-primary"
              type="button"
              @click="openEmailBody(item)"
            >View email</button>
            <button
              v-else
              class="btn btn-sm btn-secondary"
              type="button"
              @click="copyText(item.body || '')"
            >Copy text</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="viewingEmail" class="modal-overlay" @click="closeEmailModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 style="margin: 0;">{{ viewingEmail.subject || 'Email' }}</h3>
          <button class="btn-close" type="button" @click="closeEmailModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="view-meta">
            <div class="view-meta-status-row">
              <span
                class="status-pill status-pill--lg"
                :class="`status-${statusInfo(viewingEmail).key}`"
                :title="statusInfo(viewingEmail).tooltip"
              >{{ statusInfo(viewingEmail).label }}</span>
              <span v-if="viewingEmail.deliveryStatus" class="muted small">
                provider status: {{ viewingEmail.deliveryStatus }}
              </span>
            </div>
            <p><strong>To:</strong>
              <template v-if="viewingEmail.recipientIsGuardian">
                Guardian {{ viewingEmail.recipientUserName || '' }}
                <span v-if="viewingEmail.recipientAddress" class="muted">&lt;{{ viewingEmail.recipientAddress }}&gt;</span>
              </template>
              <template v-else>
                {{ viewingEmail.recipientUserName || viewingEmail.recipientAddress || '—' }}
              </template>
            </p>
            <p v-if="viewingEmail.templateType"><strong>Type:</strong> {{ viewingEmail.templateType }}</p>

            <div class="delivery-timeline">
              <div
                class="timeline-step"
                :class="{ 'is-done': !!viewingEmail.sentAt, 'is-current': !viewingEmail.sentAt && viewingEmail.deliveryStatus === 'pending' }"
              >
                <span class="timeline-dot" />
                <div>
                  <div class="timeline-label">Sent to provider</div>
                  <div class="timeline-time">{{ viewingEmail.sentAt ? formatDate(viewingEmail.sentAt) : 'Not yet sent' }}</div>
                </div>
              </div>
              <div
                class="timeline-step"
                :class="{ 'is-done': !!viewingEmail.deliveredAt }"
              >
                <span class="timeline-dot" />
                <div>
                  <div class="timeline-label">Delivered to mailbox</div>
                  <div class="timeline-time">
                    {{
                      viewingEmail.deliveredAt
                        ? formatDate(viewingEmail.deliveredAt)
                        : (viewingEmail.sentAt ? 'No delivery webhook received yet' : '—')
                    }}
                  </div>
                </div>
              </div>
              <div
                class="timeline-step"
                :class="{ 'is-done': !!viewingEmail.openedAt }"
              >
                <span class="timeline-dot" />
                <div>
                  <div class="timeline-label">Opened by recipient</div>
                  <div class="timeline-time">
                    {{
                      viewingEmail.openedAt
                        ? formatDate(viewingEmail.openedAt)
                        : 'No open detected yet'
                    }}
                  </div>
                  <div v-if="!viewingEmail.openedAt" class="timeline-hint muted small">
                    Opens are detected via a tracking pixel — recipients with images blocked
                    will appear as not-yet-opened even if they actually read it.
                  </div>
                </div>
              </div>
              <div
                v-if="viewingEmail.firstClickedAt"
                class="timeline-step is-done"
              >
                <span class="timeline-dot" />
                <div>
                  <div class="timeline-label">Clicked a link</div>
                  <div class="timeline-time">{{ formatDate(viewingEmail.firstClickedAt) }}</div>
                </div>
              </div>
              <div
                v-if="isFailureStatus(viewingEmail.deliveryStatus)"
                class="timeline-step is-error"
              >
                <span class="timeline-dot" />
                <div>
                  <div class="timeline-label">{{ String(viewingEmail.deliveryStatus).toUpperCase() }}</div>
                  <div v-if="viewingEmail.errorMessage" class="timeline-time">{{ viewingEmail.errorMessage }}</div>
                </div>
              </div>
            </div>

            <p v-if="viewingEmail.externalMessageId" class="muted small" style="margin-top: 8px;">
              Provider message id: {{ viewingEmail.externalMessageId }}
            </p>
          </div>
          <div v-if="bodyLoading" class="loading">Loading email…</div>
          <div v-else-if="bodyError" class="error">{{ bodyError }}</div>
          <div v-else>
            <div v-if="bodyIsHtml" class="email-html-frame">
              <iframe
                ref="bodyIframeRef"
                :srcdoc="bodyHtml"
                sandbox=""
                title="Email body"
                @load="onIframeLoad"
              />
            </div>
            <pre v-else class="email-body">{{ bodyText }}</pre>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" @click="copyText(bodyText)">Copy plain text</button>
            <button class="btn btn-primary" type="button" @click="closeEmailModal">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: Number, required: true }
});

const items = ref([]);
const guardians = ref([]);
const counts = ref({ total: 0, email: 0, sms: 0, opened: 0, failed: 0 });
const loading = ref(false);
const error = ref('');
const channelFilter = ref('');
const statusFilter = ref('');

const viewingEmail = ref(null);
const bodyHtml = ref('');
const bodyText = ref('');
const bodyIsHtml = ref(false);
const bodyLoading = ref(false);
const bodyError = ref('');
const bodyIframeRef = ref(null);

const isFailureStatus = (status) => /failed|bounced|undelivered/i.test(String(status || ''));

/**
 * Resolve a single canonical status for an email/SMS row, used for the
 * always-visible status pill and for filter bucketing. Order of precedence:
 *   inbound → received
 *   failure  → failed/bounced/undelivered
 *   opened   → opened (highest engagement)
 *   delivered → delivered
 *   sent     → sent (provider accepted, no delivery confirmation yet)
 *   pending  → pending (not yet sent)
 */
const statusInfo = (item) => {
  if (item?.direction === 'inbound') {
    return { key: 'received', label: 'Received', tooltip: 'Inbound message received from the recipient' };
  }
  if (isFailureStatus(item?.deliveryStatus)) {
    const label = String(item.deliveryStatus || 'failed').toUpperCase();
    return {
      key: 'failed',
      label,
      tooltip: item?.errorMessage
        ? `${label}: ${item.errorMessage}`
        : `${label} — provider rejected delivery`
    };
  }
  if (item?.openedAt) {
    return { key: 'opened', label: 'Opened', tooltip: 'Tracking pixel was loaded by the recipient' };
  }
  if (item?.deliveredAt) {
    return { key: 'delivered', label: 'Delivered', tooltip: 'Provider confirmed delivery, but no open detected yet' };
  }
  const ds = String(item?.deliveryStatus || '').toLowerCase();
  if (ds === 'sent') {
    return { key: 'sent', label: 'Sent', tooltip: 'Provider accepted the message; no delivery/open confirmation yet' };
  }
  if (ds === 'pending') {
    return { key: 'pending', label: 'Pending', tooltip: 'Message generated but not yet handed off to the provider' };
  }
  if (ds) {
    return { key: 'other', label: ds.charAt(0).toUpperCase() + ds.slice(1), tooltip: `Status: ${ds}` };
  }
  return { key: 'unknown', label: 'Unknown', tooltip: 'No status information was recorded for this message' };
};

const truncate = (s, n) => {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

const filteredItems = computed(() => {
  let arr = items.value;
  if (channelFilter.value) {
    arr = arr.filter((i) => i.channel === channelFilter.value);
  }
  if (statusFilter.value) {
    arr = arr.filter((i) => statusInfo(i).key === statusFilter.value);
  }
  return arr;
});

const titleFor = (item) => {
  if (item.subject && String(item.subject).trim()) return item.subject;
  if (item.channel === 'sms') {
    const body = String(item.body || '').replace(/\s+/g, ' ').trim();
    return body ? (body.length > 90 ? `${body.slice(0, 90)}…` : body) : '(text message)';
  }
  return '(no subject)';
};

const loadCommunications = async () => {
  if (!props.clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/clients/${props.clientId}/communications`);
    const data = resp.data || {};
    items.value = Array.isArray(data.items) ? data.items : [];
    guardians.value = Array.isArray(data.guardians) ? data.guardians : [];
    counts.value = data.counts || { total: 0, email: 0, sms: 0, opened: 0, failed: 0 };
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load communications';
  } finally {
    loading.value = false;
  }
};

const looksLikeHtml = (s) => /<[a-z][^>]*>/i.test(String(s || ''));

const openEmailBody = async (item) => {
  viewingEmail.value = { ...item };
  bodyHtml.value = '';
  bodyText.value = '';
  bodyIsHtml.value = false;
  bodyError.value = '';
  bodyLoading.value = true;
  try {
    const resp = await api.get(`/clients/${props.clientId}/communications/email/${item.id}/body`);
    const body = String(resp.data?.body || '');
    if (looksLikeHtml(body)) {
      bodyIsHtml.value = true;
      bodyHtml.value = body;
      bodyText.value = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    } else {
      bodyIsHtml.value = false;
      bodyText.value = body;
    }
    if (resp.data?.subject && !viewingEmail.value.subject) {
      viewingEmail.value.subject = resp.data.subject;
    }
  } catch (err) {
    bodyError.value = err.response?.data?.error?.message || 'Failed to load email body';
  } finally {
    bodyLoading.value = false;
  }
};

const closeEmailModal = () => {
  viewingEmail.value = null;
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text || '');
  } catch {
    // ignore — environment may block clipboard access
  }
};

/**
 * Auto-size the iframe to its content height so emails of different sizes
 * (transactional notification vs. long marketing template) all render cleanly
 * without an inner scrollbar nested inside the modal scrollbar.
 */
const onIframeLoad = async () => {
  await nextTick();
  const frame = bodyIframeRef.value;
  if (!frame) return;
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    const h = Math.min(Math.max(doc.body?.scrollHeight || 0, 200), 1200);
    frame.style.height = `${h}px`;
  } catch {
    // cross-origin in unusual setups — leave default height
  }
};

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const formatRelative = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return formatDate(s);
};

const formatPhone = (raw) => {
  const s = String(raw || '').replace(/[^\d]/g, '');
  if (s.length === 10) return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 11 && s.startsWith('1')) return `+1 (${s.slice(1, 4)}) ${s.slice(4, 7)}-${s.slice(7)}`;
  return raw;
};

onMounted(() => {
  loadCommunications();
});

defineExpose({ reload: loadCommunications });
</script>

<style scoped>
.client-communications-tab {
  padding: 8px 4px 24px;
}
.tab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.tab-header h3 { margin: 0; }
.filter-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-controls .form-select { min-width: 180px; }
.guardian-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}
.guardian-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 999px;
  font-weight: 600;
}
.communications-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.communication-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 14px 16px;
  background: white;
}
.communication-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.communication-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.communication-title-row h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.channel-chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.chip-email { background: #dbeafe; color: #1e3a8a; }
.chip-sms { background: #fef3c7; color: #78350f; }
.dir-chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
}
.dir-in { background: #dcfce7; color: #14532d; }
.status-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border: 1px solid transparent;
  white-space: nowrap;
}
.status-pill--lg {
  font-size: 12px;
  padding: 4px 12px;
}
.status-opened     { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
.status-clicked    { background: #cffafe; color: #155e75; border-color: #a5f3fc; }
.status-delivered  { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
.status-sent       { background: #fef9c3; color: #854d0e; border-color: #fde68a; }
.status-pending    { background: #f3f4f6; color: #4b5563; border-color: #e5e7eb; }
.status-failed     { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
.status-received   { background: #ede9fe; color: #5b21b6; border-color: #ddd6fe; }
.status-other,
.status-unknown    { background: #f3f4f6; color: #6b7280; border-color: #e5e7eb; }
.communication-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
  align-items: center;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.meta-item.small { font-size: 12px; }
.meta-strong-label { font-weight: 700; color: #111827; }
.open-chip {
  background: #dcfce7;
  color: #166534;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.delivered-chip {
  background: #dbeafe;
  color: #1e40af;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.clicked-chip {
  background: #cffafe;
  color: #155e75;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.failed-chip {
  background: #fee2e2;
  color: #991b1b;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.sms-preview {
  margin-top: 8px;
  padding: 8px 10px;
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 4px;
  font-size: 13px;
  white-space: pre-wrap;
  color: #1f2937;
}
.communication-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
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
.modal-content {
  background: white;
  border-radius: 12px;
  width: 92%;
  max-width: 880px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.btn-close {
  background: none;
  border: none;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #4b5563);
}
.modal-body { padding: 18px 20px; }
.view-meta {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.view-meta p {
  margin: 4px 0;
  font-size: 13px;
}
.view-meta-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px 0;
}
.delivery-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
}
.timeline-step {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: 10px;
  align-items: start;
  padding: 4px 0;
  color: #6b7280;
}
.timeline-step .timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d1d5db;
  margin-top: 5px;
}
.timeline-step.is-done {
  color: #111827;
}
.timeline-step.is-done .timeline-dot {
  background: #16a34a;
}
.timeline-step.is-current .timeline-dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px #fde68a;
}
.timeline-step.is-error {
  color: #991b1b;
}
.timeline-step.is-error .timeline-dot {
  background: #dc2626;
}
.timeline-label {
  font-weight: 700;
  font-size: 13px;
}
.timeline-time {
  font-size: 12px;
  color: inherit;
  opacity: 0.85;
}
.timeline-hint {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
}
.email-html-frame {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
  background: white;
}
.email-html-frame iframe {
  width: 100%;
  height: 480px;
  border: 0;
  display: block;
}
.email-body {
  padding: 12px;
  background: var(--bg-secondary, #f8fafc);
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.55;
  max-height: 480px;
  overflow-y: auto;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.empty-state {
  text-align: center;
  padding: 36px;
  color: var(--text-secondary, #4b5563);
  background: var(--bg-alt, #f8fafc);
  border-radius: 8px;
}
.loading { text-align: center; padding: 36px; color: var(--text-secondary, #4b5563); }
.error {
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fecaca;
  padding: 12px 16px;
  border-radius: 6px;
}
.muted { color: var(--text-secondary, #6b7280); }
.small { font-size: 12px; }
</style>
