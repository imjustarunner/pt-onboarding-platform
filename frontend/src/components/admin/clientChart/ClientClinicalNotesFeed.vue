<template>
  <div class="ccnf" :class="{ 'ccnf--learning': isLearning }">
    <header class="ccnf-head">
      <div>
        <h3 class="ccnf-title">{{ isLearning ? 'Learning notes' : 'Notes' }}</h3>
        <p class="ccnf-sub">
          {{
            isLearning
              ? 'Session and contact notes for this student — newest first.'
              : 'Running list of intake, progress, treatment plans, and drafts — newest first.'
          }}
        </p>
      </div>
      <div class="ccnf-filters">
        <select v-model="kindFilter" class="ccnf-select" aria-label="Filter note type">
          <option value="all">All types</option>
          <option value="progress">Progress / session</option>
          <option value="intake">Intake</option>
          <option value="plan">Treatment plan</option>
          <option value="draft">Note Aid drafts</option>
          <option v-if="!isLearning" value="contact">Contact</option>
        </select>
      </div>
    </header>

    <div v-if="loading" class="ccnf-muted">Loading notes…</div>
    <div v-else-if="error" class="ccnf-error">{{ error }}</div>
    <div v-else-if="!filteredRows.length" class="ccnf-muted">
      No notes on file yet. Start one in Note Aid or finalize an intake.
    </div>

    <ul v-else class="ccnf-list" role="list">
      <li
        v-for="row in filteredRows"
        :key="row.key"
        class="ccnf-row"
        :class="[
          `ccnf-row--${row.kind}`,
          {
            'is-active-plan': row.isActivePlan,
            'is-session': row.linkedSession,
            'is-claim': row.linkedClaim,
            'is-draft': row.status === 'draft' || row.status === 'started',
            'is-awaiting-cosign': row.awaitingCosign
          }
        ]"
      >
        <button type="button" class="ccnf-row-open" @click="openRow(row)">
          <div class="ccnf-row-top">
            <strong>{{ row.title }}</strong>
            <span class="ccnf-badge" :class="`ccnf-badge--${row.status}`">{{ row.statusLabel }}</span>
          </div>
          <div class="ccnf-row-meta">
            <span>{{ row.dateLabel }}</span>
            <span v-if="row.serviceCode" class="mono"> · {{ row.serviceCode }}</span>
            <span v-if="row.author"> · {{ row.author }}</span>
          </div>
          <div class="ccnf-row-tags">
            <span v-if="row.linkedSession" class="ccnf-tag ccnf-tag--session">Scheduled session</span>
            <span v-if="row.linkedClaim" class="ccnf-tag ccnf-tag--claim">
              {{ isLearning ? 'Billing / self-pay' : 'Medical claim' }}
            </span>
            <span v-else-if="row.kind === 'progress' && !row.linkedSession" class="ccnf-tag">Standalone</span>
            <span v-if="row.awaitingCosign" class="ccnf-tag ccnf-tag--cosign">Awaiting supervisor</span>
            <span v-if="row.providerSigned && !row.awaitingCosign && !row.supervisorSigned" class="ccnf-tag">
              Provider signed
            </span>
            <span v-if="row.isActivePlan" class="ccnf-tag ccnf-tag--active">Active plan</span>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  clientType: { type: String, default: 'clinical' },
  organizationSlug: { type: String, default: '' }
});

const emit = defineEmits(['navigate']);

const router = useRouter();
const loading = ref(false);
const error = ref('');
const kindFilter = ref('all');
const chart = ref({
  notes: [],
  plans: [],
  noteAidDrafts: [],
  intakeNotes: [],
  billingEncounters: [],
  sessions: [],
  diagnoses: []
});

const isLearning = computed(() => String(props.clientType || '').toLowerCase() === 'learning');

function formatDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(raw).slice(0, 10);
  }
}

function noteAidPath(query = {}) {
  const slug = String(props.organizationSlug || '').trim();
  const base = slug ? `/${slug}/admin/note-aid` : '/admin/note-aid';
  const qs = new URLSearchParams(query).toString();
  return qs ? `${base}?${qs}` : base;
}

const claimNoteIds = computed(() => {
  const set = new Set();
  for (const enc of chart.value.billingEncounters || []) {
    const nid = Number(enc.clinical_note_id || enc.note_id || 0);
    if (nid) set.add(nid);
  }
  return set;
});

const sessionIds = computed(() => {
  const set = new Set();
  for (const s of chart.value.sessions || []) {
    const id = Number(s.id || 0);
    if (id) set.add(id);
  }
  return set;
});

const rows = computed(() => {
  const out = [];
  const activePlanId = Number(chart.value.plans?.[0]?.id || 0);

  for (const d of chart.value.noteAidDrafts || []) {
    const hasOut = !!d.has_output;
    out.push({
      key: `draft-${d.id}`,
      kind: 'draft',
      title: `Note Aid draft${d.service_code ? ` (${d.service_code})` : ''}`,
      status: hasOut ? 'completed' : 'draft',
      statusLabel: hasOut ? 'Draft · generated' : 'Draft · in progress',
      dateLabel: formatDate(d.date_of_service || d.created_at),
      sortAt: d.updated_at || d.created_at,
      serviceCode: d.service_code || '',
      author: d.author_name || '',
      linkedSession: !!(d.office_event_id || d.clinical_session_id),
      linkedClaim: false,
      awaitingCosign: false,
      providerSigned: false,
      supervisorSigned: false,
      isActivePlan: false,
      draftId: d.id,
      openMode: 'note-aid-draft'
    });
  }

  for (const n of chart.value.notes || []) {
    const providerSigned = !!n.provider_signed_at;
    const supervisorSigned = !!n.supervisor_cosigned_at;
    const awaitingCosign = providerSigned && !supervisorSigned;
    let status = 'completed';
    let statusLabel = 'Completed';
    if (!providerSigned) {
      status = 'unsigned';
      statusLabel = 'Unsigned';
    } else if (awaitingCosign) {
      status = 'awaiting_cosign';
      statusLabel = 'Awaiting supervisor';
    } else if (supervisorSigned) {
      status = 'signed';
      statusLabel = 'Signed';
    }
    const sid = Number(n.clinical_session_id || 0);
    out.push({
      key: `note-${n.id}`,
      kind: String(n.note_type || '').toLowerCase().includes('intake') ? 'intake' : 'progress',
      title: n.title || 'Clinical note',
      status,
      statusLabel,
      dateLabel: formatDate(n.created_at),
      sortAt: n.updated_at || n.created_at,
      serviceCode: '',
      author: '',
      linkedSession: sid > 0 && sessionIds.value.has(sid),
      linkedClaim: claimNoteIds.value.has(Number(n.id)),
      awaitingCosign,
      providerSigned,
      supervisorSigned,
      isActivePlan: false,
      clinicalNoteId: n.id,
      openMode: 'clinical-note'
    });
  }

  for (const inn of chart.value.intakeNotes || []) {
    const final = String(inn.status || '') === 'final';
    out.push({
      key: `intake-${inn.id}`,
      kind: 'intake',
      title: `Intake note (${inn.service_code || '90791'})`,
      status: final ? 'signed' : inn.status || 'draft',
      statusLabel: final ? 'Finalized' : String(inn.status || 'Draft'),
      dateLabel: formatDate(inn.finalized_at || inn.updated_at || inn.created_at),
      sortAt: inn.finalized_at || inn.updated_at || inn.created_at,
      serviceCode: inn.service_code || '',
      author: '',
      linkedSession: false,
      linkedClaim: false,
      awaitingCosign: false,
      providerSigned: final,
      supervisorSigned: false,
      isActivePlan: false,
      openMode: 'intake-chart'
    });
  }

  for (const p of chart.value.plans || []) {
    const id = Number(p.id || 0);
    out.push({
      key: `plan-${id}`,
      kind: 'plan',
      title: p.title || (isLearning.value ? 'Learning plan' : 'Treatment plan'),
      status: String(p.status || 'active'),
      statusLabel: String(p.status || 'active'),
      dateLabel: formatDate(p.effective_date || p.created_at),
      sortAt: p.updated_at || p.created_at,
      serviceCode: '',
      author: '',
      linkedSession: false,
      linkedClaim: false,
      awaitingCosign: false,
      providerSigned: false,
      supervisorSigned: false,
      isActivePlan: id === activePlanId,
      planId: id,
      openMode: 'treatment-plan'
    });
  }

  out.sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
  return out;
});

const filteredRows = computed(() => {
  if (kindFilter.value === 'all') return rows.value;
  return rows.value.filter((r) => r.kind === kindFilter.value);
});

async function load() {
  const cid = Number(props.clientId || 0);
  const aid = Number(props.agencyId || 0);
  if (!cid || !aid) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/medical-billing/clients/${cid}/chart`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    chart.value = {
      notes: res?.data?.notes || [],
      plans: res?.data?.plans || [],
      noteAidDrafts: res?.data?.noteAidDrafts || [],
      intakeNotes: res?.data?.intakeNotes || [],
      billingEncounters: res?.data?.billingEncounters || [],
      sessions: res?.data?.sessions || [],
      diagnoses: res?.data?.diagnoses || []
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load notes';
  } finally {
    loading.value = false;
  }
}

function openRow(row) {
  if (!row) return;
  if (row.openMode === 'note-aid-draft') {
    const url = noteAidPath({
      clientId: String(props.clientId),
      draftId: String(row.draftId)
    });
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (row.openMode === 'intake-chart') {
    emit('navigate', 'intake-note');
    return;
  }
  if (row.openMode === 'treatment-plan') {
    emit('navigate', 'treatment-plans');
    return;
  }
  if (row.openMode === 'clinical-note') {
    const url = noteAidPath({
      clientId: String(props.clientId),
      clinicalNoteId: String(row.clinicalNoteId || '')
    });
    window.open(url, '_blank', 'noopener');
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], load);

defineExpose({ reload: load, diagnoses: computed(() => chart.value.diagnoses) });
</script>

<style scoped>
.ccnf {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ccnf--learning {
  border-color: #bbf7d0;
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 40%);
}
.ccnf-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  align-items: flex-start;
}
.ccnf-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.ccnf-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.82rem;
}
.ccnf-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  background: #fff;
}
.ccnf-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ccnf-row {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  overflow: hidden;
}
.ccnf-row.is-active-plan {
  border-color: #0f766e;
  box-shadow: 0 0 0 1px #99f6e4;
}
.ccnf-row.is-session {
  border-left: 4px solid #0f766e;
}
.ccnf-row.is-claim {
  border-left: 4px solid #4338ca;
}
.ccnf-row.is-draft {
  border-left: 4px solid #b45309;
}
.ccnf-row.is-awaiting-cosign {
  border-left: 4px solid #c2410c;
}
.ccnf-row-open {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ccnf-row-open:hover {
  background: #f1f5f9;
}
.ccnf-row-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.ccnf-row-meta {
  margin-top: 4px;
  font-size: 0.8rem;
  color: #64748b;
}
.ccnf-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ccnf-badge {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
}
.ccnf-badge--draft,
.ccnf-badge--started { background: #ffedd5; color: #9a3412; }
.ccnf-badge--completed,
.ccnf-badge--unsigned { background: #e0f2fe; color: #075985; }
.ccnf-badge--awaiting_cosign { background: #ffedd5; color: #c2410c; }
.ccnf-badge--signed,
.ccnf-badge--final,
.ccnf-badge--active { background: #d1fae5; color: #065f46; }
.ccnf-tag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #e2e8f0;
  color: #475569;
}
.ccnf-tag--session { background: #ccfbf1; color: #0f766e; }
.ccnf-tag--claim { background: #e0e7ff; color: #3730a3; }
.ccnf-tag--cosign { background: #ffedd5; color: #c2410c; }
.ccnf-tag--active { background: #ccfbf1; color: #0d5f59; }
.ccnf-muted { color: #64748b; font-size: 0.88rem; padding: 8px 0; }
.ccnf-error { color: #b91c1c; font-size: 0.88rem; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
