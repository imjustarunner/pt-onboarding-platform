<template>
  <div class="cc-enc-tab">
    <section v-if="openedForm" aria-label="Filed clinical form">
      <button type="button" class="btn btn-secondary" @click="closeFiledForm">← Medical record</button>
      <SafetyPlansPanel ref="clinicalDocumentsRef" :key="openedForm.record_key" record-only
        :initial-record-id="openedForm.sourceId" :initial-version="openedForm.version" :client-id="clientId" :agency-id="agencyId" />
    </section>
    <section v-else-if="openedIntake" aria-label="Imported intake record"><button type="button" class="btn btn-secondary" @click="openedIntake=null">← Medical record</button><ClientIntakeNotePanel :key="openedIntake.intake_draft_id" :client-id="openedIntake.source_client_id || clientId" :initial-draft-id="openedIntake.intake_draft_id" :client="client" @removed="openedIntake=null;load()" /></section>
    <template v-else>
    <SchoolAbsenceRecords :client-id="clientId" />
    <nav v-if="clientId" class="medical-document-tabs" aria-label="Medical documents"><button v-for="tab in documentTabs" :key="tab.key" :aria-pressed="documentTab===tab.key" @click="selectDocumentTab(tab.key)">{{ tab.label }}</button></nav>
    <SafetyPlansPanel v-if="clientId&&documentTab==='clinical'" ref="clinicalDocumentsRef" :key="`safety:${clientId}`" :client-id="clientId" :agency-id="agencyId" />
    <section v-if="clientId&&documentTab==='paper'" class="paper-enrollment-upload"><h3>Full paper enrollment</h3><p>Upload the completed packet and any supporting pages to this client’s medical file. Staff review each authorization and optional communication choice before updating the record. Uploading a packet does not enable messaging campaigns or record consent automatically.</p><PhiDocumentsPanel :client-id="clientId" section="files" embedded default-document-type="full_paper_enrollment" /></section>
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Medical Record</h3>
        <p>
          Browse sessions, notes, treatment plans, assessments, documents, and chart communications by date.
        </p>
      </div>
      <div class="cc-enc-toolbar__actions">
        <ClinicalRecordDownloads :agency-id="agencyId" :client-id="clientId" :note-id="selectedRow?.clinical_note_id" :draft-id="selectedRow?.intake_draft_id" />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!sortedEncounters.length"
          @click="printRecord"
        >
          Print encounter list
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || history.loading.value" @click="load(); history.load()">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <p v-if="history.loading.value" role="status">Loading record history…</p>
    <p v-if="history.unavailable.value.length" role="status">Unavailable in this view · {{ history.unavailable.value.join(', ') }}</p>
    <p v-if="recordFileError" role="alert">{{ recordFileError }}</p>
    <p v-if="error" class="cc-enc-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading sessions…</p>
    <p v-else-if="!chronologicalRows.length && !history.loading.value" class="cc-enc-empty">
      No past sessions or other medical records are available for this client yet.
    </p>

    <div v-else class="cc-enc-timeline">
      <div class="cc-enc-timeline-filters">
        <div class="cc-enc-filters">
          <button
            v-for="f in filterOptions"
            :key="f.id"
            type="button"
            class="cc-enc-filter-pill"
            :class="{ 'cc-enc-filter-pill--active': listFilter === f.id }"
            @click="listFilter = f.id"
          >
            {{ f.label }}
          </button>
        </div>
        <label class="cc-enc-select">Entry type
          <select v-model="recordType"><option value="">All types</option><option v-for="type in entryTypes" :key="type">{{ type }}</option></select>
        </label>
        <label class="cc-enc-select">Sort by
          <select v-model="recordSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Entry type</option></select>
        </label>
        <input
          v-model="searchQuery"
          type="search"
          class="cc-enc-search"
          placeholder="Search title, code, provider, or diagnosis…"
          aria-label="Search medical records"
        />
      </div>
      <div class="cc-enc-timeline-list">
        <article v-for="row in filteredEncounters" :key="encounterKey(row)" class="cc-enc-timeline-entry">
          <button
            :aria-expanded="encounterKey(row) === selectedId"
            type="button"
            class="cc-enc-list-item"
            :class="{ 'cc-enc-list-item--active': encounterKey(row) === selectedId }"
            @click="toggleEncounter(row)"
          >
            <span class="timeline-date">{{ formatEncounterDate(row.service_date) }}</span>
            <span class="timeline-title">
              <strong>{{ row.historyKind ? row.title : formatEncounterProvider(row) }}</strong>
              <span v-if="row.respondent" class="muted">{{ row.respondent }}</span>
              <span v-else-if="!row.historyKind" class="muted">{{ row.service_code || '—' }}<span v-if="encounterScheduleLabel(row)"> · {{ encounterScheduleLabel(row) }}</span></span>
            </span>
            <span class="timeline-type">{{ recordKind(row) }}</span>
            <span v-if="row.historyKind" class="timeline-status">{{ row.recordStatus || '' }}</span>
            <span v-else class="cc-enc-note-pill timeline-status" :class="noteStatusClass(row)">{{ noteStatusLabel(row) }}</span>
          </button>
          <template v-if="encounterKey(row) === selectedId">
      <section v-if="selectedRow?.historyKind" class="cc-enc-detail-panel">
        <h3>{{ selectedRow.title }}</h3><p>{{ selectedRow.historyKind }} · {{ formatEncounterDate(selectedRow.service_date) }}</p>
        <button type="button" class="btn btn-secondary" @click="openHistoryEntry(selectedRow)">Open {{ selectedRow.historyKind.toLowerCase() }}</button>
        <button v-if="['assessment','conversation','message'].includes(selectedRow.action)" type="button" class="btn btn-secondary" @click="downloadEntry(selectedRow)">Download this record</button>
        <ClinicalRecordDownloads v-if="selectedRow.action==='plan'" :agency-id="agencyId" :client-id="clientId" :plan-id="selectedRow.sourceId" />
      </section>
      <section v-else-if="selectedRow" class="cc-enc-detail-panel">
        <div class="cc-enc-detail-head">
          <div>
            <h4>
              {{ formatEncounterDate(selectedRow.service_date) }}
              <span v-if="selectedRow.service_code" class="cc-enc-mono"> · {{ selectedRow.service_code }}</span>
            </h4>
            <p class="muted tiny" style="margin: 0;">
              {{ formatEncounterProvider(selectedRow) }}
              · {{ formatPlaceOfService(selectedRow.place_of_service) }}
            </p>
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="selectedRow.display_state === 'planned' || openingId === encounterKey(selectedRow)"
            @click="openNote(selectedRow)"
          >
            {{ openingId === encounterKey(selectedRow) ? 'Opening…' : noteActionLabel(selectedRow) }}
          </button>
        </div>

        <div class="cc-enc-detail-subtabs" role="tablist">
          <button
            v-for="t in detailTabs"
            :key="t.id"
            type="button"
            class="cc-enc-detail-subtab"
            :class="{ 'cc-enc-detail-subtab--active': detailTab === t.id }"
            @click="detailTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="cc-enc-detail-body">
          <template v-if="detailTab === 'summary'">
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Note status</div>
                <div class="cc-enc-field__value">
                  <span class="cc-enc-note-pill" :class="noteStatusClass(selectedRow)">
                    {{ noteStatusLabel(selectedRow) }}
                  </span>
                </div>
              </div>
              <div>
                <div class="cc-enc-field__label">Diagnosis</div>
                <div class="cc-enc-field__value">{{ selectedRow.diagnosis_text || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Setting</div>
                <div class="cc-enc-field__value">{{ formatPlaceOfService(selectedRow.place_of_service) }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Provider</div>
                <div class="cc-enc-field__value">{{ formatEncounterProvider(selectedRow) }}</div>
              </div>
            </div>
            <p class="muted tiny" style="margin: 0;">
              <template v-if="canViewMissingClaimFlag && selectedRow.billing_attached === false && !selectedRow.non_billable">
                No claim / billing info attached. Importing a billing report for this date and service code will attach to this session instead of creating a duplicate.
              </template>
              <template v-else>
                Clinical notes are authored in Note Workspace and linked to this session.
              </template>
            </p>
          </template>

          <template v-else-if="detailTab === 'note'">
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Clinical session</div>
                <div class="cc-enc-field__value">
                  {{ Number(selectedRow.clinical_session_id || 0) > 0 ? `#${selectedRow.clinical_session_id}` : 'Not started' }}
                </div>
              </div>
              <div>
                <div class="cc-enc-field__label">Note ID</div>
                <div class="cc-enc-field__value">
                  {{ Number(selectedRow.clinical_note_id || 0) > 0 ? `#${selectedRow.clinical_note_id}` : '—' }}
                </div>
              </div>
            </div>
            <p class="muted tiny" style="margin: 0;">
              {{
                selectedRow.note_status === 'signed'
                  ? 'This note is signed. Open it in Note Workspace to review.'
                  : selectedRow.note_status === 'draft'
                    ? 'A draft note exists. Continue editing in Note Workspace.'
                    : 'No note has been started for this session yet.'
              }}
            </p>
            <div>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="selectedRow.display_state === 'planned' || openingId === encounterKey(selectedRow)"
                @click="openNote(selectedRow)"
              >
                {{ openingId === encounterKey(selectedRow) ? 'Opening…' : noteActionLabel(selectedRow) }}
              </button>
            </div>
          </template>

          <template v-else>
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Record</div>
                <div class="cc-enc-field__value cc-enc-mono">{{ selectedRow.record_key || selectedRow.id }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Service date</div>
                <div class="cc-enc-field__value">{{ formatEncounterDate(selectedRow.service_date) }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">CPT code</div>
                <div class="cc-enc-field__value cc-enc-mono">{{ selectedRow.service_code || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Place of service</div>
                <div class="cc-enc-field__value">{{ selectedRow.place_of_service || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Diagnosis</div>
                <div class="cc-enc-field__value">{{ selectedRow.diagnosis_text || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Provider</div>
                <div class="cc-enc-field__value">{{ formatEncounterProvider(selectedRow) }}</div>
              </div>
            </div>
          </template>
        </div>
      </section>

          </template>
        </article>
        <p v-if="!filteredEncounters.length" class="muted tiny">No medical records match this filter.</p>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import ClientIntakeNotePanel from './clientChart/ClientIntakeNotePanel.vue';
import SchoolAbsenceRecords from '../schedule/SchoolAbsenceRecords.vue';
import SafetyPlansPanel from '../safetyPlans/SafetyPlansPanel.vue';
import ClinicalRecordDownloads from '../clinical/ClinicalRecordDownloads.vue';
import PhiDocumentsPanel from './PhiDocumentsPanel.vue';
import { computed, ref, watch } from 'vue';
import { useMedicalRecordHistory } from '../../composables/useMedicalRecordHistory.js';
import { confirmRecordDownload } from '../../utils/recordDownloadNotice';
import api from '../../services/api';
import {downloadSignedPdf} from '../../utils/downloadSignedPdf';
import { useClientEncounters } from '../../composables/useClientEncounters.js';
import { useClientEncounterNote } from '../../composables/useClientEncounterNote.js';
import {
  formatEncounterDate,
  formatEncounterProvider,
  formatPlaceOfService,
  matchesEncounterSearch,
  noteActionLabel,
  noteStatusClass,
  noteStatusLabel,
  encounterNeedsNote,
  encounterScheduleLabel
} from '../../utils/clientEncounterUtils.js';
import '../../styles/client-encounters-tab.css';

const openedIntake=ref(null),openedForm=ref(null);
const props = defineProps({
  agencyId: { type: Number, default: null },
  clientId: { type: Number, default: null },
  client: { type: Object, default: null },
  initialEncounterId: { type: Number, default: null },
  canViewMissingClaimFlag: { type: Boolean, default: false }
});

const documentTab=ref('record');
const clinicalDocumentsRef=ref(null);
function prepareToLeave(){return (!openedForm.value&&documentTab.value!=='clinical') || clinicalDocumentsRef.value?.confirmDiscard?.()!==false;}
defineExpose({prepareToLeave});
function selectDocumentTab(tab){
  if(tab===documentTab.value)return;
  if(!prepareToLeave())return;
  documentTab.value=tab;
}
const documentTabs=[{key:'record',label:'Record history'},{key:'clinical',label:'Clinical forms'},{key:'paper',label:'Full paper enrollment'}];
const emit = defineEmits(['encounter-change','navigate','open-document']);

const agencyRef = computed(() => props.agencyId);
const clientRef = computed(() => props.clientId);

const {
  sortedEncounters,
  loading,
  error,
  load
} = useClientEncounters(agencyRef, clientRef, { medicalOnly: true });

const { openingId, openClinicalNote } = useClientEncounterNote();
function closeFiledForm(){if(prepareToLeave()){openedForm.value=null;history.load();}}
function openHistoryEntry(row){
  if(row.action==='clinical-form')openedForm.value=row;
  else if(row.action==='request-file')return openSignedFile(row);
  else if(row.action==='document')emit('open-document',row.sourceId);
  else emit('navigate',row.tab);
}
async function openSignedFile(row){
 try{
  const {data}=await api.get(`/clinical-document-requests/clients/${props.clientId}/filed-files/${row.sourceId}`,{responseType:'blob'});
  downloadSignedPdf(data);
 }catch(e){recordFileError.value=e.response?.data?.error?.message||'The signed document could not be opened.';}
}
const recordFileError=ref('');
const recordType=ref(''),recordSort=ref('newest');
const recordKind=row=>row.historyKind || (row.records_import?'Imported intake':'Encounter');
const history = useMedicalRecordHistory(clientRef, agencyRef);
const chronologicalRows = computed(() => [...sortedEncounters.value, ...history.entries.value]
  .sort((a,b) => (Date.parse(b.scheduled_start_at || b.service_date) || 0) - (Date.parse(a.scheduled_start_at || a.service_date) || 0)));
const entryTypes=computed(()=>[...new Set(chronologicalRows.value.map(recordKind))].sort((a,b)=>a.localeCompare(b)));
watch(()=>props.clientId,()=>{openedForm.value=null;recordType.value='';recordFileError.value='';});
async function downloadEntry(row) {
  if (!confirmRecordDownload()) return;
  const config = {responseType:'blob',headers:{'X-Agency-Id':String(props.agencyId)}};
  try {
    const result = row.action === 'assessment'
      ? await api.post('/assessment-deliverables/' + row.sourceId + '/export',{format:'pdf'},config)
      : await api.get('/clients/' + props.clientId + '/communications/export',{...config,params:row.action === 'message' ? {messageKey:row.sourceId} : {conversationId:row.sourceId}});
    const url = URL.createObjectURL(result.data), anchor = document.createElement('a');
    anchor.href = url; anchor.download = row.action + '-' + row.sourceId + (row.action === 'assessment' ? '.pdf' : '.html');
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  } catch { error.value = 'This record could not be downloaded. Please retry.'; }
}


const listFilter = ref('all');
const searchQuery = ref('');
const detailTab = ref('summary');
const selectedId = ref(null);

async function printRecord() {
  try { await api.post('/account-security/activity-protection/print', {}, { headers: { 'X-Account-Security': '1' } }); } catch (e) { error.value = e.response?.data?.error?.message || 'Print access needs review.'; return; }
  const clientLabel = String(
    props.client?.full_name || props.client?.initials || `Client #${props.clientId || ''}`
  ).trim();
  const agencyLabel = String(props.client?.agency_name || '').trim();
  const rows = (sortedEncounters.value || []).slice().sort((a, b) => {
    const da = new Date(a.service_date || a.created_at || 0).getTime();
    const db = new Date(b.service_date || b.created_at || 0).getTime();
    return da - db;
  });
  const body = rows
    .map((row) => {
      const date = formatEncounterDate(row.service_date);
      const code = row.service_code || '—';
      const provider = formatEncounterProvider(row);
      const dx = row.diagnosis_text || '—';
      const note = noteStatusLabel(row);
      return `<tr>
        <td>${date}</td>
        <td class="mono">${code}</td>
        <td>${provider}</td>
        <td>${dx}</td>
        <td>${note}</td>
      </tr>`;
    })
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>Medical Record — ${clientLabel}</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 32px; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .meta { color: #475569; font-size: 13px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; vertical-align: top; }
      th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
      .mono { font-family: ui-monospace, Menlo, monospace; }
      .brand { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #0f766e; margin-bottom: 8px; }
      @media print { body { margin: 12mm; } }
    </style></head><body>
    <div class="brand">${agencyLabel || 'PlotTwistHQ'} · Medical Record</div>
    <h1>${clientLabel}</h1>
    <div class="meta">Chronological encounter list · Generated ${new Date().toLocaleString()}</div>
    <table>
      <thead><tr><th>Date</th><th>Code</th><th>Provider</th><th>Diagnosis</th><th>Note</th></tr></thead>
      <tbody>${body || '<tr><td colspan="5">No encounters on file.</td></tr>'}</tbody>
    </table>
    </body></html>`;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try { w.print(); } catch { /* ignore */ }
  }, 250);
}

const filterOptions = computed(() => {
  const base = [
    { id: 'all', label: 'All' },
    { id: 'notes_needed', label: 'Notes needed' },
    { id: 'signed', label: 'Signed' }
  ];
  if (props.canViewMissingClaimFlag) {
    base.push({ id: 'missing_claim', label: 'Missing claim' });
  }
  return base;
});

const detailTabs = [
  { id: 'summary', label: 'Summary' },
  { id: 'note', label: 'Note' },
  { id: 'details', label: 'Details' }
];

const filteredEncounters = computed(() => {
  let rows = chronologicalRows.value;
  if (listFilter.value === 'notes_needed') {
    rows = rows.filter(encounterNeedsNote);
  } else if (listFilter.value === 'signed') {
    rows = rows.filter((row) => String(row?.note_status || 'none') === 'signed');
  } else if (listFilter.value === 'missing_claim' && props.canViewMissingClaimFlag) {
    rows = rows.filter((row) => row?.billing_attached === false && !row.non_billable);
  }
  const q = searchQuery.value;
  if(recordType.value) rows=rows.filter(row=>recordKind(row)===recordType.value);
  if (q) rows = rows.filter(row => row.historyKind ? (row.title + ' ' + row.historyKind + ' ' + (row.service_date || '') + ' ' + (row.respondent || '')).toLowerCase().includes(q.toLowerCase()) : matchesEncounterSearch(row, q));
  if(recordSort.value==='oldest')return rows.slice().reverse();
  if(recordSort.value==='type')return rows.slice().sort((a,b)=>recordKind(a).localeCompare(recordKind(b)));
  return rows;
});

const selectedRow = computed(() =>
  chronologicalRows.value.find((row) => encounterKey(row) === selectedId.value) || null
);

function encounterKey(row) {
  return String(row?.record_key || (row?.id != null ? `id:${row.id}` : ''));
}

function selectEncounter(rowOrKey) {
  const key = typeof rowOrKey === 'object' && rowOrKey
    ? encounterKey(rowOrKey)
    : String(rowOrKey || '');
  if (!key) return;
  selectedId.value = key;
  const n = Number(typeof rowOrKey === 'object' ? rowOrKey?.billing_encounter_id || rowOrKey?.id : rowOrKey);
  emit('encounter-change', Number.isFinite(n) ? n : 0);
}

function toggleEncounter(row) {
  if (encounterKey(row) === selectedId.value) {
    selectedId.value = null;
    emit('encounter-change', 0);
    return;
  }
  detailTab.value = 'summary';
  selectEncounter(row);
}

function openNote(row) {
  if (row.display_state === 'planned') return;
  if(row.intake_draft_id){openedIntake.value=row;return;}
  openClinicalNote({
    agencyId: props.agencyId,
    clientId: props.clientId,
    row
  });
}

function syncSelectionFromProps() {
  const initial = Number(props.initialEncounterId || 0);
  if (initial > 0) {
    const hit = sortedEncounters.value.find((row) =>
      Number(row.billing_encounter_id || row.id) === initial
    );
    if (hit) {
      selectedId.value = encounterKey(hit);
      return;
    }
  }
}

watch(
  () => [props.initialEncounterId, sortedEncounters.value.length],
  () => syncSelectionFromProps(),
  { immediate: true }
);

watch(
  filteredEncounters,
  (rows) => {
    if (selectedId.value && !rows.some(row => encounterKey(row) === selectedId.value)) {
      selectedId.value = null;
    }
  }
);
</script>

<style scoped>
.cc-enc-timeline { display: grid; gap: 12px; }
.cc-enc-timeline-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.cc-enc-timeline-filters .cc-enc-search { width: min(100%, 320px); }
.cc-enc-timeline-list { display: grid; gap: 8px; }
.cc-enc-timeline-entry {
  min-width: 0;
  border: 1px solid var(--cc-border, #e2e8f0);
  border-radius: 10px;
  background: var(--cc-card, #fff);
}
.cc-enc-timeline-entry .cc-enc-detail-panel {
  border: 0;
  border-top: 1px solid var(--cc-border, #e2e8f0);
  min-height: 0;
}
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
</style>

<style scoped>
.medical-document-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.medical-document-tabs button{font:inherit;padding:12px 16px;border:1px solid #bdd0c6;border-radius:8px;background:white;color:#234d40;cursor:pointer}.medical-document-tabs button[aria-pressed=true]{background:#175b48;color:white}.paper-enrollment-upload{padding:20px;background:white;border:1px solid #d9e5df;border-radius:12px;margin-bottom:20px}.paper-enrollment-upload p{font-size:13px;line-height:1.7;max-width:900px}</style>

<style scoped>
.cc-enc-select{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
.cc-enc-list-item{display:grid;grid-template-columns:minmax(6rem,1fr) minmax(11rem,3fr) minmax(7rem,1.4fr) minmax(6rem,1fr);align-items:center;gap:.8rem;text-align:left}
.timeline-title{display:grid;gap:.2rem}.timeline-status{justify-self:start}.timeline-date{font-variant-numeric:tabular-nums}
@media(max-width:650px){.cc-enc-list-item{grid-template-columns:1fr 1fr}.timeline-title{grid-row:1;grid-column:1/-1}}
</style>
