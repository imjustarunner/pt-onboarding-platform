<template>
  <div class="ppc">
    <div class="ppc-head">
      <div>
        <div class="ppc-title">Compare &amp; Add Late Notes</div>
        <div class="ppc-hint">
          Same as Process Changes on the Payroll page: compare prior Run 2 (and optional two-ago Run 3)
          against the DB baseline, then add selected differences into the current pay period.
        </div>
        <div v-if="destinationPeriodLabel" class="ppc-period">
          Destination (current): <strong>{{ destinationPeriodLabel }}</strong>
        </div>
      </div>
    </div>

    <div v-if="destPosted" class="ppc-warn">
      The destination pay period is posted/finalized. Choose a different current period before applying late notes.
    </div>

    <!-- Prior period: Run 2 vs Run 1 (DB baseline) -->
    <div class="ppc-card">
      <div class="ppc-card-title">Prior period — Run 2 vs Run 1</div>
      <div class="ppc-muted" v-if="priorPeriodLabel">
        Source: <strong>{{ priorPeriodLabel }}</strong>
        <span v-if="priorImportCount >= 1"> · Run 1 in DB</span>
        <span v-if="priorImportCount >= 2"> · Run 2 in DB</span>
      </div>
      <div v-else class="ppc-warn">No contiguous prior period found. Pick a current period with a prior, or use file compare below.</div>

      <div class="field" style="margin-top: 10px;">
        <label>Run 2 file (today’s export of prior period)</label>
        <input
          type="file"
          accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          :disabled="!priorPeriodId || loading"
          @change="onFilePick($event, 'priorRun2')"
        />
        <div v-if="files.priorRun2" class="ppc-muted" style="margin-top: 4px;">Selected: {{ files.priorRun2.name }}</div>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        style="margin-top: 10px;"
        :disabled="loading || !agencyId || !priorPeriodId || !files.priorRun2 || !destinationPeriodId || destPosted"
        @click="comparePriorRun2"
      >
        {{ loading && activeCompare === 'prior' ? 'Comparing…' : 'Compare Run 2 &amp; show differences' }}
      </button>
    </div>

    <!-- Two-ago: Run 3 vs Run 2 (DB baseline) — optional -->
    <div class="ppc-card" v-if="twoAgoPeriodId">
      <div class="ppc-card-title">Two periods ago — Run 3 vs Run 2 <span class="ppc-optional">(optional)</span></div>
      <div class="ppc-muted">
        Source: <strong>{{ twoAgoPeriodLabel || '—' }}</strong>
        <span v-if="twoAgoImportCount >= 2"> · Run 2 in DB</span>
        <span v-if="twoAgoImportCount >= 3"> · Run 3 in DB</span>
      </div>
      <div class="field" style="margin-top: 10px;">
        <label>Run 3 file (today’s export of two periods ago)</label>
        <input
          type="file"
          accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          :disabled="loading"
          @change="onFilePick($event, 'twoAgoRun3')"
        />
        <div v-if="files.twoAgoRun3" class="ppc-muted" style="margin-top: 4px;">Selected: {{ files.twoAgoRun3.name }}</div>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        style="margin-top: 10px;"
        :disabled="loading || !agencyId || !files.twoAgoRun3 || !destinationPeriodId || destPosted"
        @click="compareTwoAgoRun3"
      >
        {{ loading && activeCompare === 'twoAgo' ? 'Comparing…' : 'Compare Run 3 &amp; show differences' }}
      </button>
    </div>

    <!-- Results -->
    <div v-if="result && !result.applied" class="ppc-results">
      <div class="ppc-card-title">
        Differences for {{ destinationPeriodLabel || 'current period' }}
        <span class="ppc-muted" style="font-weight: 400; margin-left: 8px;">
          {{ selectedCount }} of {{ (result.carryoverApplied || []).length }} selected
        </span>
      </div>
      <div class="ppc-muted" style="margin-bottom: 8px;">
        {{ result.twoRunMode
          ? 'Late add: new in Run 2. Notes to be paid: no note or draft unpaid in Run 1 → finalized or draft in Run 2.'
          : 'Late add: new in Run 3. Notes to be paid: no note or draft unpaid in Run 2 → finalized or draft in Run 3.' }}
      </div>

      <div v-if="!(result.carryoverApplied || []).length" class="ppc-muted">
        No late-note differences to add from this compare.
      </div>

      <template v-else>
        <div class="ppc-actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || applying" @click="selectAll(true)">Select all</button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || applying" @click="selectAll(false)">Select none</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="applying || !destinationPeriodId || selectedCount === 0 || destPosted"
            @click="applySelected"
          >
            {{ applying ? 'Adding…' : 'Add selected to current period' }}
          </button>
        </div>
        <div class="ppc-table-wrap">
          <table class="ppc-table">
            <thead>
              <tr>
                <th style="width: 36px;"></th>
                <th>User</th>
                <th>Service</th>
                <th>Client</th>
                <th>DOS</th>
                <th>Type</th>
                <th class="right">Units</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in result.carryoverApplied"
                :key="rowKey(c)"
                :style="!rowSelected(c) ? { opacity: 0.5 } : {}"
              >
                <td>
                  <input type="checkbox" :checked="rowSelected(c)" @change="toggleRow(c, $event.target.checked)" />
                </td>
                <td>{{ c.providerName || `User #${c.userId}` }}</td>
                <td>{{ c.serviceCode }}</td>
                <td class="muted">{{ c.clientHint || '—' }}</td>
                <td class="muted">{{ ymd(c.serviceDate) || '—' }}</td>
                <td><span class="badge" :class="typeBadgeClass(c)">{{ typeLabel(c) }}</span></td>
                <td class="right">
                  <input
                    type="number"
                    :value="rowUnits(c)"
                    min="0"
                    step="0.01"
                    style="width: 80px; text-align: right;"
                    @input="setRowUnits(c, $event.target.value)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div v-if="(result.superFlagCount || 0) > 0" class="ppc-warn" style="margin-top: 10px;">
        <strong>No note ({{ result.superFlagCount }}):</strong> still unpaid across runs — address these before finishing payroll.
      </div>
      <div
        v-if="(result.h0031PendingCount || 0) + (result.h0032PendingCount || 0) + (result.h2014PendingCount || 0) + (result.h90853PendingCount || 0) + (result.h2032PendingCount || 0) > 0"
        class="ppc-warn"
        style="margin-top: 8px;"
      >
        {{ result.h0031PendingCount || 0 }} H0031,
        {{ result.h0032PendingCount || 0 }} H0032,
        {{ result.h2014PendingCount || 0 }} H2014,
        {{ result.h90853PendingCount || 0 }} 90853,
        {{ result.h2032PendingCount || 0 }} H2032
        rows need minutes updated (later wizard steps).
      </div>
    </div>

    <div v-if="result?.applied" class="ppc-ok">
      Added {{ result.carryoverRowsApplied }} row(s) to payroll staging
      <span v-if="destinationPeriodLabel"> for {{ destinationPeriodLabel }}</span>.
      You can mark this wizard step done and continue.
      <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 8px;" @click="reset">Compare again</button>
    </div>

    <div v-if="error" class="ppc-error">{{ error }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  destinationPeriodId: { type: [Number, String], default: null },
  destinationPeriodLabel: { type: String, default: '' },
  destinationPeriodStatus: { type: String, default: '' },
  priorPeriodId: { type: [Number, String], default: null },
  priorPeriodLabel: { type: String, default: '' },
  twoAgoPeriodId: { type: [Number, String], default: null },
  twoAgoPeriodLabel: { type: String, default: '' }
});

const emit = defineEmits(['applied']);

const files = ref({ priorRun2: null, twoAgoRun3: null });
const priorImportCount = ref(0);
const twoAgoImportCount = ref(0);
const loading = ref(false);
const applying = ref(false);
const activeCompare = ref('');
const error = ref('');
const result = ref(null);
const selection = ref({});
const activeSourcePeriodId = ref(null);

const destPosted = computed(() => {
  const s = String(props.destinationPeriodStatus || '').toLowerCase();
  return s === 'posted' || s === 'finalized';
});

const selectedCount = computed(() => {
  const applied = result.value?.carryoverApplied || [];
  let n = 0;
  for (const c of applied) if (rowSelected(c)) n += 1;
  return n;
});

const ymd = (v) => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const rowKey = (c) => `${c.userId}:${String(c.serviceCode || '').toUpperCase()}`;
const rowSelected = (c) => {
  const s = selection.value[rowKey(c)];
  return s ? s.selected : true;
};
const toggleRow = (c, checked) => {
  const k = rowKey(c);
  const base = selection.value[k] || { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
  selection.value = { ...selection.value, [k]: { ...base, selected: !!checked } };
};
const rowUnits = (c) => {
  const s = selection.value[rowKey(c)];
  return s ? s.units : Number(c.run2To3Units ?? c.totalUnits ?? 0);
};
const setRowUnits = (c, val) => {
  const k = rowKey(c);
  const base = selection.value[k] || { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
  selection.value = { ...selection.value, [k]: { ...base, units: Math.max(0, Number(val) || 0) } };
};
const selectAll = (on) => {
  const next = { ...selection.value };
  for (const c of result.value?.carryoverApplied || []) {
    const k = rowKey(c);
    const base = next[k] || { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
    next[k] = { ...base, selected: !!on };
  }
  selection.value = next;
};

const typeLabel = (c) => {
  const t = c.carryoverType || '';
  if (t === 'late_add') return 'Late add';
  if (t === 'old_note') return 'Notes to be paid';
  if (t === 'both') return 'Late add + notes to be paid';
  return '—';
};
const typeBadgeClass = (c) => {
  const t = c.carryoverType || '';
  if (t === 'late_add') return 'badge-info';
  if (t === 'old_note') return 'badge-warning';
  if (t === 'both') return 'badge-secondary';
  return '';
};

const onFilePick = (evt, slot) => {
  files.value = { ...files.value, [slot]: evt.target.files?.[0] || null };
  error.value = '';
};

const loadImportCounts = async () => {
  const loadOne = async (periodId) => {
    if (!periodId) return 0;
    try {
      const resp = await api.get(`/payroll/periods/${periodId}/imports`);
      return (resp.data?.imports || []).length;
    } catch {
      return 0;
    }
  };
  const [p, t] = await Promise.all([
    loadOne(props.priorPeriodId),
    loadOne(props.twoAgoPeriodId)
  ]);
  priorImportCount.value = p;
  twoAgoImportCount.value = t;
};

const initSelectionFromResult = (data) => {
  const applied = data?.carryoverApplied || [];
  const sel = {};
  for (const c of applied) {
    sel[rowKey(c)] = { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
  }
  selection.value = sel;
};

/** Same as PayrollView wizardRunBatchCatchUpDbBaseline / runBatchCatchUpDbBaseline. */
const compareWithDbBaseline = async ({ sourcePeriodId, file, which }) => {
  if (!props.agencyId || !sourcePeriodId || !file) return;
  loading.value = true;
  activeCompare.value = which;
  error.value = '';
  result.value = null;
  selection.value = {};
  activeSourcePeriodId.value = sourcePeriodId;
  try {
    const fd = new FormData();
    fd.append('file2', file);
    fd.append('agencyId', String(props.agencyId));
    fd.append('priorPeriodId', String(sourcePeriodId));
    fd.append('useDbBaseline', 'true');
    if (props.destinationPeriodId) fd.append('destinationPeriodId', String(props.destinationPeriodId));
    const resp = await api.post('/payroll/periods/batch-catch-up', fd);
    result.value = resp.data || null;
    initSelectionFromResult(result.value);
    await loadImportCounts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Compare failed';
  } finally {
    loading.value = false;
    activeCompare.value = '';
  }
};

const comparePriorRun2 = () => compareWithDbBaseline({
  sourcePeriodId: props.priorPeriodId,
  file: files.value.priorRun2,
  which: 'prior'
});

const compareTwoAgoRun3 = () => compareWithDbBaseline({
  sourcePeriodId: props.twoAgoPeriodId,
  file: files.value.twoAgoRun3,
  which: 'twoAgo'
});

/** Same as PayrollView applyBatchCatchUpToPeriod. */
const applySelected = async () => {
  const data = result.value;
  const destId = props.destinationPeriodId || data?.destinationPeriodId;
  if (!data || !destId) return;
  const applied = data.carryoverApplied || [];
  const rowsToApply = [];
  for (const c of applied) {
    if (!rowSelected(c)) continue;
    const units = rowUnits(c);
    if (!(units > 0)) continue;
    const row = (data.rowsForApply || []).find(
      (r) => Number(r.userId) === Number(c.userId)
        && String(r.serviceCode || '').toUpperCase() === String(c.serviceCode || '').toUpperCase()
    );
    rowsToApply.push({
      userId: c.userId,
      serviceCode: c.serviceCode,
      carryoverFinalizedUnits: units,
      carryoverFinalizedRowCount: row?.carryoverFinalizedRowCount ?? 1,
      carryoverMeta: row?.carryoverMeta ?? null
    });
  }
  if (!rowsToApply.length) return;

  applying.value = true;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${destId}/carryover/apply`, { rows: rowsToApply });
    result.value = { ...data, applied: true, carryoverRowsApplied: rowsToApply.length };
    emit('applied', { destinationPeriodId: destId, count: rowsToApply.length });
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || '';
    if (
      e?.response?.status === 409
      && /H0031|H0032|H2014|H2032|90853/.test(String(msg))
    ) {
      const ok = window.confirm(
        'Carryover is blocked by H0031/H0032/H2014/H2032/90853 processing. Apply anyway (skip processing gate)?'
      );
      if (ok) {
        await api.post(
          `/payroll/periods/${destId}/carryover/apply`,
          { rows: rowsToApply },
          { params: { skipProcessingGate: 'true' } }
        );
        result.value = { ...data, applied: true, carryoverRowsApplied: rowsToApply.length };
        emit('applied', { destinationPeriodId: destId, count: rowsToApply.length });
      } else {
        error.value = msg;
      }
    } else {
      error.value = msg || 'Failed to add to current period';
    }
  } finally {
    applying.value = false;
  }
};

const reset = () => {
  result.value = null;
  selection.value = {};
  error.value = '';
  activeSourcePeriodId.value = null;
};

watch(
  () => [props.priorPeriodId, props.twoAgoPeriodId],
  () => { loadImportCounts(); },
  { immediate: false }
);

onMounted(() => {
  loadImportCounts();
});
</script>

<style scoped>
.ppc { display: flex; flex-direction: column; gap: 14px; }
.ppc-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ppc-title { font-weight: 700; font-size: 1.05rem; }
.ppc-hint { color: var(--muted, #667085); font-size: 0.9rem; margin-top: 4px; line-height: 1.4; }
.ppc-period { margin-top: 8px; font-size: 0.9rem; }
.ppc-card {
  border: 1px solid var(--border, #e4e7ec);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--surface, #fff);
}
.ppc-card-title { font-weight: 650; margin-bottom: 4px; }
.ppc-optional { font-weight: 400; color: var(--muted, #667085); font-size: 0.85em; }
.ppc-muted { color: var(--muted, #667085); font-size: 0.88rem; }
.ppc-warn {
  background: #fff8e6;
  border: 1px solid #f0d78c;
  color: #7a5b00;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.ppc-error {
  background: #fef3f2;
  border: 1px solid #fecdca;
  color: #b42318;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.ppc-ok {
  background: #ecfdf3;
  border: 1px solid #abefc6;
  color: #13532b;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.ppc-results { display: flex; flex-direction: column; gap: 8px; }
.ppc-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.ppc-table-wrap { overflow: auto; border: 1px solid var(--border, #e4e7ec); border-radius: 8px; }
.ppc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.ppc-table th, .ppc-table td { padding: 8px 10px; border-bottom: 1px solid var(--border, #eef0f4); text-align: left; }
.ppc-table th.right, .ppc-table td.right { text-align: right; }
.ppc-table .muted { color: var(--muted, #667085); }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: #f2f4f7;
  color: #344054;
}
.badge-info { background: #eff8ff; color: #175cd3; }
.badge-warning { background: #fffaeb; color: #b54708; }
.badge-secondary { background: #f4f3ff; color: #5925dc; }
.field label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
</style>
