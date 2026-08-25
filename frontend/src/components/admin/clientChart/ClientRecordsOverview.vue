<template>
  <div class="rco">
    <header class="rco-head">
      <div>
        <h3 class="rco-title">Record Center</h3>
        <p class="rco-sub">Clinical record, documents, and billing in one place.</p>
      </div>
      <div class="rco-head-actions">
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'documents')">Upload</button>
        <button type="button" class="cdp-btn-primary" @click="$emit('navigate', 'clinical-notes')">+ New note</button>
        <details class="rco-more">
          <summary aria-label="More">⋯</summary>
          <div class="rco-more__menu">
            <button type="button" @click="$emit('navigate-secondary', 'surveys')">Surveys</button>
            <button type="button" @click="$emit('navigate-secondary', 'assessments')">Assessments</button>
            <button v-if="canManageSchoolRoi" type="button" @click="$emit('navigate', 'authorizations')">School ROI</button>
            <button v-if="packagesEnabled" type="button" @click="$emit('navigate-secondary', 'packages')">Packages</button>
            <button type="button" @click="$emit('navigate', 'audit')">Audit trail</button>
          </div>
        </details>
      </div>
    </header>

    <div v-if="phiBanner" class="phi-warning cro-phi-banner">
      <strong>PHI access</strong>
      <span class="muted"> Viewing protected health information is audited. Use only for care coordination.</span>
    </div>

    <div class="rco-metrics">
      <button type="button" class="rco-metric" @click="$emit('navigate', 'clinical-notes')">
        <span class="rco-metric__k">Open tasks</span>
        <strong class="rco-metric__v">{{ openTaskCount }}</strong>
        <span class="rco-metric__l">View tasks →</span>
      </button>
      <button type="button" class="rco-metric" @click="$emit('navigate', 'clinical-notes')">
        <span class="rco-metric__k">Progress notes</span>
        <strong class="rco-metric__v">{{ notes.length }}</strong>
        <span class="rco-metric__l">View notes →</span>
      </button>
      <button type="button" class="rco-metric" @click="$emit('navigate', 'treatment-plans')">
        <span class="rco-metric__k">Active treatment plans</span>
        <strong class="rco-metric__v">{{ activePlanCount }}</strong>
        <span class="rco-metric__l">View plans →</span>
      </button>
      <button
        v-if="canViewBilling"
        type="button"
        class="rco-metric"
        @click="$emit('navigate', 'billing')"
      >
        <span class="rco-metric__k">Claims needing attention</span>
        <strong class="rco-metric__v">{{ claimsAttentionCount }}</strong>
        <span class="rco-metric__l">View claims →</span>
      </button>
      <button type="button" class="rco-metric" @click="$emit('navigate', 'clinical-notes')">
        <span class="rco-metric__k">Unsigned items</span>
        <strong class="rco-metric__v">{{ unsignedCount }}</strong>
        <span class="rco-metric__l">Review items →</span>
      </button>
      <div class="rco-metric rco-metric--static">
        <span class="rco-metric__k">Last updated</span>
        <strong class="rco-metric__v rco-metric__v--sm">{{ lastUpdatedLabel }}</strong>
        <button type="button" class="rco-metric__l" :disabled="loading" @click="load">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="rco-grid">
      <div class="rco-col">
        <section class="rco-card">
          <h4>Clinical activity</h4>
          <table class="rco-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Status</th>
                <th>Items</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in activityRows" :key="row.id">
                <td>
                  <button type="button" class="rco-link" @click="$emit('navigate', row.nav)">{{ row.label }}</button>
                </td>
                <td><span class="rco-badge" :class="row.badgeClass">{{ row.status }}</span></td>
                <td>{{ row.count }}</td>
                <td class="muted tiny">{{ row.updated }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="rco-card">
          <div class="rco-card__row">
            <h4>Treatment plans</h4>
            <button type="button" class="rco-link" @click="$emit('navigate', 'treatment-plans')">View all plans</button>
          </div>
          <div v-if="!plans.length" class="muted tiny">No treatment plans on file yet.</div>
          <ul v-else class="rco-list">
            <li v-for="plan in plans.slice(0, 4)" :key="plan.id">
              <div>
                <strong>{{ plan.title || `Plan #${plan.id}` }}</strong>
                <div class="muted tiny">{{ formatWhen(plan.updated_at || plan.created_at) }}</div>
              </div>
              <span class="rco-badge" :class="statusBadge(plan.status)">{{ plan.status || 'on file' }}</span>
            </li>
          </ul>
          <button type="button" class="rco-link" @click="$emit('navigate', 'clinical-notes')">Create new plan</button>
        </section>

        <section class="rco-card">
          <div class="rco-card__row">
            <h4>Documents &amp; uploads</h4>
            <button type="button" class="rco-link" @click="$emit('navigate', 'documents')">View all</button>
          </div>
          <div v-if="!docRows.length" class="muted tiny">No signed files on the chart yet.</div>
          <table v-else class="rco-table">
            <tbody>
              <tr v-for="doc in docRows" :key="doc.id">
                <td>
                  <strong>{{ doc.title }}</strong>
                  <div class="muted tiny">{{ doc.kindLabel || doc.kind }}</div>
                </td>
                <td class="muted tiny">{{ formatWhen(doc.signedAt || doc.uploadedAt) }}</td>
                <td>
                  <span class="rco-badge rco-badge--ok">{{ doc.missing ? 'Missing' : 'On file' }}</span>
                </td>
                <td>
                  <button
                    v-if="doc.viewKey && !doc.missing"
                    type="button"
                    class="rco-link"
                    @click="$emit('open-document', doc.viewKey)"
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="rco-col">
        <section class="rco-card">
          <div class="rco-card__row">
            <h4>Recent progress notes</h4>
            <button type="button" class="rco-link" @click="$emit('navigate', 'clinical-notes')">View notes</button>
          </div>
          <div v-if="!notes.length" class="muted tiny">No progress notes on the chart yet.</div>
          <table v-else class="rco-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="note in notes.slice(0, 6)" :key="note.id">
                <td class="tiny">{{ formatWhen(note.created_at || note.provider_signed_at) }}</td>
                <td>{{ note.note_type || note.title || 'Note' }}</td>
                <td>
                  <span class="rco-badge" :class="noteBadge(note)">{{ noteStatus(note) }}</span>
                </td>
                <td>
                  <button type="button" class="rco-link" @click="$emit('navigate', 'clinical-notes')">
                    {{ note.provider_signed_at ? 'View' : 'Review' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="rco-card rco-note-aid">
          <div class="rco-card__row">
            <h4>Clinical Note Aid</h4>
            <span class="rco-badge rco-badge--ok">Connected</span>
          </div>
          <p class="muted tiny">Write session notes or update treatment plans for this client.</p>
          <ul class="rco-dots">
            <li>Client context + primary diagnosis</li>
            <li>Intake → plan → progress note spine</li>
          </ul>
          <div class="rco-note-aid-actions">
            <button type="button" class="cdp-btn-primary" @click="openNoteAid()">Open Note Aid</button>
            <button type="button" class="cdp-btn-soft" @click="openNoteAid({ launchIntent: 'update_treatment_plan', noteAid: 'psychotherapy_plan' })">
              Update treatment plan
            </button>
            <button type="button" class="rco-link" @click="$emit('navigate', 'intake-note')">Intake note</button>
            <button type="button" class="rco-link" @click="$emit('navigate', 'treatment-plans')">Treatment plans</button>
          </div>
        </section>

        <section class="rco-card">
          <div class="rco-card__row">
            <h4>Authorizations / ROI</h4>
            <button type="button" class="rco-link" @click="$emit('navigate', 'authorizations')">View all</button>
          </div>
          <div class="rco-auth-counts">
            <div><span>Active</span><strong>{{ authCounts.active }}</strong></div>
            <div><span>Expiring soon</span><strong>{{ authCounts.expiring }}</strong></div>
            <div><span>Expired</span><strong>{{ authCounts.expired }}</strong></div>
            <div><span>Due / missing</span><strong>{{ authCounts.missing }}</strong></div>
          </div>
          <div v-if="roiExpiryLabel" class="rco-expire">
            <strong>School ROI</strong>
            <span>{{ roiExpiryLabel }}</span>
          </div>
        </section>
      </div>

      <div class="rco-col">
        <section v-if="canViewBilling" class="rco-card">
          <div class="rco-card__row">
            <h4>Billing &amp; claims</h4>
            <button type="button" class="rco-link" @click="$emit('navigate', 'billing')">View claims</button>
          </div>
          <div class="rco-auth-counts">
            <div><span>Ready to bill</span><strong>{{ claimCounts.ready }}</strong></div>
            <div><span>Submitted</span><strong>{{ claimCounts.submitted }}</strong></div>
            <div><span>Denied</span><strong>{{ claimCounts.denied }}</strong></div>
            <div><span>Paid</span><strong>{{ claimCounts.paid }}</strong></div>
            <div><span>Needs correction</span><strong>{{ claimCounts.correction }}</strong></div>
          </div>
          <h5 class="rco-mini">Recent claims</h5>
          <div v-if="!encounters.length" class="muted tiny">No claims on file.</div>
          <ul v-else class="rco-list">
            <li v-for="enc in encounters.slice(0, 5)" :key="enc.id">
              <div>
                <strong>{{ enc.cpt_code || enc.procedure_code || 'Claim' }}</strong>
                <div class="muted tiny">{{ formatDate(enc.service_date) }}</div>
              </div>
              <span class="rco-badge" :class="claimBadge(enc)">{{ claimStatus(enc) }}</span>
              <span class="tiny">{{ formatMoney(enc) }}</span>
            </li>
          </ul>
        </section>

        <section class="rco-card">
          <h4>Open tasks</h4>
          <div v-if="!taskItems.length" class="muted tiny">No open chart tasks flagged.</div>
          <ul v-else class="rco-list">
            <li v-for="task in taskItems" :key="task.id">
              <button type="button" class="rco-task" @click="$emit('alert-click', task)">
                <strong>{{ task.label }}</strong>
                <span v-if="task.due" class="rco-due">{{ task.due }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../../services/api';
import '../../../styles/client-hub.css';
import { buildNoteAidQuery, treatmentPlanUpdaterQuery } from '../../../utils/noteAidLaunch.js';

const AUTH_KINDS = new Set([
  'smart_roi',
  'disclosure',
  'hipaa_notice',
  'informed_group_consent',
  'policy_services'
]);

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null },
  canViewBilling: { type: Boolean, default: false },
  canManageSchoolRoi: { type: Boolean, default: false },
  packagesEnabled: { type: Boolean, default: false },
  phiBanner: { type: Boolean, default: false },
  unsignedNotesCount: { type: Number, default: 0 },
  alerts: { type: Array, default: () => [] }
});

defineEmits(['navigate', 'navigate-secondary', 'open-document', 'alert-click']);
const router = useRouter();
const route = useRoute();

const loading = ref(false);
const error = ref('');
const notes = ref([]);
const plans = ref([]);
const sessions = ref([]);
const artifacts = ref([]);
const encounters = ref([]);
const lastLoadedAt = ref(null);

const docRows = computed(() => (artifacts.value || []).filter((a) => !a.missing).slice(0, 5));
const authArtifacts = computed(() =>
  (artifacts.value || []).filter((a) => AUTH_KINDS.has(String(a.kind || '').toLowerCase()))
);

const activePlanCount = computed(() =>
  (plans.value || []).filter((p) => String(p.status || '').toLowerCase().includes('active') || !p.status).length
);

const unsignedCount = computed(() => {
  const fromNotes = (notes.value || []).filter((n) => !n.provider_signed_at).length;
  return Math.max(Number(props.unsignedNotesCount || 0), fromNotes);
});

const claimStatus = (enc) => String(enc?.claim_status || enc?.status || enc?.billing_status || 'Open').replace(/_/g, ' ');

function claimBucket(enc) {
  const s = claimStatus(enc).toLowerCase();
  if (s.includes('paid')) return 'paid';
  if (s.includes('denied') || s.includes('reject')) return 'denied';
  if (s.includes('correct') || s.includes('hold') || s.includes('error')) return 'correction';
  if (s.includes('submit')) return 'submitted';
  return 'ready';
}

const claimCounts = computed(() => {
  const counts = { ready: 0, submitted: 0, denied: 0, paid: 0, correction: 0 };
  for (const enc of encounters.value || []) counts[claimBucket(enc)] += 1;
  return counts;
});

const claimsAttentionCount = computed(() => claimCounts.value.denied + claimCounts.value.correction);

const authCounts = computed(() => {
  const onFile = authArtifacts.value.filter((a) => !a.missing).length;
  const missing = authArtifacts.value.filter((a) => a.missing).length;
  const exp = roiDays.value;
  return {
    active: onFile,
    expiring: exp != null && exp >= 0 && exp < 30 ? 1 : 0,
    expired: exp != null && exp < 0 ? 1 : 0,
    missing
  };
});

const roiDays = computed(() => {
  const raw = props.client?.roi_expires_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
});

const roiExpiryLabel = computed(() => {
  const days = roiDays.value;
  if (days == null) return '';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days} days`;
});

const taskItems = computed(() => (props.alerts || []).slice(0, 5));
const openTaskCount = computed(() => taskItems.value.length + unsignedCount.value);

const lastUpdatedLabel = computed(() => {
  if (!lastLoadedAt.value) return '—';
  try {
    return lastLoadedAt.value.toLocaleString();
  } catch {
    return '—';
  }
});

const activityRows = computed(() => {
  const latestNote = notes.value[0]?.created_at || notes.value[0]?.updated_at;
  const latestPlan = plans.value[0]?.updated_at || plans.value[0]?.created_at;
  const latestDoc = docRows.value[0]?.signedAt || docRows.value[0]?.uploadedAt;
  const latestClaim = encounters.value[0]?.service_date || encounters.value[0]?.updated_at;
  return [
    {
      id: 'notes',
      label: 'Progress notes',
      status: notes.value.length ? 'On file' : 'None yet',
      badgeClass: notes.value.length ? 'rco-badge--ok' : 'rco-badge--muted',
      count: notes.value.length,
      updated: formatWhen(latestNote),
      nav: 'clinical-notes'
    },
    {
      id: 'plans',
      label: 'Treatment plans',
      status: activePlanCount.value ? 'Active' : 'None yet',
      badgeClass: activePlanCount.value ? 'rco-badge--ok' : 'rco-badge--muted',
      count: plans.value.length,
      updated: formatWhen(latestPlan),
      nav: 'treatment-plans'
    },
    {
      id: 'assess',
      label: 'Assessments',
      status: 'Open',
      badgeClass: 'rco-badge--info',
      count: '—',
      updated: '—',
      nav: 'assessments'
    },
    {
      id: 'intake',
      label: 'Intake & consents',
      status: authCounts.value.active ? 'On file' : 'Due',
      badgeClass: authCounts.value.active ? 'rco-badge--ok' : 'rco-badge--warn',
      count: authCounts.value.active,
      updated: formatWhen(latestDoc),
      nav: 'authorizations'
    },
    {
      id: 'docs',
      label: 'External records',
      status: docRows.value.length ? 'On file' : 'None yet',
      badgeClass: docRows.value.length ? 'rco-badge--ok' : 'rco-badge--muted',
      count: docRows.value.length,
      updated: formatWhen(latestDoc),
      nav: 'documents'
    },
    {
      id: 'claims',
      label: 'Billing & claims',
      status: claimsAttentionCount.value ? 'Needs attention' : (encounters.value.length ? 'Current' : 'None yet'),
      badgeClass: claimsAttentionCount.value ? 'rco-badge--warn' : (encounters.value.length ? 'rco-badge--ok' : 'rco-badge--muted'),
      count: encounters.value.length,
      updated: formatDate(latestClaim),
      nav: 'billing'
    }
  ];
});

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

function formatMoney(enc) {
  const n = Number(enc?.billed_amount || enc?.amount || enc?.charge_amount || enc?.paid_amount || 0);
  if (!n) return '';
  return `$${n.toFixed(2)}`;
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('active') || s.includes('final')) return 'rco-badge--ok';
  if (s.includes('draft')) return 'rco-badge--warn';
  return 'rco-badge--info';
}

function noteStatus(note) {
  if (note?.supervisor_cosigned_at) return 'Signed';
  if (note?.provider_signed_at) return 'Signed';
  return 'Draft';
}

function noteBadge(note) {
  return note?.provider_signed_at ? 'rco-badge--ok' : 'rco-badge--warn';
}

function claimBadge(enc) {
  const b = claimBucket(enc);
  if (b === 'paid') return 'rco-badge--ok';
  if (b === 'denied') return 'rco-badge--bad';
  if (b === 'correction') return 'rco-badge--warn';
  if (b === 'submitted') return 'rco-badge--info';
  return 'rco-badge--muted';
}

function openNoteAid(extra = {}) {
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const path = orgSlug ? `/${orgSlug}/admin/note-aid` : '/admin/note-aid';
  const isUpdater =
    String(extra.launchIntent || '').includes('treatment_plan')
    || String(extra.noteAid || '').includes('psychotherapy_plan');

  let query;
  if (isUpdater) {
    query = treatmentPlanUpdaterQuery(props.clientId, extra);
  } else {
    const latestSession = (sessions.value || [])[0] || null;
    const latestEncounter = (encounters.value || []).find((e) => Number(e?.clinical_session_id || 0) > 0)
      || (encounters.value || [])[0]
      || null;
    query = buildNoteAidQuery({
      clientId: props.clientId,
      clinicalSessionId: latestSession?.id || latestEncounter?.clinical_session_id || undefined,
      officeEventId: latestSession?.office_event_id || latestEncounter?.office_event_id || undefined,
      dateOfService: latestEncounter?.service_date || latestSession?.scheduled_start_at || undefined,
      serviceCode: latestEncounter?.service_code || latestEncounter?.cpt_code || undefined,
      noteType: 'PROGRESS_NOTE',
      templateVersion: 'v1',
      launchIntent: 'progress_note',
      ...extra
    });
  }
  router.push({ path, query }).catch(() => {});
}

async function load() {
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const jobs = [
      api.get(`/phi-documents/clients/${clientId}/chart-artifacts`, { skipGlobalLoading: true })
        .then((r) => { artifacts.value = Array.isArray(r.data?.artifacts) ? r.data.artifacts : []; })
        .catch(() => { artifacts.value = []; })
    ];
    if (agencyId) {
      jobs.push(
        api.get(`/medical-billing/clients/${clientId}/chart`, {
          params: { agencyId },
          skipGlobalLoading: true
        }).then((r) => {
          notes.value = Array.isArray(r.data?.notes) ? r.data.notes : [];
          plans.value = Array.isArray(r.data?.plans) ? r.data.plans : [];
          sessions.value = Array.isArray(r.data?.sessions) ? r.data.sessions : [];
          encounters.value = Array.isArray(r.data?.billingEncounters) ? r.data.billingEncounters : [];
        }).catch(() => {
          notes.value = [];
          plans.value = [];
          sessions.value = [];
          encounters.value = [];
        })
      );
    }
    await Promise.all(jobs);
    lastLoadedAt.value = new Date();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to load record center.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], load);
</script>

<style scoped>
.rco { display: flex; flex-direction: column; gap: 16px; }
.rco-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.rco-title {
  margin: 0;
  font-family: var(--font-display, var(--font-header));
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary, #0f172a);
}
.rco-sub { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
.rco-head-actions { display: flex; gap: 8px; align-items: center; }
.rco-more { position: relative; }
.rco-more summary {
  list-style: none;
  cursor: pointer;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 6px 10px;
  font-weight: 800;
  background: var(--bg-card, #fff);
}
.rco-more summary::-webkit-details-marker { display: none; }
.rco-more__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 180px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 6px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}
.rco-more__menu button {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.rco-more__menu button:hover { background: var(--bg-alt, #f8fafc); }
.rco-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.rco-metric {
  text-align: left;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  color: inherit;
}
.rco-metric--static { cursor: default; }
.rco-metric__k {
  display: block;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.rco-metric__v {
  display: block;
  margin-top: 6px;
  font-size: 22px;
  font-weight: 800;
}
.rco-metric__v--sm { font-size: 13px; line-height: 1.3; }
.rco-metric__l {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--primary, #166534);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.rco-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
.rco-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rco-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 14px;
}
.rco-card h4 { margin: 0 0 10px; font-size: 15px; font-weight: 800; }
.rco-card__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.rco-card__row h4 { margin: 0; }
.rco-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rco-table th, .rco-table td {
  text-align: left;
  padding: 7px 4px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  vertical-align: top;
}
.rco-table th { color: var(--text-secondary); font-weight: 650; }
.rco-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rco-list li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.rco-link {
  border: 0;
  background: none;
  color: var(--primary, #166534);
  cursor: pointer;
  padding: 0;
  font-weight: 650;
  font-size: 12px;
}
.rco-badge {
  display: inline-flex;
  align-items: center;
  text-transform: capitalize;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}
.rco-badge--ok { background: #dcfce7; color: #166534; }
.rco-badge--warn { background: #fef3c7; color: #92400e; }
.rco-badge--info { background: #dbeafe; color: #1d4ed8; }
.rco-badge--bad { background: #fee2e2; color: #b91c1c; }
.rco-badge--muted { background: #f1f5f9; color: #64748b; }
.rco-auth-counts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.rco-auth-counts div {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 8px 10px;
}
.rco-auth-counts span { display: block; font-size: 11px; color: var(--text-secondary); }
.rco-expire {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
}
.rco-note-aid { background: color-mix(in srgb, var(--primary, #166534) 6%, var(--bg-card, #fff)); }
.rco-note-aid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-top: 8px;
}
.rco-dots { margin: 0 0 12px; padding-left: 18px; color: var(--text-secondary); font-size: 13px; }
.rco-mini { margin: 12px 0 6px; font-size: 12px; }
.rco-task {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0;
  grid-column: 1 / -1;
}
.rco-due { color: #c2410c; font-size: 12px; font-weight: 700; }
@media (max-width: 1100px) {
  .rco-grid { grid-template-columns: 1fr; }
}
</style>
