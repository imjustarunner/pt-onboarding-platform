<template>
  <div class="ccnf" :class="{ 'ccnf--learning': isLearning }">
    <header class="ccnf-head">
      <div>
        <h3 class="ccnf-title">{{ isLearning ? 'Learning notes' : 'Notes' }}</h3>
        <p v-if="!workspace" class="ccnf-sub">
          {{
            isLearning
              ? 'Session and contact notes for this student — newest first.'
              : 'All clinical notes on file (including contact and canceled) — newest first. Documents live under Documents.'
          }}
        </p>
      </div>
      <div v-if="!workspace" class="ccnf-head-actions">
        <button type="button" class="ccnf-write-btn" @click="startNewNoteInProfile">
          Write note
        </button>
        <div class="ccnf-filters">
          <select v-model="kindFilter" class="ccnf-select" aria-label="Filter note type">
            <option value="all">All types</option>
            <option value="progress">Progress / session</option>
            <option value="intake">Intake</option>
            <option value="plan">{{ isLearning ? 'Learning progress' : 'Treatment progress' }}</option>
            <option v-if="!isLearning" value="contact">Contact</option>
            <option v-if="!isLearning" value="termination">Termination</option>
          </select>
        </div>
      </div>
    </header>

    <div v-if="workspace" class="ccnf-workspace">
      <header class="ccnf-workspace-bar">
        <button type="button" class="ccnf-back" @click="closeWorkspace">← Notes list</button>
        <span>{{ workspaceTitle }}</span>
        <a
          v-if="workspace.mode === 'write' || workspace.mode === 'view'"
          class="ccnf-full-aid"
          :href="fullNoteAidHref"
          target="_blank"
          rel="noopener"
        >Open in Note Aid</a>
      </header>

      <ClientNoteTypePicker
        v-if="workspace.mode === 'pick-type'"
        :is-learning="isLearning"
        @select="onNoteTypeSelected"
      />

      <div v-else-if="workspace.mode === 'treatment-plan-choice'" class="ccnf-plan-choice">
        <h3>Treatment plan</h3>
        <p>Write a new plan from scratch, or update the current plan with AI suggestions you review before applying.</p>
        <div class="ccnf-plan-actions">
          <button type="button" class="ccnf-write-btn" @click="openNoteAid({ kind: 'plan', launchIntent: 'new_treatment_plan' })">
            Write new from scratch
          </button>
          <button type="button" class="ccnf-write-btn secondary" @click="openNoteAid({ kind: 'plan', launchIntent: 'update_treatment_plan' })">
            Update current plan
          </button>
        </div>
      </div>

      <ClientManualNoteForm
        v-else-if="workspace.mode === 'manual'"
        :client-id="clientId"
        :agency-id="agencyId"
        :note-kind="workspace.noteKind || 'contact'"
        @cancel="closeWorkspace"
        @saved="onManualNoteSaved"
      />

      <div v-else-if="workspace.mode === 'appointment-change-pick'" class="ccnf-plan-choice">
        <h3>Missed / canceled appointment</h3>
        <p>Select the session this change applies to. The 15-second workflow will classify timing, consequence, and generate the note.</p>
        <p v-if="!recentAppointments.length" class="muted">
          No recent appointments found for this client. Open the schedule, select the appointment, and use <strong>Change appointment…</strong>.
        </p>
        <ul v-else class="ccnf-appt-pick">
          <li v-for="a in recentAppointments" :key="a.id">
            <button type="button" class="ccnf-write-btn" @click="openAppointmentChangeFor(a)">
              {{ a.label }}
            </button>
          </li>
        </ul>
      </div>

      <ClientChartCompletedNote
        v-else-if="workspace.mode === 'view'"
        :note-id="workspace.clinicalNoteId"
        :agency-id="agencyId"
      />
      <ClinicalNoteGeneratorView
        v-else
        :key="workspaceKey"
        embedded
        :embed-draft-id="workspace.draftId"
        :embed-clinical-note-id="workspace.clinicalNoteId"
        :embed-client-id="clientId"
        :embed-agency-id="agencyId"
        :embed-open-library="workspace.openLibrary !== false"
        :embed-initial-kind="workspace.initialKind || ''"
        :embed-launch-intent="workspace.launchIntent || ''"
      />
    </div>

    <template v-else>
    <div v-if="loading" class="ccnf-muted">Loading notes…</div>
    <div v-else-if="error" class="ccnf-error">{{ error }}</div>
    <div v-else-if="!filteredRows.length" class="ccnf-muted">
      No notes on file yet.
      <button type="button" class="ccnf-text-link" @click="startNewNoteInProfile">Write a note</button>
      or finalize an intake.
    </div>

    <ul v-else class="ccnf-list" role="list">
      <li
        v-for="row in filteredRows"
        :key="row.key"
        class="ccnf-row"
        :class="[
          `ccnf-row--${row.kind}`,
          `ccnf-row--tone-${row.tone}`,
          row.codeTone ? `ccnf-row--code-${row.codeTone}` : '',
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
          <div class="ccnf-line">
            <strong class="ccnf-line-title">{{ row.title }}</strong>
            <span class="ccnf-line-meta">{{ row.dateLabel }}</span>
            <span v-if="row.serviceCode" class="ccnf-line-meta mono">{{ row.serviceCode }}</span>
            <span v-if="row.author" class="ccnf-line-meta">{{ row.author }}</span>
            <span v-if="row.isActivePlan" class="ccnf-tag ccnf-tag--active">Active plan</span>
            <span v-if="row.awaitingCosign" class="ccnf-tag ccnf-tag--cosign">Awaiting supervisor</span>
            <span v-if="row.linkedClaim" class="ccnf-tag ccnf-tag--claim">{{ isLearning ? 'Billed' : 'Claim' }}</span>
            <span
              v-if="!row.awaitingCosign && !row.isActivePlan"
              class="ccnf-badge"
              :class="`ccnf-badge--${row.status}`"
            >{{ row.statusLabel }}</span>
          </div>
        </button>
        <div v-if="isLearning && canCreateSelfPay(row)" class="ccnf-row-actions">
          <button
            type="button"
            class="ccnf-action-btn"
            :disabled="selfPayBusyKey === row.key"
            @click.stop="createSelfPayCharge(row)"
          >
            {{ selfPayBusyKey === row.key ? 'Creating…' : 'Create self-pay charge' }}
          </button>
        </div>
      </li>
    </ul>
    </template>

    <AppointmentChangeWizard
      :change="appointmentChange"
      @completed="onAppointmentChangeDone"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import api from '../../../services/api.js';
import ClientChartCompletedNote from './ClientChartCompletedNote.vue';
import ClientNoteTypePicker from './ClientNoteTypePicker.vue';
import ClientManualNoteForm from './ClientManualNoteForm.vue';
import AppointmentChangeWizard from '../../schedule/AppointmentChangeWizard.vue';
import { useAppointmentChange } from '../../../composables/useAppointmentChange.js';

const ClinicalNoteGeneratorView = defineAsyncComponent(() =>
  import('../../../views/admin/ClinicalNoteGeneratorView.vue')
);

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  clientType: { type: String, default: 'clinical' },
  organizationSlug: { type: String, default: '' }
});

const emit = defineEmits(['navigate']);

const loading = ref(false);
const error = ref('');
const kindFilter = ref('all');
const workspace = ref(null);
const selfPayBusyKey = ref('');
const selfPayNoteIds = ref(new Set());
const recentAppointments = ref([]);
const appointmentChange = useAppointmentChange();
const chart = ref({
  notes: [],
  plans: [],
  noteAidDrafts: [],
  intakeNotes: [],
  billingEncounters: [],
  sessions: [],
  diagnoses: [],
  contactNotes: []
});

const isLearning = computed(() => String(props.clientType || '').toLowerCase() === 'learning');

function primaryServiceCode(raw) {
  const m = String(raw || '').toUpperCase().match(/\b(90\d{3}|H\d{4}|T\d{4}|G\d{4})\b/);
  return m ? m[1] : '';
}

function noteTone(kind, serviceCode, title = '') {
  const k = String(kind || '').toLowerCase();
  const code = primaryServiceCode(serviceCode);
  const t = String(title || '').toLowerCase();
  if (k === 'intake' || code === '90791' || code === 'H0031') return 'intake';
  if (k === 'plan' || code === 'H0032' || t.includes('treatment plan') || t.includes('learning plan')) return 'plan';
  if (k === 'contact') return 'contact';
  if (k === 'progress' || /^90\d{3}$/.test(code)) return 'progress';
  if (k === 'draft') {
    if (code === '90791' || code === 'H0031') return 'intake';
    if (code === 'H0032') return 'plan';
    if (code) return 'progress';
    return 'draft';
  }
  return k || 'other';
}

function progressCodeTone(serviceCode) {
  return primaryServiceCode(serviceCode) || 'default';
}

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

  // Note Aid in-progress drafts stay in the Note Aid library — not the client file.
  for (const n of chart.value.notes || []) {
    const providerSigned = !!n.provider_signed_at;
    const supervisorSigned = !!n.supervisor_cosigned_at;
    const reviewOnly = !!n.review_only
      || String(n.note_type || '').toUpperCase().includes('TERMINATION')
      || String(n.note_type || '').toUpperCase().includes('CONTACT')
      || String(n.title || '').toLowerCase().includes('termination');
    const reviewStatus = String(n.content_review_status || '').toLowerCase();
    const awaitingCosign = !reviewOnly && providerSigned && !supervisorSigned && !!n.needs_supervisor_cosign;
    let status = 'completed';
    let statusLabel = 'Completed';
    if (reviewOnly) {
      if (providerSigned) {
        status = 'signed';
        statusLabel = 'Reviewed · signed';
      } else if (reviewStatus === 'passed') {
        status = 'review_passed';
        statusLabel = 'Review passed';
      } else {
        status = 'review';
        statusLabel = 'Review';
      }
    } else if (!providerSigned) {
      status = 'unsigned';
      statusLabel = 'Unsigned';
    } else if (awaitingCosign) {
      status = 'awaiting_cosign';
      statusLabel = 'Awaiting supervisor';
    } else {
      status = 'signed';
      statusLabel = 'Signed';
    }
    const sid = Number(n.clinical_session_id || 0);
    const session = (chart.value.sessions || []).find((s) => Number(s.id) === sid);
    const serviceCode = n.session_service_code || n.service_code || session?.service_code || '';
    const nt = String(n.note_type || n.title || '').toLowerCase();
    let kind = 'progress';
    if (nt.includes('termination')) kind = 'termination';
    else if (nt.includes('treatment summary') || nt.includes('treatment_summary')) kind = 'summary';
    else if (nt.includes('intake')) kind = 'intake';
    else if (
      nt.includes('treatment plan')
      || nt.includes('learning plan')
      || nt.includes('plan development')
      || nt.includes('treatment progress')
    ) {
      kind = 'plan';
    } else if (nt.includes('contact')) kind = 'contact';
    else if (nt.includes('cancel') || nt.includes('missed') || nt.includes('no-show') || nt.includes('no show')) {
      kind = 'progress';
    }
    const cancelish = /cancel|missed|no-show|no show|appointment change/i.test(String(n.title || n.note_type || ''));
    out.push({
      key: `note-${n.id}`,
      kind: kind === 'summary' ? 'plan' : kind,
      tone: noteTone(kind === 'termination' || kind === 'summary' ? 'contact' : kind, serviceCode, n.title),
      codeTone: kind === 'progress' ? progressCodeTone(serviceCode) : '',
      title: n.title || 'Clinical note',
      status,
      statusLabel: cancelish
        ? (providerSigned ? 'Canceled · on file' : 'Canceled')
        : (kind === 'summary' && !supervisorSigned && providerSigned
          ? 'Awaiting supervisor'
          : statusLabel),
      dateLabel: formatDate(n.created_at),
      sortAt: n.updated_at || n.created_at,
      serviceCode,
      author: '',
      linkedSession: sid > 0 && sessionIds.value.has(sid),
      linkedClaim: claimNoteIds.value.has(Number(n.id)),
      awaitingCosign,
      providerSigned,
      supervisorSigned,
      isActivePlan: false,
      clinicalNoteId: n.id,
      hasSelfPayCharge: selfPayNoteIds.value.has(Number(n.id)),
      openMode: 'clinical-note'
    });
  }

  for (const cn of chart.value.contactNotes || []) {
    out.push({
      key: `contact-${cn.id}`,
      kind: 'contact',
      tone: 'contact',
      codeTone: '',
      title: 'Contact note',
      status: 'review_passed',
      statusLabel: 'Review',
      dateLabel: formatDate(cn.created_at),
      sortAt: cn.updated_at || cn.created_at,
      serviceCode: '',
      author: cn.author_name || '',
      linkedSession: false,
      linkedClaim: false,
      awaitingCosign: false,
      providerSigned: false,
      supervisorSigned: false,
      isActivePlan: false,
      contactNoteId: cn.id,
      contactPreview: String(cn.message || '').slice(0, 160),
      openMode: 'contact-note'
    });
  }

  for (const inn of chart.value.intakeNotes || []) {
    const final = String(inn.status || '') === 'final';
    out.push({
      key: `intake-${inn.id}`,
      kind: 'intake',
      tone: 'intake',
      codeTone: '',
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
    const status = String(p.status || 'active').toLowerCase();
    // Client-setup bootstrap drafts should not linger once cancelled/replaced.
    if (status === 'draft' && String(p.source_tool_id || '') === 'intake_packet_bootstrap') continue;
    if (status === 'superseded' || status === 'inactive') continue;
    out.push({
      key: `plan-${id}`,
      kind: 'plan',
      tone: 'plan',
      codeTone: '',
      title: p.title || (isLearning.value ? 'Learning plan' : 'Treatment plan'),
      status,
      statusLabel: status === 'draft' ? 'Draft plan' : String(p.status || 'active'),
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
      diagnoses: res?.data?.diagnoses || [],
      contactNotes: res?.data?.contactNotes || []
    };
    if (isLearning.value) {
      try {
        const ledgerRes = await api.get(`/learning-billing/clients/${cid}/ledger`, {
          params: { agencyId: aid },
          skipGlobalLoading: true
        });
        const next = new Set();
        for (const c of ledgerRes?.data?.ledger || []) {
          let meta = c.metadata_json;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch { meta = {}; }
          }
          const nid = Number(meta?.clinicalNoteId || 0);
          if (nid) next.add(nid);
        }
        selfPayNoteIds.value = next;
      } catch {
        selfPayNoteIds.value = new Set();
      }
    } else {
      selfPayNoteIds.value = new Set();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load notes';
  } finally {
    loading.value = false;
  }
}

function canCreateSelfPay(row) {
  if (!isLearning.value || !row) return false;
  if (row.kind !== 'progress' && row.kind !== 'draft') return false;
  if (!row.clinicalNoteId && !row.draftId) return false;
  if (row.hasSelfPayCharge) return false;
  // Prefer signed/completed progress notes; allow unsigned standalone tutoring notes too.
  return row.openMode === 'clinical-note' && !!row.clinicalNoteId;
}

async function createSelfPayCharge(row) {
  const cid = Number(props.clientId || 0);
  const aid = Number(props.agencyId || 0);
  if (!cid || !aid || !row?.clinicalNoteId) return;
  selfPayBusyKey.value = row.key;
  error.value = '';
  try {
    await api.post(`/learning-billing/clients/${cid}/self-pay-charges`, {
      agencyId: aid,
      clientId: cid,
      clinicalNoteId: row.clinicalNoteId,
      serviceType: 'CONSULTATION',
      serviceDate: String(row.sortAt || '').slice(0, 10) || undefined
    }, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not create self-pay charge';
  } finally {
    selfPayBusyKey.value = '';
  }
}

const fullNoteAidHref = computed(() => {
  const ws = workspace.value;
  if (!ws) return noteAidPath({ clientId: String(props.clientId), agencyId: String(props.agencyId || '') });
  if (ws.mode === 'view' && ws.clinicalNoteId) {
    return noteAidPath({
      clientId: String(props.clientId),
      clinicalNoteId: String(ws.clinicalNoteId),
      agencyId: String(props.agencyId || '')
    });
  }
  return noteAidPath({
    clientId: String(props.clientId),
    draftId: String(ws.draftId || ''),
    agencyId: String(props.agencyId || '')
  });
});

const workspaceTitle = computed(() => {
  const ws = workspace.value;
  if (!ws) return '';
  if (ws.mode === 'view') return 'Completed note';
  if (ws.mode === 'pick-type') return 'Write note';
  if (ws.mode === 'appointment-change-pick') return 'Missed appointment';
  if (ws.mode === 'treatment-plan-choice') return 'Treatment plan';
  if (ws.mode === 'manual') {
    if (ws.noteKind === 'consultation') return 'Consultation note';
    if (ws.noteKind === 'misc') return 'Miscellaneous note';
    return 'Contact note';
  }
  if (ws.isNew || !ws.draftId) return 'Write note';
  return 'Write this session note';
});

const workspaceKey = computed(() => {
  const ws = workspace.value;
  if (!ws) return 'none';
  if (ws.mode === 'view') return `view-${ws.clinicalNoteId || 0}`;
  if (ws.mode === 'pick-type') return 'pick-type';
  if (ws.mode === 'treatment-plan-choice') return 'tp-choice';
  if (ws.mode === 'manual') return `manual-${ws.noteKind || 'contact'}`;
  if (ws.draftId) return `draft-${ws.draftId}`;
  return `new-${ws.initialKind || 'aid'}-${ws.launchIntent || 'x'}-${props.clientId}`;
});

function closeWorkspace() {
  workspace.value = null;
}

function startNewNoteInProfile() {
  workspace.value = { mode: 'pick-type' };
}

function openNoteAid({ kind = '', launchIntent = '' } = {}) {
  workspace.value = {
    mode: 'write',
    draftId: null,
    clinicalNoteId: null,
    isNew: true,
    openLibrary: true,
    initialKind: kind || '',
    launchIntent: launchIntent || ''
  };
}

async function onNoteTypeSelected(opt) {
  if (!opt || opt.disabled) return;
  if (opt.path === 'manual-contact') {
    workspace.value = { mode: 'manual', noteKind: 'contact' };
    return;
  }
  if (opt.path === 'manual-misc') {
    workspace.value = { mode: 'manual', noteKind: 'misc' };
    return;
  }
  if (opt.path === 'manual-consultation') {
    workspace.value = { mode: 'manual', noteKind: 'consultation' };
    return;
  }
  if (opt.path === 'treatment-plan-choice') {
    workspace.value = { mode: 'treatment-plan-choice' };
    return;
  }
  if (opt.path === 'appointment-change') {
    await loadRecentAppointmentsForChange();
    workspace.value = { mode: 'appointment-change-pick' };
    return;
  }
  if (opt.path === 'note-aid') {
    openNoteAid({ kind: opt.kind || '', launchIntent: opt.launchIntent || '' });
  }
}

async function loadRecentAppointmentsForChange() {
  recentAppointments.value = [];
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid || !cid) return;
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 45);
    const windowStart = start.toISOString().slice(0, 10);
    const windowEnd = end.toISOString().slice(0, 10);
    const r = await api.get('/appointments', {
      params: { agencyId: aid, windowStart, windowEnd, clientId: cid },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(r.data?.appointments) ? r.data.appointments : [];
    recentAppointments.value = rows
      .filter((a) => !['voided', 'completed'].includes(String(a.status || '').toLowerCase()))
      .slice(0, 12)
      .map((a) => {
        const when = a.startAt || a.start_at;
        let label = when;
        try {
          label = new Date(String(when).includes('T') ? when : String(when).replace(' ', 'T')).toLocaleString();
        } catch { /* keep */ }
        return {
          id: Number(a.id),
          label: `${label} · ${a.title || a.status || 'Appointment'}`,
          startAt: when,
          title: a.title || ''
        };
      });
  } catch {
    recentAppointments.value = [];
  }
}

function openAppointmentChangeFor(a) {
  appointmentChange.openWizard({
    appointmentId: a.id,
    context: {
      clientId: Number(props.clientId),
      clientName: '',
      serviceLabel: a.title || 'Session',
      whenLabel: a.label,
      providerName: '',
      payerLabel: ''
    }
  });
}

async function onAppointmentChangeDone() {
  closeWorkspace();
  await load();
}

async function onManualNoteSaved() {
  closeWorkspace();
  await load();
}

function openRow(row) {
  if (!row) return;
  if (row.openMode === 'note-aid-draft') {
    workspace.value = { mode: 'write', draftId: row.draftId, clinicalNoteId: null };
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
  if (row.openMode === 'contact-note') {
    const preview = String(row.contactPreview || '').trim();
    window.alert(preview || 'Contact note (email chain) — open Messages for the full thread.');
    return;
  }
  if (row.openMode === 'clinical-note') {
    workspace.value = { mode: 'view', draftId: null, clinicalNoteId: row.clinicalNoteId };
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], load);

defineExpose({
  reload: load,
  closeWorkspace,
  isWorkspaceOpen: () => !!workspace.value,
  diagnoses: computed(() => chart.value.diagnoses)
});
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
.ccnf-workspace {
  border: 1px solid #ccfbf1;
  border-radius: 12px;
  background: #f8fafc;
  overflow: hidden;
}
.ccnf-workspace-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  font-size: 0.85rem;
  font-weight: 700;
}
.ccnf-back, .ccnf-full-aid {
  border: none;
  background: transparent;
  color: #0f766e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}
.ccnf-full-aid { margin-left: auto; }
.ccnf-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  align-items: flex-start;
}
.ccnf-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ccnf-write-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 12px;
  font: inherit;
  font-weight: 700;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
}
.ccnf-write-btn.secondary {
  background: #fff;
  color: #0f766e;
  border: 1px solid #99f6e4;
}
.ccnf-plan-choice {
  padding: 16px 18px 20px;
  max-width: 520px;
}
.ccnf-plan-choice h3 {
  margin: 0 0 6px;
  font-size: 1.05rem;
}
.ccnf-plan-choice p {
  margin: 0 0 14px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}
.ccnf-plan-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ccnf-appt-pick {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.ccnf-write-btn:hover {
  background: #0d9488;
}
.ccnf-write-btn.secondary:hover {
  background: #f0fdfa;
}
.ccnf-text-link {
  border: none;
  background: none;
  color: #0f766e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 0 2px;
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
  gap: 4px;
}
.ccnf-row {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
}
.ccnf-row--tone-intake {
  border-color: #99f6e4;
  border-left: 5px solid #0f766e;
  background: #f0fdfa;
}
.ccnf-row--tone-plan {
  border-color: #ddd6fe;
  border-left: 5px solid #6d28d9;
  background: #f5f3ff;
}
.ccnf-row--tone-contact {
  border-color: #d6d3d1;
  border-left: 5px solid #57534e;
  background: #fafaf9;
}
.ccnf-row--tone-draft {
  border-color: #fde68a;
  border-left: 5px solid #d97706;
  background: #fffbeb;
}
.ccnf-row--tone-progress {
  border-color: #bfdbfe;
  border-left: 5px solid #2563eb;
  background: #eff6ff;
}
.ccnf-row--tone-progress.ccnf-row--code-90832 {
  border-left-color: #93c5fd;
  background: #f8fbff;
}
.ccnf-row--tone-progress.ccnf-row--code-90834 {
  border-left-color: #3b82f6;
  background: #eff6ff;
}
.ccnf-row--tone-progress.ccnf-row--code-90837 {
  border-left-color: #1d4ed8;
  background: #dbeafe;
}
.ccnf-row--tone-progress.ccnf-row--code-90846,
.ccnf-row--tone-progress.ccnf-row--code-90847 {
  border-left-color: #1e3a8a;
  background: #e0e7ff;
}
.ccnf-row--tone-progress.ccnf-row--code-90853 {
  border-left-color: #0369a1;
  background: #e0f2fe;
}
.ccnf-row--tone-progress.ccnf-row--code-default {
  border-left-color: #60a5fa;
  background: #eff6ff;
}
.ccnf-row.is-active-plan {
  border-color: #6d28d9;
  box-shadow: 0 0 0 1px #ddd6fe;
}
.ccnf-row.is-awaiting-cosign {
  box-shadow: inset 0 0 0 1px #fdba74;
}
.ccnf-row-open {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ccnf-row-open:hover {
  background: rgba(15, 23, 42, 0.05);
}
.ccnf-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ccnf-line-title {
  font-size: 0.86rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
}
.ccnf-line-meta {
  color: #64748b;
  font-size: 0.78rem;
  white-space: nowrap;
  flex: 0 0 auto;
}
.ccnf-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 12px 10px;
}
.ccnf-action-btn {
  border: 1px solid #86efac;
  background: #ecfdf5;
  color: #166534;
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.ccnf-action-btn:disabled {
  opacity: 0.6;
  cursor: wait;
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
  margin-left: auto;
  flex-shrink: 0;
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
