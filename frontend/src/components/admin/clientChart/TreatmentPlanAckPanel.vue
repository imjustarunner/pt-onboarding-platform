<template>
  <section class="tp-ack-panel cc-docs-panel">
    <div class="tp-ack-header">
      <div>
        <h4 class="cc-docs-panel__title">Client acknowledgment</h4>
        <p class="cc-docs-panel__hint">
          Share this treatment plan for guardian or client signature — via dashboard, email link,
          in-person session, or signed paper upload.
          <span v-if="clientName"> For {{ clientName }}.</span>
        </p>
      </div>
      <button type="button" class="cdp-btn-soft btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>
    <div v-if="loading && !acknowledgments.length" class="muted">Loading acknowledgments…</div>

    <template v-else>
      <div v-if="planSummary" class="tp-ack-status-row">
        <div class="tp-ack-status-card">
          <div class="tp-ack-k">Plan</div>
          <div class="tp-ack-v">{{ planSummary.title || `Plan #${planId}` }}</div>
        </div>
        <div class="tp-ack-status-card">
          <div class="tp-ack-k">Ack status</div>
          <div class="tp-ack-v">
            <span class="tp-ack-badge" :class="planAckBadgeClass">{{ planAckLabel }}</span>
          </div>
        </div>
        <div class="tp-ack-status-card">
          <div class="tp-ack-k">Signed</div>
          <div class="tp-ack-v">{{ formatWhen(planSummary.client_ack_at) }}</div>
        </div>
      </div>

      <div class="tp-ack-actions">
        <article class="tp-ack-action-card">
          <h5>Share to dashboard</h5>
          <p class="muted tiny">Adds a signing task on the guardian dashboard.</p>
          <button
            type="button"
            class="cdp-btn-primary btn-sm"
            :disabled="busyAction === 'dashboard'"
            @click="shareDashboard"
          >
            {{ busyAction === 'dashboard' ? 'Sharing…' : 'Share to dashboard' }}
          </button>
        </article>

        <article class="tp-ack-action-card">
          <h5>Email signing link</h5>
          <form class="tp-ack-form" @submit.prevent="sendEmailLink">
            <label>
              Recipient name
              <input v-model="emailForm.recipientName" type="text" class="filters-input" maxlength="255" />
            </label>
            <label>
              Email
              <input v-model="emailForm.email" type="email" required class="filters-input" maxlength="255" />
            </label>
            <button type="submit" class="cdp-btn-primary btn-sm" :disabled="busyAction === 'email'">
              {{ busyAction === 'email' ? 'Sending…' : 'Email link' }}
            </button>
          </form>
          <div v-if="lastSigningUrl" class="tp-ack-url">
            <span class="muted tiny">Signing URL</span>
            <div class="tp-ack-url-row">
              <input :value="lastSigningUrl" readonly class="filters-input" />
              <button type="button" class="cdp-btn-soft btn-sm" @click="copySigningUrl">Copy</button>
            </div>
            <p v-if="lastEmailError" class="warn tiny">Email failed: {{ lastEmailError }}</p>
          </div>
        </article>

        <article class="tp-ack-action-card">
          <h5>In-person session</h5>
          <p class="muted tiny">Start a witnessed session and capture the client signature here.</p>
          <button
            v-if="!sessionLinkId"
            type="button"
            class="cdp-btn-primary btn-sm"
            :disabled="busyAction === 'session'"
            @click="startSession"
          >
            {{ busyAction === 'session' ? 'Starting…' : 'Start in-person session' }}
          </button>
          <div v-else class="tp-ack-session">
            <p class="success tiny">Session #{{ sessionLinkId }} active — witness signature below.</p>
            <label>
              Signed by (full name)
              <input v-model="sessionForm.signedByName" type="text" required class="filters-input" maxlength="255" />
            </label>
            <SignaturePad compact @signed="onSessionSignature" />
            <button
              type="button"
              class="cdp-btn-primary btn-sm"
              :disabled="busyAction === 'sessionComplete' || !sessionForm.signatureDataUrl || !sessionForm.signedByName.trim()"
              @click="completeSession"
            >
              {{ busyAction === 'sessionComplete' ? 'Saving…' : 'Complete session' }}
            </button>
            <button type="button" class="cdp-btn-soft btn-sm" @click="cancelSession">Cancel</button>
          </div>
        </article>

        <article class="tp-ack-action-card">
          <h5>Print + upload</h5>
          <p class="muted tiny">
            Print the plan for in-office signing, then attach the scanned PHI document ID.
          </p>
          <button type="button" class="cdp-btn-soft btn-sm" @click="printPlan">Print plan</button>
          <form class="tp-ack-form" @submit.prevent="attachPrintUpload">
            <label>
              PHI document ID
              <input v-model="printForm.phiDocumentId" type="number" min="1" required class="filters-input" />
            </label>
            <label>
              Signed by
              <input v-model="printForm.signedByName" type="text" class="filters-input" maxlength="255" />
            </label>
            <button type="submit" class="cdp-btn-primary btn-sm" :disabled="busyAction === 'print'">
              {{ busyAction === 'print' ? 'Attaching…' : 'Attach signed scan' }}
            </button>
          </form>
        </article>
      </div>

      <div class="tp-ack-list">
        <h5>Attempts &amp; audit trail</h5>
        <div v-if="!acknowledgments.length" class="muted">No acknowledgment attempts yet.</div>
        <article v-for="ack in acknowledgments" :key="ack.id" class="tp-ack-row">
          <div class="tp-ack-row__main">
            <span class="tp-ack-badge" :class="statusBadgeClass(ack.status)">{{ ack.status }}</span>
            <strong>{{ channelLabel(ack.channel) }}</strong>
            <span v-if="ack.recipient_name" class="muted">{{ ack.recipient_name }}</span>
            <span v-if="ack.recipient_email" class="muted">{{ ack.recipient_email }}</span>
          </div>
          <dl class="tp-ack-meta">
            <div><dt>Sent</dt><dd>{{ formatWhen(ack.sent_at) }}</dd></div>
            <div><dt>Opened</dt><dd>{{ formatWhen(ack.first_opened_at) }}</dd></div>
            <div><dt>Signed</dt><dd>{{ formatWhen(ack.signed_at) }}</dd></div>
            <div><dt>Opens</dt><dd>{{ ack.open_count ?? 0 }}</dd></div>
            <div v-if="ack.signed_by_name"><dt>Signer</dt><dd>{{ ack.signed_by_name }}</dd></div>
          </dl>
          <details v-if="ack.events?.length" class="tp-ack-events">
            <summary>{{ ack.events.length }} event{{ ack.events.length === 1 ? '' : 's' }}</summary>
            <ol>
              <li v-for="ev in ack.events" :key="ev.id">
                <time>{{ formatWhen(ev.created_at) }}</time>
                <strong>{{ ev.event_type }}</strong>
                <span v-if="ev.actor_label">{{ ev.actor_label }}</span>
              </li>
            </ol>
          </details>
        </article>
      </div>
    </template>

    <div ref="printAreaRef" class="tp-ack-print-area" aria-hidden="true">
      <h1>Treatment Plan Acknowledgment</h1>
      <p v-if="clientName"><strong>Client:</strong> {{ clientName }}</p>
      <p v-if="planSummary?.title"><strong>Plan:</strong> {{ planSummary.title }}</p>
      <p v-if="planSummary?.effective_date"><strong>Effective:</strong> {{ planSummary.effective_date }}</p>
      <section v-if="printGoals.length">
        <h2>Goals &amp; objectives</h2>
        <article v-for="g in printGoals" :key="g.goal_index" class="tp-ack-print-goal">
          <h3>Goal {{ g.goal_index }}: {{ g.goal_text }}</h3>
          <p v-if="g.projected_completion">Timeframe: {{ g.projected_completion }}</p>
          <ul>
            <li v-for="o in g.objectives || []" :key="o.objective_index">
              Objective {{ o.objective_index }}: {{ o.objective_text }}
              <span v-if="o.scale_target != null"> (target {{ o.scale_target }})</span>
            </li>
          </ul>
        </article>
      </section>
      <p class="tp-ack-print-sign">
        I have reviewed this treatment plan and agree to participate in the recommended services.
      </p>
      <p>Signature: _____________________________ &nbsp; Date: ______________</p>
      <p>Printed name: ___________________________</p>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import SignaturePad from '../../SignaturePad.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  clientId: { type: [Number, String], required: true },
  planId: { type: [Number, String], required: true },
  clientName: { type: String, default: '' }
});

const emit = defineEmits(['updated', 'print']);

const loading = ref(false);
const error = ref('');
const success = ref('');
const busyAction = ref('');
const acknowledgments = ref([]);
const planSummary = ref(null);
const printGoals = ref([]);
const lastSigningUrl = ref('');
const lastEmailError = ref('');
const sessionLinkId = ref(null);
const printAreaRef = ref(null);

const emailForm = ref({ email: '', recipientName: '' });
const sessionForm = ref({ signedByName: '', signatureDataUrl: '' });
const printForm = ref({ phiDocumentId: '', signedByName: '' });

const basePath = computed(
  () => `/medical-billing/clients/${props.clientId}/treatment-plans/${props.planId}/acknowledgments`
);

const planAckLabel = computed(() => {
  const st = String(planSummary.value?.client_ack_status || 'pending').replace(/_/g, ' ');
  return st.charAt(0).toUpperCase() + st.slice(1);
});

const planAckBadgeClass = computed(() => {
  const st = String(planSummary.value?.client_ack_status || 'pending');
  if (st === 'signed' || st === 'paper_on_file') return 'tp-ack-badge--ok';
  if (st === 'shared') return 'tp-ack-badge--info';
  return 'tp-ack-badge--muted';
});

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function channelLabel(channel) {
  const map = {
    dashboard_share: 'Dashboard share',
    email_link: 'Email link',
    provider_session: 'In-person session',
    print_upload: 'Print + upload'
  };
  return map[String(channel || '')] || String(channel || '—');
}

function statusBadgeClass(status) {
  const st = String(status || '');
  if (st === 'signed') return 'tp-ack-badge--ok';
  if (st === 'opened' || st === 'viewed' || st === 'sent') return 'tp-ack-badge--info';
  if (st === 'expired' || st === 'cancelled') return 'tp-ack-badge--warn';
  return 'tp-ack-badge--muted';
}

function clearMessages() {
  error.value = '';
  success.value = '';
}

async function load() {
  clearMessages();
  loading.value = true;
  try {
    const res = await api.get(basePath.value, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    planSummary.value = res.data?.plan || null;
    acknowledgments.value = Array.isArray(res.data?.acknowledgments) ? res.data.acknowledgments : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load acknowledgments';
    acknowledgments.value = [];
  } finally {
    loading.value = false;
  }
}

async function afterMutation(message) {
  success.value = message;
  await load();
  emit('updated');
}

async function shareDashboard() {
  clearMessages();
  busyAction.value = 'dashboard';
  try {
    await api.post(`${basePath.value}/dashboard-share`, {
      agencyId: Number(props.agencyId),
      recipientKind: 'guardian'
    });
    await afterMutation('Shared to guardian dashboard.');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Dashboard share failed';
  } finally {
    busyAction.value = '';
  }
}

async function sendEmailLink() {
  clearMessages();
  busyAction.value = 'email';
  lastEmailError.value = '';
  try {
    const res = await api.post(`${basePath.value}/email`, {
      agencyId: Number(props.agencyId),
      email: emailForm.value.email.trim(),
      recipientName: emailForm.value.recipientName.trim() || undefined
    });
    if (res.data?.signingUrl) lastSigningUrl.value = res.data.signingUrl;
    if (res.data?.emailError) lastEmailError.value = res.data.emailError;
    const emailed = res.data?.emailed ? 'Email sent.' : 'Link created (email may have failed — copy URL below).';
    await afterMutation(emailed);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Email link failed';
  } finally {
    busyAction.value = '';
  }
}

async function copySigningUrl() {
  if (!lastSigningUrl.value) return;
  try {
    await navigator.clipboard.writeText(lastSigningUrl.value);
    success.value = 'Signing URL copied.';
  } catch {
    error.value = 'Could not copy URL.';
  }
}

async function startSession() {
  clearMessages();
  busyAction.value = 'session';
  sessionForm.value = { signedByName: '', signatureDataUrl: '' };
  try {
    const res = await api.post(`${basePath.value}/session`, {
      agencyId: Number(props.agencyId)
    });
    sessionLinkId.value = res.data?.link?.id || null;
    success.value = res.data?.message || 'In-person session started.';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not start session';
  } finally {
    busyAction.value = '';
  }
}

function onSessionSignature(dataUrl) {
  sessionForm.value.signatureDataUrl = dataUrl || '';
}

function cancelSession() {
  sessionLinkId.value = null;
  sessionForm.value = { signedByName: '', signatureDataUrl: '' };
}

async function completeSession() {
  if (!sessionLinkId.value || !sessionForm.value.signatureDataUrl) return;
  clearMessages();
  busyAction.value = 'sessionComplete';
  try {
    await api.post(`${basePath.value}/session/complete`, {
      agencyId: Number(props.agencyId),
      linkId: sessionLinkId.value,
      signedByName: sessionForm.value.signedByName.trim(),
      signatureDataUrl: sessionForm.value.signatureDataUrl
    });
    cancelSession();
    await afterMutation('In-person acknowledgment recorded.');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not complete session';
  } finally {
    busyAction.value = '';
  }
}

async function attachPrintUpload() {
  clearMessages();
  busyAction.value = 'print';
  try {
    await api.post(`${basePath.value}/print-upload`, {
      agencyId: Number(props.agencyId),
      phiDocumentId: Number(printForm.value.phiDocumentId),
      signedByName: printForm.value.signedByName.trim() || undefined
    });
    printForm.value = { phiDocumentId: '', signedByName: '' };
    await afterMutation('Signed paper plan attached.');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Print upload failed';
  } finally {
    busyAction.value = '';
  }
}

async function loadPrintGoals() {
  try {
    const res = await api.get(`/medical-billing/clients/${props.clientId}/chart`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const plans = res.data?.treatmentPlans || res.data?.treatment_plans || [];
    const plan = plans.find((p) => Number(p.id) === Number(props.planId));
    printGoals.value = plan?.goals || [];
  } catch {
    printGoals.value = [];
  }
}

async function printPlan() {
  emit('print');
  await loadPrintGoals();
  requestAnimationFrame(() => {
    const prevTitle = document.title;
    document.title = planSummary.value?.title
      ? `Treatment Plan — ${planSummary.value.title}`
      : 'Treatment Plan';
    window.print();
    document.title = prevTitle;
  });
}

watch(
  () => [props.agencyId, props.clientId, props.planId],
  () => {
    sessionLinkId.value = null;
    lastSigningUrl.value = '';
    load();
  }
);

onMounted(() => {
  load();
});
</script>

<style scoped>
.tp-ack-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.tp-ack-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.tp-ack-status-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.tp-ack-status-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt, #f8fafc);
}
.tp-ack-k {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}
.tp-ack-v {
  margin-top: 4px;
  font-weight: 650;
}
.tp-ack-badge {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 650;
  text-transform: capitalize;
}
.tp-ack-badge--ok { background: #dcfce7; color: #166534; }
.tp-ack-badge--info { background: #dbeafe; color: #1e40af; }
.tp-ack-badge--warn { background: #fef3c7; color: #92400e; }
.tp-ack-badge--muted { background: #f1f5f9; color: #475569; }
.tp-ack-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.tp-ack-action-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-card, #fff);
}
.tp-ack-action-card h5 {
  margin: 0 0 6px;
  font-size: 14px;
}
.tp-ack-form {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.tp-ack-form label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}
.tp-ack-url {
  margin-top: 10px;
}
.tp-ack-url-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.tp-ack-url-row .filters-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.tp-ack-session {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}
.tp-ack-list h5 {
  margin: 0 0 10px;
}
.tp-ack-row {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--bg-card, #fff);
}
.tp-ack-row__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.tp-ack-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 6px 12px;
  margin: 0;
  font-size: 12px;
}
.tp-ack-meta dt {
  color: var(--text-secondary, #64748b);
  font-weight: 600;
}
.tp-ack-meta dd {
  margin: 0;
}
.tp-ack-events {
  margin-top: 8px;
  font-size: 12px;
}
.tp-ack-events ol {
  margin: 8px 0 0;
  padding-left: 18px;
}
.tp-ack-events li {
  margin-bottom: 4px;
}
.tp-ack-events time {
  color: var(--text-secondary, #64748b);
  margin-right: 6px;
}
.cdp-btn-primary, .cdp-btn-soft {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--border, #e2e8f0);
}
.cdp-btn-primary {
  background: var(--primary, #166534);
  color: #fff;
  border-color: transparent;
}
.cdp-btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cdp-btn-soft {
  background: var(--bg-alt, #f8fafc);
  color: var(--text-primary, #0f172a);
}
.btn-sm {
  padding: 6px 10px;
  font-size: 13px;
}
.filters-input {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg, #fff);
  color: var(--text-primary, #0f172a);
}
.error { color: #b91c1c; margin-bottom: 8px; }
.success { color: #166534; margin-bottom: 8px; }
.warn { color: #92400e; }
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }

.tp-ack-print-area {
  display: none;
}
@media print {
  .tp-ack-panel > *:not(.tp-ack-print-area) {
    display: none !important;
  }
  .tp-ack-print-area {
    display: block !important;
    position: static;
    padding: 24px;
    color: #000;
    font-family: Georgia, 'Times New Roman', serif;
  }
  .tp-ack-print-goal {
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  .tp-ack-print-sign {
    margin-top: 24px;
    font-style: italic;
  }
}
</style>
