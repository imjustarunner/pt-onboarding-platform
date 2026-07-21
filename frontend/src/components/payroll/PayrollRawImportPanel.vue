<template>
  <div class="rip-panel" :class="{ 'rip-panel--embedded': embedded }">
    <div class="rip-header">
      <div>
        <div class="rip-title">
          <span v-if="mode === 'draft_audit'">Raw Import (Draft Audit)</span>
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
          <span v-else-if="String(mode).startsWith('process_') && catchUpMode">
            Catch-up view defaults to unpaid rows. Use Show all if you need to see already-paid sessions.
          </span>
          <span v-else-if="String(mode).startsWith('process_')">
            Enter minutes and mark Done. Unpaid rows are included so values are ready when notes finalize.
          </span>
          <span v-else>Review rows that have been processed (Done).</span>
        </div>
        <div v-if="periodLabel" class="rip-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <div v-if="!embedded" class="rip-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'draft_audit' }" @click="setMode('draft_audit')">Draft Audit</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'process_h0031' }" @click="setMode('process_h0031')">H0031</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'process_h0032' }" @click="setMode('process_h0032')">H0032</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'process_h2014' }" @click="setMode('process_h2014')">H2014</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'process_90853' }" @click="setMode('process_90853')">90853</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'process_h2032' }" @click="setMode('process_h2032')">H2032</button>
        <button type="button" class="btn btn-secondary btn-sm" :class="{ active: mode === 'processed' }" @click="setMode('processed')">Processed</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Close</button>
      </div>
    </div>

    <!-- Embedded tab row: mode switcher shown as full-width tabs when inside wizard -->
    <div v-if="embedded" class="rip-tabs">
      <button type="button" class="rip-tab" :class="{ active: mode === 'draft_audit' }" @click="setMode('draft_audit')">Draft Audit</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'process_h0031' }" @click="setMode('process_h0031')">H0031</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'process_h0032' }" @click="setMode('process_h0032')">H0032</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'process_h2014' }" @click="setMode('process_h2014')">H2014</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'process_90853' }" @click="setMode('process_90853')">90853</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'process_h2032' }" @click="setMode('process_h2032')">H2032</button>
      <button type="button" class="rip-tab" :class="{ active: mode === 'processed' }" @click="setMode('processed')">Processed</button>
    </div>

    <div v-if="error" class="rip-error">{{ error }}</div>
    <div v-if="loading" class="rip-muted">Loading…</div>

    <template v-else>
      <div class="rip-controls">
        <div class="field">
          <label>Imported Snapshot</label>
          <select v-model="selectedImportId" @change="reload">
            <option v-for="imp in imports" :key="imp.id" :value="imp.id">{{ importLabel(imp) }}</option>
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input v-model="search" type="text" placeholder="Search provider / code / DOS…" />
        </div>
        <div class="field" v-if="mode === 'draft_audit' || (catchUpMode && String(mode).startsWith('process_'))">
          <label>Rows Filter</label>
          <select v-model="rowFilter">
            <option value="unpaid_only">Unpaid only (no note + draft unpaid)</option>
            <option v-if="mode === 'draft_audit'" value="draft_only">Draft only</option>
            <option value="all">Show all</option>
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <div class="rip-muted">{{ periodStatusLabel }}</div>
        </div>
      </div>

      <div class="rip-table-wrap">
        <table class="rip-table">
          <thead>
            <tr>
              <th>Provider Name</th>
              <th>Client</th>
              <th>Service Code</th>
              <th>DOS</th>
              <th class="right">Units</th>
              <th>Note Status</th>
              <th>Paid?</th>
              <th v-if="mode === 'draft_audit'">Draft Payable?</th>
              <th v-else>Process</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRows" :key="r.id" :class="{ unpaid: !willBePaid(r) && String(mode).startsWith('process_') }">
              <td>{{ r.provider_name || '—' }}</td>
              <td>{{ r.client_hint || '—' }}</td>
              <td>{{ r.service_code || '—' }}</td>
              <td>{{ String(r.service_date || '').slice(0, 10) || '—' }}</td>
              <td class="right">
                <template v-if="String(mode).startsWith('process_') && Number(r.requires_processing) === 1">
                  <input
                    type="number"
                    class="rip-num"
                    :value="r.unit_count"
                    :disabled="locked"
                    @change="updateMinutes(r, $event.target.value)"
                  />
                </template>
                <template v-else>{{ fmtNum(r.unit_count) }}</template>
              </td>
              <td><span class="rip-pill">{{ statusLabel(r) }}</span></td>
              <td><strong>{{ willBePaid(r) ? 'PAID' : 'UNPAID' }}</strong></td>
              <td v-if="mode === 'draft_audit'">
                <select
                  v-if="String(r.note_status || '').toUpperCase() === 'DRAFT'"
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
                <span class="rip-muted">{{ r.processed_at ? 'Done' : 'Not done' }}</span>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="margin-left: 8px;"
                  :disabled="locked || Number(r.requires_processing) !== 1"
                  @click="toggleProcessed(r, !r.processed_at)"
                >
                  {{ r.processed_at ? 'Undo' : 'Mark done' }}
                </button>
              </td>
            </tr>
            <tr v-if="!visibleRows.length">
              <td :colspan="mode === 'draft_audit' ? 8 : 8" class="rip-muted">No rows found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rip-footer">
        <span class="rip-muted">Showing {{ visibleRows.length }} of {{ filteredRows.length }} filtered rows ({{ rows.length }} total).</span>
        <button v-if="filteredRows.length > rowLimit" type="button" class="btn btn-secondary btn-sm" @click="rowLimit = filteredRows.length">Show all</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' },
  initialMode: { type: String, default: 'draft_audit' },
  /** When true (embedded in wizard), hides the mode-switch & close buttons from the header */
  embedded: { type: Boolean, default: false },
  /**
   * Wizard prior catch-up only: default to unpaid rows (same Paid?/UNPAID meaning as before).
   * Show all remains available. Does not change Payroll-page Raw Import.
   */
  catchUpMode: { type: Boolean, default: false }
});

defineEmits(['close', 'changed']);

const mode = ref(props.initialMode || 'draft_audit');
const loading = ref(false);
const error = ref('');
const rows = ref([]);
const imports = ref([]);
const selectedImportId = ref(null);
const search = ref('');
const rowFilter = ref('unpaid_only');
const rowLimit = ref(200);
const saving = ref(false);

const periodStatusLabel = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  if (st === 'posted' || st === 'finalized') return 'Posted (locked)';
  if (st === 'ran') return 'Ran';
  if (st === 'staged') return 'Staged';
  if (st === 'raw_imported') return 'Imported';
  return st || '—';
});

const locked = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

const willBePaid = (r) => {
  const st = String(r?.note_status || '').toUpperCase();
  if (st === 'NO_NOTE' || st === 'NONE' || !st) return false;
  if (st === 'DRAFT') return Number(r?.draft_payable) === 1;
  if (st === 'FINALIZED' || st === 'FINAL' || st === 'SIGNED') return true;
  return false;
};

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
      const hay = `${r.provider_name || ''} ${r.client_hint || ''} ${r.service_code || ''} ${r.service_date || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (mode.value === 'draft_audit') {
    if (rowFilter.value === 'unpaid_only') list = list.filter((r) => !willBePaid(r));
    else if (rowFilter.value === 'draft_only') list = list.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT');
  } else if (String(mode.value).startsWith('process_')) {
    const code = codeForMode(mode.value);
    list = list.filter((r) => Number(r.requires_processing) === 1 && String(r.service_code || '').toUpperCase().includes(String(code || '').toUpperCase()));
    // Wizard catch-up only: reuse the same unpaid filter Draft Audit already had (Show all still works).
    if (props.catchUpMode && rowFilter.value === 'unpaid_only') {
      list = list.filter((r) => !willBePaid(r));
    }
  } else if (mode.value === 'processed') {
    list = list.filter((r) => Number(r.requires_processing) === 1 && !!r.processed_at && willBePaid(r));
  }

  list.sort((a, b) => String(b.service_date || '').localeCompare(String(a.service_date || '')));
  return list;
});

const visibleRows = computed(() => (filteredRows.value || []).slice(0, rowLimit.value));

const setMode = (m) => {
  mode.value = m;
  rowLimit.value = 200;
  // Catch-up wizard: keep unpaid default when switching tabs (H0031 etc.).
  if (props.catchUpMode) rowFilter.value = 'unpaid_only';
};

watch(() => props.catchUpMode, (on) => {
  if (on) rowFilter.value = 'unpaid_only';
});

const reload = async () => {
  if (!props.periodId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}/raw-audit`, {
      params: {
        importId: selectedImportId.value || undefined
      }
    });
    imports.value = resp.data?.imports || [];
    selectedImportId.value = Number(resp.data?.selectedImportId || selectedImportId.value || 0) || (imports.value[imports.value.length - 1]?.id ?? null);
    rows.value = resp.data?.rows || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load raw audit';
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

const toggleDraftPayable = async (row, nextVal) => {
  if (!row?.id || locked.value || saving.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.patch(`/payroll/import-rows/${row.id}`, { draftPayable: !!nextVal });
    const idx = rows.value.findIndex((r) => Number(r.id) === Number(row.id));
    if (idx >= 0) rows.value[idx] = { ...rows.value[idx], draft_payable: nextVal ? 1 : 0 };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update draft payable';
  } finally {
    saving.value = false;
  }
};

const updateMinutes = async (row, nextValRaw) => {
  if (!row?.id || locked.value) return;
  const nextMinutes = Math.round(Number(nextValRaw));
  if (!Number.isFinite(nextMinutes) || nextMinutes <= 0) return;
  try {
    saving.value = true;
    error.value = '';
    await api.patch(`/payroll/import-rows/${row.id}`, { unitCount: nextMinutes });
    const idx = rows.value.findIndex((r) => Number(r.id) === Number(row.id));
    if (idx >= 0) rows.value[idx] = { ...rows.value[idx], unit_count: nextMinutes };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update minutes';
  } finally {
    saving.value = false;
  }
};

const toggleProcessed = async (row, nextDone) => {
  if (!row?.id || locked.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.patch(`/payroll/import-rows/${row.id}`, { processed: !!nextDone });
    const idx = rows.value.findIndex((r) => Number(r.id) === Number(row.id));
    if (idx >= 0) {
      rows.value[idx] = {
        ...rows.value[idx],
        processed_at: nextDone ? new Date().toISOString() : null
      };
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update processed';
  } finally {
    saving.value = false;
  }
};

watch(() => props.periodId, () => {
  selectedImportId.value = null;
  reload();
});

watch(() => props.initialMode, (m) => {
  if (m) mode.value = m;
});

onMounted(reload);
</script>

<style scoped>
.rip-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
}
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
