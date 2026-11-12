<template>
  <div ref="panelElement" class="rip-panel" :class="{ 'rip-panel--embedded': embedded, 'rip-panel--guided': guided }">
    <div v-if="!guided" class="rip-header">
      <div>
        <div class="rip-title">
          <span v-if="mode === 'draft_audit'">Raw Import (Draft Audit)</span>
          <span v-else-if="mode === 'missed_appts_paid_in_full'">Raw Import (Missed Appointment Fees)</span>
          <span v-else-if="mode === 'process_h0031'">Raw Import (Process H0031)</span>
          <span v-else-if="mode === 'process_h0032'">Raw Import (Process H0032)</span>
          <span v-else-if="mode === 'process_h2014'">Raw Import (Process H2014)</span>
          <span v-else-if="mode === 'process_90853'">Raw Import (Process 90853)</span>
          <span v-else-if="mode === 'process_h2032'">Raw Import (Process H2032)</span>
          <span v-else>Raw Import (Processed)</span>
        </div>
        <div class="rip-hint">
          <span v-if="mode === 'draft_audit'">
            Review DRAFT rows and mark payable vs not payable. Changes save immediately and appear on the Payroll page too.
          </span>
          <span v-else-if="mode === 'missed_appts_paid_in_full'">
            Missed Appointment rows from the billing import where Patient Balance Status is Paid in Full. Display-only (no pay math) — review clinician totals before continuing.
          </span>
          <span v-else-if="String(mode).startsWith('process_') && catchUpMode">
            Enter accurate minutes (billing units are often wrong), then mark Done. FINALIZED notes are Payable for this catch-up. Sessions already in Run 1 stay hidden.
          </span>
          <span v-else-if="String(mode).startsWith('process_')">
            Enter minutes and mark Done. Unpaid rows are included so values are ready when notes finalize.
          </span>
          <span v-else>Review rows that have been processed (Done).</span>
        </div>
        <div v-if="periodLabel" class="rip-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <div v-if="!embedded" class="rip-header-actions">
        <button v-for="tab in reviewModes" :key="tab.mode" type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === tab.mode, 'rip-tab--attention': reviewState.counts[tab.mode] > 0 }" @click="setMode(tab.mode)">
          {{ tab.label }} <span v-if="reviewState.counts[tab.mode] > 0" class="rip-tab-count">{{ reviewState.counts[tab.mode] }}</span>
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'processed' }" @click="setMode('processed')">Processed</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Close</button>
      </div>
    </div>

    <!-- Embedded tab row: mode switcher shown as full-width tabs when inside wizard -->
    <div v-if="embedded && !guided" class="rip-tabs">
      <button v-for="tab in reviewModes" :key="tab.mode" type="button" class="rip-tab" :class="{ active: mode === tab.mode, 'rip-tab--attention': reviewState.counts[tab.mode] > 0 }" @click="setMode(tab.mode)">
        {{ tab.label }} <span v-if="reviewState.counts[tab.mode] > 0" class="rip-tab-count">{{ reviewState.counts[tab.mode] }}</span>
      </button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'processed' }" @click="setMode('processed')">Processed</button>
    </div>

    <div v-if="reviewState.error" class="rip-error" role="alert">{{ reviewState.error }} <button type="button" class="btn btn-secondary" :disabled="loading || anySaving" @click="reload">Try again</button></div>
    <div v-if="lastSaveMessage" role="status" class="rip-saved">{{ lastSaveMessage }}</div>
    <div v-if="loading" class="rip-muted">Loading…</div>

    <div v-else-if="guided && reviewState.empty && !error && !showReviewedDrafts">
      <PayrollWizardEmpty :title="reviewState.emptyTitle" :message="reviewState.emptyMessage" />
      <button v-if="mode === 'draft_audit' && rows.some(r => isDraftRow(r) && !isAlreadyPaidInBaseline(r)) && !locked" type="button" class="btn btn-secondary" @click="showReviewedDrafts = true; rowFilter = 'draft_only'">Review saved draft decisions</button>
    </div>

    <template v-else-if="loaded">
      <div class="rip-controls">
        <div class="field" v-if="mode !== 'missed_appts_paid_in_full' && (!guided || imports.length > 1)">
          <label>Imported Snapshot</label>
          <select v-model="selectedImportId" :disabled="loading || anySaving" @change="reload">
            <option v-for="imp in imports" :key="imp.id" :value="imp.id">{{ importLabel(imp) }}</option>
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input
            v-model="search"
            type="text"
            :placeholder="mode === 'missed_appts_paid_in_full' ? 'Search clinician…' : 'Search provider / code / DOS…'"
          />
        </div>
        <div class="field" v-if="mode === 'draft_audit' || (catchUpMode && String(mode).startsWith('process_'))">
          <label>Rows Filter</label>
          <select v-model="rowFilter">
            <option v-if="catchUpMode && String(mode).startsWith('process_')" value="catchup_focus">
              Needs catch-up (not in Run 1 · not done)
            </option>
            <option v-if="catchUpMode && String(mode).startsWith('process_')" value="new_vs_run1">
              Not in Run 1 yet (incl. Done)
            </option>
            <option v-if="mode === 'draft_audit' && guided" value="pending_review">Drafts needing a payment decision</option>
            <option v-if="mode === 'draft_audit' && !guided" value="unpaid_only">Unpaid notes only (no note + draft unpaid)</option>
            <option v-if="mode === 'draft_audit'" value="draft_only">Draft only</option>
            <option value="all">Show all</option>
          </select>
        </div>
        <div v-if="!guided" class="field">
          <label>Status</label>
          <div class="rip-muted">{{ periodStatusLabel }}</div>
        </div>
      </div>

      <div v-if="guided && mode === 'draft_audit' && (reviewState.pendingDraftCount || showReviewedDrafts)" class="rip-review-summary" role="status">
        <span>{{ reviewState.pendingDraftCount }} draft{{ reviewState.pendingDraftCount === 1 ? '' : 's' }} need a payment decision.</span>
        <div class="rip-review-actions">
          <button type="button" class="btn btn-secondary" :disabled="locked || saving || !selectableDraftRows.length" @click="selectMatchingDrafts">Select all matching drafts</button>
          <button type="button" class="btn btn-secondary" :disabled="saving || !selectedDraftRows.length" @click="selectedDraftIds = []">Clear selection</button>
          <span>{{ selectedDraftRows.length }} selected</span>
          <button type="button" class="btn btn-primary" :disabled="locked || saving || !selectedDraftRows.length" @click="saveSelectedDrafts(true)">Mark selected payable</button>
          <button type="button" class="btn btn-secondary" :disabled="locked || saving || !selectedDraftRows.length" @click="saveSelectedDrafts(false)">Keep selected unpaid</button>
        </div>
      </div>

      <div v-if="mode === 'missed_appts_paid_in_full'" class="rip-table-wrap">
        <table class="rip-table rip-table--missed">
          <thead>
            <tr>
              <th>Clinician Name</th>
              <th class="right">Total Patient Amount Paid</th>
              <th class="right">Rows</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleMissedRows" :key="r.clinician_name">
              <td>{{ r.clinician_name || '—' }}</td>
              <td class="right">{{ fmtMoney(r.total_patient_amount_paid) }}</td>
              <td class="right">{{ fmtNum(r.row_count) }}</td>
            </tr>
            <tr v-if="!visibleMissedRows.length">
              <td colspan="3" class="rip-muted">
                No Paid-in-Full missed appointment rows were detected in the latest billing import for this period.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="rip-table-wrap">
        <table class="rip-table">
          <thead>
            <tr>
              <th v-if="guided && mode === 'draft_audit'" class="rip-select"><input type="checkbox" :checked="allMatchingDraftsSelected" :indeterminate="selectedDraftRows.length > 0 && !allMatchingDraftsSelected" :disabled="locked || saving || !selectableDraftRows.length" aria-label="Select all matching drafts" @change="toggleMatchingDrafts($event.target.checked)" /></th>
              <th :aria-sort="providerDirection===1?'ascending':'descending'"><button type="button" class="rip-sort" @click="providerDirection *= -1">Provider Name {{ providerDirection===1?'↑':'↓' }}</button></th>
              <th>Client</th>
              <th>Service Code</th>
              <th><button type="button" class="rip-sort" title="Sort service dates within each provider" @click="dateDirection *= -1">DOS {{ dateDirection===1?'↑':'↓' }}</button></th>
              <th class="right">Units</th>
              <th>Note Status</th>
              <th title="Payable = note is finalized/draft-payable. Paid in Run 1 = already included last cycle.">Payable?</th>
              <th v-if="mode === 'draft_audit'">Draft Payable?</th>
              <th v-else>Process</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRows" :key="r.id" :data-row-id="r.id" :data-pending="needsReview(r) || (String(mode).startsWith('process_') && !r.processed_at && !isAlreadyPaidInBaseline(r)) ? 'true' : undefined" :class="{ unpaid: !isNotePayable(r) && String(mode).startsWith('process_') }">
              <td v-if="guided && mode === 'draft_audit'"><input v-if="canSelectDraft(r)" v-model="selectedDraftIds" type="checkbox" :value="Number(r.id)" :disabled="locked || saving" :aria-label="`Select draft ${r.id} for ${r.provider_name || 'provider'}`" /></td>
              <td>{{ r.provider_name || '—' }}</td>
              <td>{{ clientDisplay(r) }}</td>
              <td>{{ r.service_code || '—' }}</td>
              <td>{{ String(r.service_date || '').slice(0, 10) || '—' }}</td>
              <td class="right">
                <template v-if="String(mode).startsWith('process_') && Number(r.requires_processing) === 1 && !isAlreadyPaidInBaseline(r)">
                  <input
                    type="number"
                    class="rip-num"
                    step="1"
                    min="1"
                    :value="minuteDrafts[Number(r.id)] ?? r.unit_count"
                    :disabled="!canEditProcessing || rowSaving(r)"
                    @input="minuteDrafts[Number(r.id)] = $event.target.value"
                    @change="updateMinutes(r, $event.target.value)"
                  />
                </template>
                <template v-else>{{ fmtNum(r.unit_count) }}</template>
              </td>
              <td><span class="rip-pill">{{ statusLabel(r) }}</span></td>
              <td>
                <strong :class="payableLabelClass(r)">{{ payableLabel(r) }}</strong>
              </td>
              <td v-if="mode === 'draft_audit'">
                <template v-if="guided && isDraftRow(r) && !isAlreadyPaidInBaseline(r)">
                  <span v-if="draftWasReviewed(r)" class="rip-reviewed">Reviewed — {{ isNotePayable(r) ? 'payable' : 'keep unpaid' }}</span>
                  <div class="rip-review-actions">
                    <button type="button" class="btn btn-secondary" :disabled="locked || saving" @click="toggleDraftPayable(r, true)">Payable</button>
                    <button type="button" class="btn btn-secondary" :disabled="locked || saving" @click="toggleDraftPayable(r, false)">Keep unpaid</button>
                  </div>
                </template>
                <select
                  v-else-if="String(r.note_status || '').toUpperCase() === 'DRAFT'"
                  :disabled="locked || rowFilter === 'all'"
                  :value="Number(r.draft_payable) ? 'payable' : 'not_payable'"
                  @change="toggleDraftPayable(r, $event.target.value === 'payable')"
                >
                  <option value="payable">Payable (default)</option>
                  <option value="not_payable">Not payable</option>
                </select>
                <span v-else class="rip-muted">—</span>
              </td>
              <td v-else>
                <template v-if="isAlreadyPaidInBaseline(r)">
                  <span class="rip-muted">Already in Run 1</span>
                </template>
                <template v-else>
                  <span class="rip-muted">{{ rowSaving(r) ? 'Saving…' : rowErrors[Number(r.id)] ? 'Not saved' : r.processed_at ? 'Done' : 'Not done' }}</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    style="margin-left: 8px;"
                    :disabled="!canEditProcessing || Number(r.requires_processing) !== 1 || processingSaves[Number(r.id)]"
                    @click="toggleProcessed(r, !r.processed_at)"
                  >
                    {{ r.processed_at ? 'Undo' : 'Mark done' }}
                  </button>
                  <button v-if="rowErrors[Number(r.id)] && failedChanges.has(Number(r.id))" type="button" class="btn btn-secondary btn-sm" :disabled="rowSaving(r)" @click="retryRow(r)">Retry save</button>
                </template>
              </td>
            </tr>
            <tr v-if="!visibleRows.length">
              <td :colspan="guided && mode === 'draft_audit' ? 9 : 8" class="rip-muted">
                <template v-if="catchUpMode && hiddenAlreadyPaidCount > 0 && (rowFilter === 'catchup_focus' || rowFilter === 'new_vs_run1')">
                  Nothing left for catch-up — {{ hiddenAlreadyPaidCount }} session{{ hiddenAlreadyPaidCount === 1 ? '' : 's' }} already in Run 1 {{ hiddenAlreadyPaidCount === 1 ? 'is' : 'are' }} hidden.
                </template>
                <template v-else>No rows found.</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rip-footer">
        <span v-if="mode === 'missed_appts_paid_in_full'" class="rip-muted">
          Showing {{ visibleMissedRows.length }} of {{ filteredMissedRows.length }} clinician{{ filteredMissedRows.length === 1 ? '' : 's' }}
          ({{ missedRows.length }} total).
        </span>
        <span v-else class="rip-muted">
          Showing {{ visibleRows.length }} of {{ filteredRows.length }} filtered rows ({{ rows.length }} total)
          <template v-if="catchUpMode && hiddenAlreadyPaidCount > 0 && rowFilter !== 'all'">
            · {{ hiddenAlreadyPaidCount }} already in Run 1 hidden
          </template>
          <template v-if="excludedOutOfPeriod > 0">
            · {{ excludedOutOfPeriod }} outside {{ periodBounds.start || 'period' }}→{{ periodBounds.end || '' }} hidden
          </template>
          .
        </span>
        <button
          v-if="mode === 'missed_appts_paid_in_full' && filteredMissedRows.length > rowLimit"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="rowLimit = filteredMissedRows.length"
        >
          Show all
        </button>
        <button
          v-else-if="mode !== 'missed_appts_paid_in_full' && filteredRows.length > rowLimit"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="rowLimit = filteredRows.length"
        >
          Show all
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import PayrollWizardEmpty from './PayrollWizardEmpty.vue';
import { RAW_REVIEW_MODES, draftWasReviewed, isDraftRow, needsDraftReview, rawReviewState } from '../../utils/payrollRawReview';

const props = defineProps({
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' },
  initialMode: { type: String, default: 'draft_audit' },
  initialImportId: { type: [Number, String], default: null },
  /** The wizard owns the heading, navigation and single Continue action. */
  guided: { type: Boolean, default: false },
  /** When true (embedded in wizard), hides the mode-switch & close buttons from the header */
  embedded: { type: Boolean, default: false },
  /**
   * Wizard prior catch-up only: default hides sessions already in Run 1.
   * FINALIZED late adds remain Payable + Not done. Show all remains available.
   */
  catchUpMode: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'changed', 'review-state', 'readiness']);

const mode = ref(props.initialMode || 'draft_audit');
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const rows = ref([]);
const missedRows = ref([]);
const imports = ref([]);
const selectedDraftIds = ref([]);
const showReviewedDrafts = ref(false);
const selectedImportId = ref(Number(props.initialImportId) || null);
const excludedOutOfPeriod = ref(0);
const periodBounds = ref({ start: '', end: '' });
const search = ref('');
const rowFilter = ref(props.catchUpMode && String(props.initialMode || '').startsWith('process_')
  ? 'catchup_focus'
  : (props.guided ? 'pending_review' : 'unpaid_only'));
const rowLimit = ref(200);
const saving = ref(false);
const providerDirection=ref(1),dateDirection=ref(-1),rowSaves=ref({}),lastSaveMessage=ref('');
const processingSaves=ref({}),rowErrors=ref({}),minuteDrafts=ref({});
const failedChanges=new Map();
const rowQueues=new Map();
const rowSaving=row=>Number(rowSaves.value[Number(row.id)] || 0)>0;
const anySaving=computed(()=>saving.value || Object.values(rowSaves.value).some(Boolean));
const panelElement = ref(null);
const reviewModes = RAW_REVIEW_MODES;
let reloadSequence = 0;

const reviewState = computed(() => {
  const posted = ['posted', 'finalized'].includes(String(props.periodStatus || '').toLowerCase());
  const selected = imports.value.find(imp => Number(imp.id) === Number(selectedImportId.value));
  const permitted = selected?.draft_review_allowed === true || Number(selected?.draft_review_allowed || 0) === 1;
  const blockedCatchup = loaded.value && posted && props.catchUpMode && !permitted && rows.value.some(needsDraftReview);
  return {
    periodId: Number(props.periodId),
    importId: Number(selectedImportId.value) || null,
    ...rawReviewState({ rows: rows.value, missedRows: missedRows.value, mode: mode.value, catchUpMode: props.catchUpMode, readOnlyHistorical: posted && !props.catchUpMode, loaded: loaded.value, loading: loading.value, saving: anySaving.value, error: error.value || Object.values(rowErrors.value).find(Boolean) || (blockedCatchup ? 'This import is locked. Upload a new catch-up report after posting to review unpaid drafts.' : '') })
  };
});
watch(reviewState, value => {
  emit('review-state', value);
  emit('readiness', value);
}, { immediate: true });

const needsReview = needsDraftReview;

/** Already included in last cycle's Run 1 import — not the same as note FINALIZED/Payable. */
const isAlreadyPaidInBaseline = (r) => Number(r?.already_paid_in_baseline || 0) === 1;
const hiddenAlreadyPaidCount = computed(() =>
  (rows.value || []).filter((r) => isAlreadyPaidInBaseline(r)).length
);

const clientDisplay = (r) => {
  const hint = String(r?.client_hint || '').trim();
  if (hint && hint !== '—') return hint;
  const first = String(r?.patient_first_name || '').trim();
  if (!first) return '—';
  if (first.length <= 4) return first;
  return first.length >= 2 ? `${first[0]}${first[1]}`.toUpperCase() : first.toUpperCase();
};

const isPeriodPosted = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

/** Catch-up on a prior posted period still needs minutes + Done edits. */
const canEditProcessing = computed(() => {
  if (!isPeriodPosted.value) return true;
  return !!props.catchUpMode && String(mode.value).startsWith('process_');
});

const periodStatusLabel = computed(() => {
  if (isPeriodPosted.value) {
    return canEditProcessing.value
      ? 'Posted (catch-up editing unlocked)'
      : 'Posted (locked)';
  }
  const st = String(props.periodStatus || '').toLowerCase();
  if (st === 'ran') return 'Ran';
  if (st === 'staged') return 'Staged';
  if (st === 'raw_imported') return 'Imported';
  return st || '—';
});

/** Draft payable / non-process edits stay locked on posted periods. */
const locked = computed(() => {
  if (!isPeriodPosted.value) return false;
  if (!props.catchUpMode) return true;
  const selected = imports.value.find(imp => Number(imp.id) === Number(selectedImportId.value));
  // The server authorizes edits only to a catch-up import uploaded after posting.
  // Older backends do not advertise that permission and remain locked.
  return selected?.draft_review_allowed !== true && Number(selected?.draft_review_allowed || 0) !== 1;
});

/** Note is payable (FINALIZED / draft payable) — NOT “already paid on a payroll run.” */
const isNotePayable = (r) => {
  const st = String(r?.note_status || '').toUpperCase();
  if (st === 'NO_NOTE' || st === 'NONE' || !st) return false;
  if (st === 'DRAFT') return Number(r?.draft_payable) === 1;
  if (st === 'FINALIZED' || st === 'FINAL' || st === 'SIGNED') return true;
  return false;
};

const payableLabel = (r) => {
  if (isAlreadyPaidInBaseline(r)) return 'Paid in Run 1';
  return isNotePayable(r) ? 'Payable' : 'Unpaid';
};

const payableLabelClass = (r) => {
  if (isAlreadyPaidInBaseline(r)) return 'rip-paid-run1';
  return isNotePayable(r) ? 'rip-payable' : 'rip-unpayable';
};

// Keep name used by draft-audit unpaid filter
const willBePaid = isNotePayable;

const statusLabel = (r) => {
  const st = String(r?.note_status || '').toUpperCase();
  if (st === 'DRAFT') return Number(r?.draft_payable) === 1 ? 'DRAFT_PAID' : 'DRAFT_UNPAID';
  return st || 'NO_NOTE';
};

const fmtNum = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return String(v);
};

const fmtMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
};

const importLabel = (imp) => {
  const slot = Number(imp?.slot_number || 0) || 1;
  const imported = String(imp?.created_at || '').slice(0, 10);
  const name = String(imp?.original_filename || '').trim();
  return `Run ${slot} - ${imported}${name ? ` - ${name.slice(0, 28)}` : ''}`;
};

const codeForMode = (m) => {
  if (m === 'process_h0031') return 'H0031';
  if (m === 'process_h0032') return 'H0032';
  if (m === 'process_h2014') return 'H2014';
  if (m === 'process_90853') return '90853';
  if (m === 'process_h2032') return 'H2032';
  return null;
};

const filteredRows = computed(() => {
  let list = (rows.value || []).slice();
  const q = String(search.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter((r) => {
      const hay = `${r.provider_name || ''} ${clientDisplay(r)} ${r.patient_first_name || ''} ${r.service_code || ''} ${r.service_date || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (mode.value === 'draft_audit') {
    if (props.guided) list = list.filter((r) => !isAlreadyPaidInBaseline(r));
    if (rowFilter.value === 'pending_review') list = list.filter(needsReview);
    else if (rowFilter.value === 'unpaid_only') list = list.filter((r) => !willBePaid(r));
    else if (rowFilter.value === 'draft_only') list = list.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT');
  } else if (String(mode.value).startsWith('process_')) {
    const code = codeForMode(mode.value);
    list = list.filter((r) => Number(r.requires_processing) === 1 && String(r.service_code || '').toUpperCase().includes(String(code || '').toUpperCase()));
    // Catch-up: hide Run 1 sessions; keep FINALIZED late adds (Payable + often Not done).
    if (props.catchUpMode && (rowFilter.value === 'catchup_focus' || rowFilter.value === 'new_vs_run1')) {
      list = list.filter((r) => !isAlreadyPaidInBaseline(r));
      if (rowFilter.value === 'catchup_focus') {
        list = list.filter((r) => !r.processed_at);
      }
    }
  } else if (mode.value === 'processed') {
    list = list.filter((r) => Number(r.requires_processing) === 1 && !!r.processed_at && willBePaid(r));
  }

  list.sort((a,b)=>providerDirection.value*String(a.provider_name || '').localeCompare(String(b.provider_name || ''),undefined,{sensitivity:'base'}) || dateDirection.value*String(a.service_date || '').localeCompare(String(b.service_date || '')) || String(clientDisplay(a)).localeCompare(String(clientDisplay(b))) || Number(a.id)-Number(b.id));
  return list;
});

const canSelectDraft = r => isDraftRow(r) && !isAlreadyPaidInBaseline(r) && (showReviewedDrafts.value || needsReview(r));
const selectableDraftRows = computed(() => filteredRows.value.filter(canSelectDraft));
const selectedDraftRows = computed(() => rows.value.filter(r => canSelectDraft(r) && selectedDraftIds.value.includes(Number(r.id))));
const allMatchingDraftsSelected = computed(() => selectableDraftRows.value.length > 0 && selectableDraftRows.value.every(r => selectedDraftIds.value.includes(Number(r.id))));
const toggleMatchingDrafts = checked => {
  const ids = selectableDraftRows.value.map(r => Number(r.id));
  selectedDraftIds.value = checked ? [...new Set([...selectedDraftIds.value, ...ids])] : selectedDraftIds.value.filter(id => !ids.includes(id));
};
const selectMatchingDrafts = () => toggleMatchingDrafts(true);

const visibleRows = computed(() => (filteredRows.value || []).slice(0, rowLimit.value));

const filteredMissedRows = computed(() => {
  let list = (missedRows.value || []).slice();
  const q = String(search.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter((r) => String(r?.clinician_name || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => String(a?.clinician_name || '').localeCompare(String(b?.clinician_name || '')));
  return list;
});

const visibleMissedRows = computed(() => (filteredMissedRows.value || []).slice(0, rowLimit.value));

const setMode = (m) => {
  mode.value = m;
  search.value = '';
  rowLimit.value = 200;
  if (props.catchUpMode && String(m).startsWith('process_')) {
    rowFilter.value = 'catchup_focus';
  } else if (m === 'draft_audit') {
    rowFilter.value = props.guided ? 'pending_review' : 'unpaid_only';
  }
};

watch(() => props.catchUpMode, (on) => {
  if (on && String(mode.value).startsWith('process_')) rowFilter.value = 'catchup_focus';
});

const reload = async () => {
  minuteDrafts.value={};rowErrors.value={};failedChanges.clear();lastSaveMessage.value='';
  selectedDraftIds.value = [];
  if (!props.periodId) return;
  const sequence = ++reloadSequence;
  const periodId = props.periodId;
  const importId = selectedImportId.value;
  loading.value = true;
  loaded.value = false;
  error.value = '';
  try {
    // Load both datasets once. Switching directly from fees to a code must not
    // leave an empty, stale raw dataset until the user clicks a second time.
    const [audit, period] = await Promise.all([
      api.get(`/payroll/periods/${periodId}/raw-audit`, { skipGlobalLoading:true, params: { importId: importId || undefined } }),
      api.get(`/payroll/periods/${periodId}`,{params:{view:'raw-review'},skipGlobalLoading:true})
    ]);
    if (sequence !== reloadSequence) return;
    imports.value = audit.data?.imports || [];
    selectedImportId.value = Number(audit.data?.selectedImportId || importId || 0) || (imports.value[imports.value.length - 1]?.id ?? null);
    rows.value = audit.data?.rows || [];
    missedRows.value = period.data?.missedAppointmentsPaidInFull || [];
    excludedOutOfPeriod.value = Number(audit.data?.excludedOutOfPeriod || 0) || 0;
    periodBounds.value = {
      start: String(audit.data?.periodStart || audit.data?.period?.period_start || '').slice(0, 10),
      end: String(audit.data?.periodEnd || audit.data?.period?.period_end || '').slice(0, 10)
    };
    loaded.value = true;
  } catch (e) {
    if (sequence !== reloadSequence) return;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load raw audit';
    rows.value = [];
    missedRows.value = [];
  } finally {
    if (sequence === reloadSequence) loading.value = false;
  }
};

const saveDraftDecision = async (row, nextVal) => {
  const query = isPeriodPosted.value && props.catchUpMode ? '?allowPostedDraftReview=true' : '';
  await api.patch(`/payroll/import-rows/${row.id}${query}`, { draftPayable: !!nextVal, draftReviewed: true });
  const idx = rows.value.findIndex((r) => Number(r.id) === Number(row.id));
  if (idx >= 0) rows.value[idx] = { ...rows.value[idx], draft_payable: nextVal ? 1 : 0, draft_reviewed: true };
};

const toggleDraftPayable = async (row, nextVal) => {
  if (!row?.id || locked.value || saving.value || isAlreadyPaidInBaseline(row)) return;
  try {
    saving.value = true;
    error.value = '';
    await saveDraftDecision(row, nextVal);
    emit('changed', { periodId: Number(props.periodId), importId: selectedImportId.value, rowId: row.id, kind: 'draft_review' });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update draft payable';
  } finally {
    saving.value = false;
  }
};

const saveSelectedDrafts = async payable => {
  if (locked.value || saving.value) return;
  const selected = [...selectedDraftRows.value];
  let savedCount = 0;
  saving.value = true; error.value = '';
  try {
    for (const row of selected) {
      await saveDraftDecision(row, payable);
      selectedDraftIds.value = selectedDraftIds.value.filter(id => id !== Number(row.id));
      savedCount++;
    }
  } catch (e) {
    error.value = `${savedCount} of ${selected.length} decisions saved. ${e?.response?.data?.error?.message || e?.message || 'Review the remaining selected drafts and try again.'}`;
  } finally {
    saving.value = false;
    if (savedCount) emit('changed', { periodId: Number(props.periodId), importId: selectedImportId.value, kind: 'draft_review', savedCount });
  }
};

const postedProcessingQs = () => (
  isPeriodPosted.value && canEditProcessing.value ? '?allowPostedProcessing=true' : ''
);

const queueProcessingSave = (row,changes) => {
  if(!row?.id || !canEditProcessing.value || Number(row.requires_processing)!==1)return;
  const id=Number(row.id),generation=reloadSequence,periodId=Number(props.periodId),importId=selectedImportId.value;
  rowSaves.value={...rowSaves.value,[id]:(rowSaves.value[id] || 0)+1};
  if(changes.processed!=null)processingSaves.value={...processingSaves.value,[id]:true};
  rowErrors.value={...rowErrors.value,[id]:''};
  error.value='';lastSaveMessage.value='';
  let started=false;
  const previous=rowQueues.get(id) || Promise.resolve();
  const request=previous.then(async()=>{
    if(generation!==reloadSequence)return;
    started=true;
    const {data}=await api.patch(`/payroll/import-rows/${id}${postedProcessingQs()}`,{...changes,deferPayrollRecompute:true},{skipGlobalLoading:true});
    if(generation!==reloadSequence || periodId!==Number(props.periodId) || importId!==selectedImportId.value)return;
    const index=rows.value.findIndex(r=>Number(r.id)===id);
    if(index>=0)rows.value[index]={...rows.value[index],...(data.row || {}),...(data.row?{}:{...(changes.unitCount!=null?{unit_count:changes.unitCount}:{}),...(changes.processed!=null?{processed_at:changes.processed?new Date().toISOString():null}:{})})};
    if(changes.unitCount!=null && Number(minuteDrafts.value[id])===Number(changes.unitCount)){const drafts={...minuteDrafts.value};delete drafts[id];minuteDrafts.value=drafts;}
    failedChanges.delete(id);
    lastSaveMessage.value=changes.processed!=null?(changes.processed?'Marked done.':'Marked not done.'):'Minutes saved.';
    emit('changed',{periodId,rowId:id,kind:changes.processed!=null?'processed':'minutes',saved:data});
  });
  rowQueues.set(id,request);
  request.catch(e=>{if(started && generation===reloadSequence){failedChanges.set(id,changes);rowErrors.value={...rowErrors.value,[id]:e?.response?.data?.error?.message || e?.message || 'This row was not saved. Review it and retry.'};}}).finally(()=>{
    rowSaves.value={...rowSaves.value,[id]:Math.max(0,(rowSaves.value[id] || 1)-1)};
    if(changes.processed!=null)processingSaves.value={...processingSaves.value,[id]:false};
    if(rowQueues.get(id)===request)rowQueues.delete(id);
  });
  return request;
};
const updateMinutes = (row,value) => {
  const next=Math.round(Number(value));
  if(!Number.isFinite(next) || next<=0){rowErrors.value={...rowErrors.value,[Number(row.id)]:'Enter a positive number of minutes before marking this row done.'};return;}
  minuteDrafts.value={...minuteDrafts.value,[Number(row.id)]:String(next)};
  if(next===Number(row.unit_count)){rowErrors.value={...rowErrors.value,[Number(row.id)]:''};failedChanges.delete(Number(row.id));return;}
  queueProcessingSave(row,{unitCount:next});
};
const retryRow=row=>{const changes=failedChanges.get(Number(row.id));if(changes)queueProcessingSave(row,changes);};
const toggleProcessed = (row,done) => {
  if(rowErrors.value[Number(row.id)])return;
  // A click immediately after editing minutes queues behind that save.
  queueProcessingSave(row,{processed:!!done});
};

watch(() => [props.periodId, props.initialImportId], () => {
  selectedDraftIds.value = [];
  showReviewedDrafts.value = false;
  selectedImportId.value = Number(props.initialImportId) || null;
  search.value = '';
  reload();
});

watch(() => props.initialMode, (m) => {
  if (m) setMode(m);
});

const focusPending = async () => {
  search.value = '';
  rowLimit.value = 200;
  if (mode.value === 'draft_audit') rowFilter.value = 'pending_review';
  if (props.catchUpMode && String(mode.value).startsWith('process_')) rowFilter.value = 'catchup_focus';
  await nextTick();
  const row = panelElement.value?.querySelector('[data-pending="true"]');
  row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  row?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus();
};

defineExpose({ refresh: reload, reload, getReviewState: () => reviewState.value, focusPending });

onMounted(reload);
</script>

<style scoped>
.rip-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
}
.rip-panel--guided { min-height: 0; }
.rip-panel--guided .rip-table-wrap { max-height: min(65vh, 720px); }
.rip-review-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff8e8;
  color: #7c4a03;
}
.rip-review-actions { display: flex; gap: 6px; }
.rip-reviewed { color: #21704b; font-weight: 600; }
.rip-tab-count {
  display: inline-flex;
  justify-content: center;
  min-width: 20px;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  color: #8a4b00;
  background: #ffedbd;
}
.rip-tab--attention { animation: rip-attention 1.5s ease-in-out 3; }
.rip-table tr[data-pending="true"]:focus-within td { background: #fff4d9; }
@keyframes rip-attention { 50% { background: #fff2d3; } }
@media (prefers-reduced-motion: reduce) { .rip-tab--attention { animation: none; } }
.rip-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.rip-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 2px solid var(--border, #e2e8f0);
  margin: -4px 0 0;
}
.rip-tab {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.rip-tab:hover {
  color: var(--pr-forest, #2d5a3d);
}
.rip-tab.active {
  color: var(--pr-forest, #2d5a3d);
  border-bottom-color: var(--pr-forest, #2d5a3d);
}
.rip-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-primary, #1D2633);
}
.rip-hint {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-top: 4px;
  max-width: 720px;
}
.rip-period {
  margin-top: 6px;
  font-size: 13px;
}
.rip-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rip-header-actions .btn.active {
  background: #1E3A34;
  border-color: #1E3A34;
  color: #fff;
}
.rip-controls {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
}
.field select,
.field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #fff;
  font: inherit;
}
.rip-table-wrap {
  overflow: auto;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  max-height: min(55vh, 560px);
}
.rip-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rip-table th,
.rip-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  text-align: left;
  white-space: nowrap;
}
.rip-table th {
  background: #f8faf9;
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
}
.rip-table .right { text-align: right; }
.rip-table tr.unpaid td { background: rgba(255, 193, 7, 0.12); }
.rip-sort{border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer}.rip-saved{color:#21704b;font-weight:600}
.rip-num {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  text-align: right;
}
.rip-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  font-weight: 700;
}
.rip-muted { color: var(--text-secondary, #64748b); font-size: 13px; }
.rip-payable { color: #15803d; }
.rip-unpayable { color: #b45309; }
.rip-paid-run1 { color: #64748b; }
.rip-error {
  background: #fee;
  border: 1px solid #fcc;
  padding: 8px 10px;
  border-radius: 8px;
  color: #991b1b;
  font-size: 13px;
}
.rip-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.btn {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  cursor: pointer;
}
.btn-sm { padding: 4px 8px; font-size: 12px; }
.btn-secondary:hover { background: #E8F5E9; }
@media (max-width: 900px) {
  .rip-controls { grid-template-columns: 1fr 1fr; }
}
</style>
