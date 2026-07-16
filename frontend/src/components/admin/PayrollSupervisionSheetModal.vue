<template>
  <div v-if="open" class="modal-backdrop" @click.self="requestClose">
    <div class="modal sup-sheet-modal" role="dialog" aria-labelledby="sup-sheet-title">
      <div class="modal-header">
        <div>
          <div id="sup-sheet-title" class="modal-title">Supervision Sheet</div>
          <div class="hint">
            Agency employees with a work email on file (school staff excluded). Edit individual and group
            supervision totals in one place. Changes adjust baseline hours and are logged in Audit Center.
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="requestClose" :disabled="saving">Close</button>
      </div>

      <div class="sup-sheet-toolbar">
        <div class="pr-search-wrap sup-sheet-search">
          <svg class="pr-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            v-model="search"
            type="text"
            class="pr-search-input"
            placeholder="Search employees…"
            :disabled="loading"
          />
        </div>
        <div class="sup-sheet-toolbar-actions">
          <label class="sup-filter-toggle hint">
            <input type="checkbox" v-model="prelicensedOnly" :disabled="loading" />
            Prelicensed only
          </label>
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

      <div v-if="loading && !rows.length" class="hint" style="margin-top: 16px;">Loading supervision hours…</div>
      <div v-else-if="!filteredRows.length" class="hint muted" style="margin-top: 16px;">
        {{ search.trim() || prelicensedOnly ? 'No employees match your filters.' : 'No employees found for this organization.' }}
      </div>
      <div v-else class="table-wrap sup-sheet-table-wrap" style="margin-top: 12px;">
        <table class="table sup-sheet-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th class="right">Individual (hrs)</th>
              <th class="right">Group (hrs)</th>
              <th class="right muted">Total</th>
              <th class="muted">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.userId"
              :class="{ 'sup-row-dirty': isDirty(row) }"
            >
              <td>
                <div class="sup-name">{{ formatName(row) }}</div>
                <div v-if="row.email" class="muted sup-email">{{ row.email }}</div>
              </td>
              <td class="right">
                <input
                  class="sup-hours-input"
                  type="number"
                  min="0"
                  step="0.25"
                  :value="row.individualHours"
                  @input="onIndividualInput(row, $event)"
                  :disabled="saving"
                />
              </td>
              <td class="right">
                <input
                  class="sup-hours-input"
                  type="number"
                  min="0"
                  step="0.25"
                  :value="row.groupHours"
                  @input="onGroupInput(row, $event)"
                  :disabled="saving"
                />
              </td>
              <td class="right muted">{{ fmtHours(Number(row.individualHours || 0) + Number(row.groupHours || 0)) }}</td>
              <td class="muted">
                <span v-if="row.isPrelicensed" class="sup-badge">Prelicensed</span>
                <span v-else>—</span>
              </td>
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
const prelicensedOnly = ref(true);
const rows = ref([]);
const originals = ref({});

const dirtyCount = computed(() => rows.value.filter((r) => isDirty(r)).length);

const filteredRows = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  let list = rows.value.slice();
  if (prelicensedOnly.value) {
    list = list.filter((r) => r.isPrelicensed || isDirty(r) || Number(r.individualHours || 0) > 0 || Number(r.groupHours || 0) > 0);
  }
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

function fmtHours(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x * 100) / 100);
}

function snapshotKey(row) {
  return `${Number(row.individualHours || 0)}|${Number(row.groupHours || 0)}`;
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

function onIndividualInput(row, e) {
  row.individualHours = parseHours(e?.target?.value);
  successMsg.value = '';
}

function onGroupInput(row, e) {
  row.groupHours = parseHours(e?.target?.value);
  successMsg.value = '';
}

function requestClose() {
  if (saving.value) return;
  if (dirtyCount.value > 0) {
    const ok = window.confirm('You have unsaved supervision changes. Close anyway?');
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
    const resp = await api.get('/payroll/supervision-sheet', { params: { agencyId: props.agencyId } });
    const accounts = Array.isArray(resp.data?.accounts) ? resp.data.accounts : [];
    rows.value = accounts.map((a) => ({
      userId: Number(a.userId),
      firstName: a.firstName || '',
      lastName: a.lastName || '',
      email: a.email || '',
      isPrelicensed: !!a.isPrelicensed,
      individualHours: Number(a.individualHours || 0),
      groupHours: Number(a.groupHours || 0)
    }));
    const snap = {};
    for (const r of rows.value) {
      snap[r.userId] = {
        individualHours: r.individualHours,
        groupHours: r.groupHours
      };
    }
    originals.value = snap;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load Supervision sheet';
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
        if (Number(r.individualHours || 0) !== Number(orig.individualHours || 0)) {
          payload.individualHours = Number(r.individualHours || 0);
        }
        if (Number(r.groupHours || 0) !== Number(orig.groupHours || 0)) {
          payload.groupHours = Number(r.groupHours || 0);
        }
        return payload;
      })
      .filter((u) => u.individualHours !== undefined || u.groupHours !== undefined);

    if (!updates.length) {
      successMsg.value = 'No hour changes to save.';
      return;
    }

    const resp = await api.put('/payroll/supervision-sheet', {
      agencyId: Number(props.agencyId),
      updates,
      note: 'Balance set via Supervision sheet'
    });
    const updatedCount = Number(resp.data?.updatedCount || 0);
    const failed = (resp.data?.results || []).filter((r) => r && r.ok === false);
    if (failed.length) {
      const firstErr = failed[0]?.error ? ` (${failed[0].error})` : '';
      error.value = `Saved ${updatedCount} update(s), but ${failed.length} failed${firstErr}.`;
    } else {
      successMsg.value = updatedCount
        ? `Saved ${updatedCount} supervision update${updatedCount === 1 ? '' : 's'}.`
        : 'No hours changed.';
    }
    emit('saved', { updatedCount });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save supervision hours';
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
.sup-sheet-modal {
  width: min(960px, 100%);
  max-height: min(88vh, 900px);
  display: flex;
  flex-direction: column;
}
.sup-sheet-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.sup-sheet-search {
  flex: 1 1 220px;
  min-width: 180px;
  position: relative;
}
.sup-sheet-search .pr-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  pointer-events: none;
}
.sup-sheet-search .pr-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px 8px 34px;
  border: 1px solid #c9d0d8;
  border-radius: 8px;
  font: inherit;
}
.sup-sheet-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sup-filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  white-space: nowrap;
}
.sup-sheet-table-wrap {
  overflow: auto;
  max-height: min(58vh, 560px);
}
.sup-sheet-table th.right,
.sup-sheet-table td.right {
  text-align: right;
}
.sup-name {
  font-weight: 600;
}
.sup-email {
  font-size: 0.85em;
  margin-top: 2px;
}
.sup-hours-input {
  width: 96px;
  text-align: right;
  padding: 6px 8px;
  border: 1px solid #c9d0d8;
  border-radius: 6px;
  font: inherit;
}
.sup-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #1e4d8c;
  background: #e8f1fb;
  border-radius: 999px;
  padding: 2px 8px;
}
.sup-row-dirty td {
  background: #fff8e8;
}
.sup-row-dirty .sup-hours-input {
  border-color: #d4a017;
  background: #fff;
}
</style>
