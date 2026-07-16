<template>
  <div v-if="open" class="modal-backdrop" @click.self="requestClose">
    <div class="modal pto-sheet-modal" role="dialog" aria-labelledby="pto-sheet-title">
      <div class="modal-header">
        <div>
          <div id="pto-sheet-title" class="modal-title">PTO Sheet</div>
          <div class="hint">
            Agency employees with a work email on file (school staff excluded). Company email is shown when available.
            Changes are saved to the PTO ledger and Audit Center.
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="requestClose" :disabled="saving">Close</button>
      </div>

      <div class="pto-sheet-toolbar">
        <div class="pr-search-wrap pto-sheet-search">
          <svg class="pr-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            v-model="search"
            type="text"
            class="pr-search-input"
            placeholder="Search employees…"
            :disabled="loading"
          />
        </div>
        <div class="pto-sheet-toolbar-actions">
          <span v-if="dirtyCount" class="hint">{{ dirtyCount }} unsaved change{{ dirtyCount === 1 ? '' : 's' }}</span>
          <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading || saving || !agencyId">
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
          <button
            class="btn btn-primary btn-sm"
            type="button"
            @click="save"
            :disabled="saving || loading || !dirtyCount || !agencyId"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="warn-box" style="margin-top: 10px;">{{ error }}</div>
      <div v-if="successMsg" class="hint" style="margin-top: 10px; color: #1b6b3a;">{{ successMsg }}</div>

      <div v-if="loading && !rows.length" class="hint" style="margin-top: 16px;">Loading PTO balances…</div>
      <div v-else-if="!filteredRows.length" class="hint muted" style="margin-top: 16px;">
        {{ search.trim() ? 'No employees match your search.' : 'No employees found for this organization.' }}
      </div>
      <div v-else class="table-wrap pto-sheet-table-wrap" style="margin-top: 12px;">
        <table class="table pto-sheet-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th class="right">Sick (hrs)</th>
              <th v-if="trainingEnabled" class="right">Training (hrs)</th>
              <th class="muted">Employment</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.userId"
              :class="{ 'pto-row-dirty': isDirty(row) }"
            >
              <td>
                <div class="pto-name">{{ formatName(row) }}</div>
                <div v-if="row.email" class="muted pto-email">{{ row.email }}</div>
              </td>
              <td class="right">
                <input
                  class="pto-hours-input"
                  type="number"
                  min="0"
                  step="0.25"
                  :value="row.sickBalanceHours"
                  @input="onSickInput(row, $event)"
                  :disabled="saving"
                />
              </td>
              <td v-if="trainingEnabled" class="right">
                <input
                  v-if="row.trainingPtoEligible"
                  class="pto-hours-input"
                  type="number"
                  min="0"
                  step="0.25"
                  :value="row.trainingBalanceHours"
                  @input="onTrainingInput(row, $event)"
                  :disabled="saving"
                />
                <span v-else class="muted">—</span>
              </td>
              <td class="muted">{{ employmentLabel(row.employmentType) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'saved']);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const successMsg = ref('');
const search = ref('');
const policy = ref(null);
const rows = ref([]);
const originals = ref({});

const trainingEnabled = computed(() => policy.value?.trainingPtoEnabled === true);

const dirtyCount = computed(() => rows.value.filter((r) => isDirty(r)).length);

const filteredRows = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  const list = rows.value.slice();
  if (!q) return list;
  return list.filter((r) => {
    const name = `${r.lastName || ''} ${r.firstName || ''} ${r.email || ''}`.toLowerCase();
    return name.includes(q);
  });
});

function formatName(row) {
  const last = String(row.lastName || '').trim();
  const first = String(row.firstName || '').trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || `User #${row.userId}`;
}

function employmentLabel(type) {
  const t = String(type || 'hourly');
  if (t === 'fee_for_service') return 'Fee-for-service';
  if (t === 'salaried') return 'Salaried';
  return 'Hourly';
}

function snapshotKey(row) {
  return `${Number(row.sickBalanceHours || 0)}|${Number(row.trainingBalanceHours || 0)}`;
}

function isDirty(row) {
  const orig = originals.value[row.userId];
  if (!orig) return false;
  return snapshotKey(row) !== snapshotKey(orig);
}

function parseHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function onSickInput(row, e) {
  row.sickBalanceHours = parseHours(e?.target?.value);
  successMsg.value = '';
}

function onTrainingInput(row, e) {
  row.trainingBalanceHours = parseHours(e?.target?.value);
  successMsg.value = '';
}

function requestClose() {
  if (saving.value) return;
  if (dirtyCount.value > 0) {
    const ok = window.confirm('You have unsaved PTO changes. Close anyway?');
    if (!ok) return;
  }
  emit('close');
}

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  successMsg.value = '';
  try {
    const resp = await api.get('/payroll/pto-accounts', { params: { agencyId: props.agencyId } });
    const accounts = Array.isArray(resp.data?.accounts) ? resp.data.accounts : [];
    policy.value = resp.data?.policy || null;
    rows.value = accounts.map((a) => ({
      userId: Number(a.userId),
      firstName: a.firstName || '',
      lastName: a.lastName || '',
      email: a.email || '',
      employmentType: a.employmentType || 'hourly',
      trainingPtoEligible: !!a.trainingPtoEligible,
      sickBalanceHours: Number(a.sickBalanceHours || 0),
      trainingBalanceHours: Number(a.trainingBalanceHours || 0)
    }));
    const snap = {};
    for (const r of rows.value) {
      snap[r.userId] = {
        sickBalanceHours: r.sickBalanceHours,
        trainingBalanceHours: r.trainingBalanceHours
      };
    }
    originals.value = snap;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO sheet';
    rows.value = [];
    originals.value = {};
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!props.agencyId || !dirtyCount.value) return;
  saving.value = true;
  error.value = '';
  successMsg.value = '';
  try {
    const updates = rows.value
      .filter((r) => isDirty(r))
      .map((r) => {
        const orig = originals.value[r.userId] || {};
        const payload = { userId: r.userId };
        if (Number(r.sickBalanceHours || 0) !== Number(orig.sickBalanceHours || 0)) {
          payload.sickBalanceHours = Number(r.sickBalanceHours || 0);
        }
        if (
          trainingEnabled.value &&
          r.trainingPtoEligible &&
          Number(r.trainingBalanceHours || 0) !== Number(orig.trainingBalanceHours || 0)
        ) {
          payload.trainingBalanceHours = Number(r.trainingBalanceHours || 0);
        }
        return payload;
      })
      .filter((u) => u.sickBalanceHours !== undefined || u.trainingBalanceHours !== undefined);

    if (!updates.length) {
      successMsg.value = 'No balance changes to save.';
      return;
    }

    const resp = await api.put('/payroll/pto-accounts', {
      agencyId: Number(props.agencyId),
      updates,
      note: 'Balance set via PTO sheet'
    });
    const updatedCount = Number(resp.data?.updatedCount || 0);
    const failed = (resp.data?.results || []).filter((r) => r && r.ok === false);
    if (failed.length) {
      error.value = `Saved ${updatedCount} update(s), but ${failed.length} failed.`;
    } else {
      successMsg.value = updatedCount
        ? `Saved ${updatedCount} PTO balance update${updatedCount === 1 ? '' : 's'}.`
        : 'No balances changed.';
    }
    emit('saved', { updatedCount });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save PTO balances';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.open, props.agencyId],
  ([isOpen]) => {
    if (isOpen) {
      search.value = '';
      load();
    }
  }
);
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
  overflow: auto;
}
.modal {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  padding: 16px 18px 18px;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.modal-title {
  font-size: 1.15rem;
  font-weight: 700;
}
.hint {
  margin-top: 4px;
  color: #5b6472;
  font-size: 0.9rem;
  line-height: 1.35;
}
.warn-box {
  border: 1px solid #f0c2c2;
  background: #fff1f1;
  color: #8a1f1f;
  border-radius: 8px;
  padding: 10px 12px;
}
.table-wrap {
  border: 1px solid #e5e9ef;
  border-radius: 8px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eef1f5;
  text-align: left;
  vertical-align: middle;
}
.table th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #5b6472;
  background: #f7f9fb;
  position: sticky;
  top: 0;
  z-index: 1;
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.muted {
  color: #6b7280;
}
.pto-sheet-modal {
  width: min(920px, 100%);
  max-height: min(88vh, 900px);
  display: flex;
  flex-direction: column;
}
.pto-sheet-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.pto-sheet-search {
  flex: 1 1 220px;
  min-width: 180px;
  position: relative;
}
.pto-sheet-search .pr-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  pointer-events: none;
}
.pto-sheet-search .pr-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px 8px 34px;
  border: 1px solid #c9d0d8;
  border-radius: 8px;
  font: inherit;
}
.pto-sheet-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.pto-sheet-table-wrap {
  overflow: auto;
  max-height: min(58vh, 560px);
}
.pto-sheet-table th.right,
.pto-sheet-table td.right {
  text-align: right;
}
.pto-name {
  font-weight: 600;
}
.pto-email {
  font-size: 0.85em;
  margin-top: 2px;
}
.pto-hours-input {
  width: 96px;
  text-align: right;
  padding: 6px 8px;
  border: 1px solid #c9d0d8;
  border-radius: 6px;
  font: inherit;
}
.pto-row-dirty td {
  background: #fff8e8;
}
.pto-row-dirty .pto-hours-input {
  border-color: #d4a017;
  background: #fff;
}
</style>
