<template>
  <div class="ih-overlay" @click.self="emit('close')">
    <div class="ih-drawer" role="dialog" aria-modal="true">
      <header class="ih-head">
        <div>
          <h2>{{ mode === 'tests' ? 'Show Tests' : 'Show Duplicates' }}</h2>
          <p class="ih-sub">{{ subtitle }}</p>
        </div>
        <button type="button" class="ih-close" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="ih-empty">Scanning…</p>
      <p v-else-if="error" class="ih-error">{{ error }}</p>

      <template v-else-if="mode === 'duplicates'">
        <p v-if="!groups.length" class="ih-empty">No likely duplicates found.</p>
        <article v-for="group in groups" :key="group.proposedKeepId + '-' + group.matchPercent" class="ih-card">
          <header class="ih-card-head">
            <strong>{{ groupLabel(group) }}</strong>
            <span class="ih-pct">{{ group.matchPercent }}% match</span>
          </header>
          <table class="ih-table">
            <thead>
              <tr>
                <th>Keep</th>
                <th>Name</th>
                <th>Email / code</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in group.members"
                :key="m.id"
                :class="{ 'ih-keep': Number(keepByGroup[groupKey(group)]) === Number(m.id) }"
              >
                <td>
                  <input
                    type="radio"
                    :name="groupKey(group)"
                    :checked="Number(keepByGroup[groupKey(group)]) === Number(m.id)"
                    @change="keepByGroup[groupKey(group)] = m.id"
                  />
                </td>
                <td>{{ memberName(m) }}</td>
                <td>{{ m.email || m.identifier_code || '—' }}</td>
                <td>{{ m.status || '—' }}</td>
                <td>{{ formatDate(m.created_at) }}</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="btn btn-primary btn-sm" @click="openMerge(group)">Review merge</button>
        </article>
      </template>

      <template v-else>
        <div class="ih-test-bar">
          <span>{{ accounts.length }} possible test/demo accounts</span>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!selectedIds.length" @click="markSelectedDemo(true)">
            Mark selected as demo
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!selectedIds.length" @click="markSelectedDemo(false)">
            Unmark demo
          </button>
        </div>
        <p v-if="!accounts.length" class="ih-empty">No test-looking accounts in this panel.</p>
        <table v-else class="ih-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" :checked="allSelected" @change="toggleAllTests" />
              </th>
              <th>Name</th>
              <th>Why it was flagged</th>
              <th>Demo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in accounts" :key="row.id" :class="{ 'ih-auto': row.autoSelected }">
              <td>
                <input type="checkbox" :checked="selected.has(row.id)" @change="toggleSelect(row.id)" />
              </td>
              <td>
                <strong>{{ memberName(row) }}</strong>
                <div class="ih-meta">{{ row.email || row.organization_name || '' }}</div>
              </td>
              <td>{{ (row.reasons || []).join(' · ') }}</td>
              <td>
                <label class="ih-demo">
                  <input type="checkbox" :checked="!!row.is_demo" @change="toggleDemo(row, $event.target.checked)" />
                  Demo
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

    <div v-if="mergePreview" class="ih-merge" @click.self="mergePreview = null">
      <div class="ih-merge-card">
        <h3>Smart merge</h3>
        <p class="ih-sub">
          Newest filled data is selected by default. Change a field to override. Highlighted rows are the values that will be saved on the kept record.
        </p>
        <table class="ih-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Keep</th>
              <th v-for="o in mergePreview.others" :key="o.id">#{{ o.id }}</th>
              <th>Will save</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in mergePreview.fields" :key="field.key" :class="{ 'ih-highlight': field.highlighted }">
              <td>{{ field.label }}</td>
              <td>
                <label>
                  <input
                    type="radio"
                    :name="'f-' + field.key"
                    :checked="Number(fieldChoices[field.key] || mergeKeepId) === Number(mergeKeepId)"
                    @change="chooseField(field.key, mergeKeepId)"
                  />
                  {{ displayVal(field.keepValue) }}
                </label>
              </td>
              <td v-for="ov in field.otherValues" :key="ov.id">
                <label>
                  <input
                    type="radio"
                    :name="'f-' + field.key"
                    :checked="Number(fieldChoices[field.key]) === Number(ov.id)"
                    @change="chooseField(field.key, ov.id)"
                  />
                  {{ displayVal(ov.value) }}
                </label>
              </td>
              <td><strong>{{ displayVal(field.chosenValue) }}</strong> <span class="ih-reason">{{ field.reason }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-if="mergeError" class="ih-error">{{ mergeError }}</p>
        <div class="ih-merge-actions">
          <button type="button" class="btn btn-secondary" @click="mergePreview = null">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="merging" @click="applyMerge">
            {{ merging ? 'Merging…' : 'Merge into keep record' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  persona: { type: String, required: true },
  mode: { type: String, required: true },
  agencyId: { type: [String, Number], default: null }
});
const emit = defineEmits(['close', 'changed']);

const loading = ref(false);
const error = ref('');
const groups = ref([]);
const accounts = ref([]);
const keepByGroup = reactive({});
const selected = ref(new Set());
const mergePreview = ref(null);
const mergeKeepId = ref(null);
const mergeSourceIds = ref([]);
const fieldChoices = reactive({});
const merging = ref(false);
const mergeError = ref('');

const apiBase = computed(() => (props.persona === 'clients' ? '/clients' : '/users'));

const subtitle = computed(() => {
  if (props.mode === 'tests') {
    return 'Hogwarts, known demo names, test switcher, no-login demo accounts, and people already taken off disclosure. False positives are OK — uncheck Demo.';
  }
  return 'Possible duplicates with a match percent. Review the smart merge; newest filled values win unless you override.';
});

const selectedIds = computed(() => [...selected.value]);
const allSelected = computed(() => accounts.value.length && accounts.value.every((a) => selected.value.has(a.id)));

function groupKey(group) {
  return `g-${(group.members || []).map((m) => m.id).join('-')}`;
}
function memberName(m) {
  if (m.full_name) return m.full_name;
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || `Record #${m.id}`;
}
function groupLabel(group) {
  return memberName(group.members?.[0] || {});
}
function formatDate(raw) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString();
  } catch {
    return String(raw);
  }
}
function displayVal(v) {
  if (v == null || String(v).trim() === '') return '—';
  return String(v);
}

function queryParams() {
  const params = { persona: props.persona };
  if (props.agencyId) params.agencyId = props.agencyId;
  return params;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (props.mode === 'duplicates') {
      const res = await api.get(`${apiBase.value}/duplicates`, { params: queryParams() });
      groups.value = res.data?.groups || [];
      for (const g of groups.value) {
        keepByGroup[groupKey(g)] = g.proposedKeepId;
      }
    } else {
      const res = await api.get(`${apiBase.value}/tests`, { params: queryParams() });
      accounts.value = res.data?.accounts || [];
      const next = new Set();
      for (const row of accounts.value) {
        if (row.autoSelected || row.is_demo) next.add(row.id);
      }
      selected.value = next;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load this review.';
  } finally {
    loading.value = false;
  }
}

async function openMerge(group) {
  const keepId = Number(keepByGroup[groupKey(group)] || group.proposedKeepId);
  const sourceIds = (group.members || []).map((m) => m.id).filter((id) => Number(id) !== keepId);
  mergeKeepId.value = keepId;
  mergeSourceIds.value = sourceIds;
  mergeError.value = '';
  Object.keys(fieldChoices).forEach((k) => delete fieldChoices[k]);
  const res = await api.post(`${apiBase.value}/merge/preview`, {
    persona: props.persona,
    keepId,
    sourceIds,
    fieldChoices: {}
  });
  mergePreview.value = res.data;
}

async function chooseField(key, recordId) {
  fieldChoices[key] = recordId;
  const res = await api.post(`${apiBase.value}/merge/preview`, {
    persona: props.persona,
    keepId: mergeKeepId.value,
    sourceIds: mergeSourceIds.value,
    fieldChoices: { ...fieldChoices }
  });
  mergePreview.value = res.data;
}

async function applyMerge() {
  merging.value = true;
  mergeError.value = '';
  try {
    await api.post(`${apiBase.value}/merge`, {
      persona: props.persona,
      keepId: mergeKeepId.value,
      sourceIds: mergeSourceIds.value,
      fieldChoices: { ...fieldChoices }
    });
    mergePreview.value = null;
    emit('changed');
    await load();
  } catch (e) {
    mergeError.value = e.response?.data?.error?.message || 'Merge failed.';
  } finally {
    merging.value = false;
  }
}

function toggleSelect(id) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
function toggleAllTests(e) {
  selected.value = e.target.checked ? new Set(accounts.value.map((a) => a.id)) : new Set();
}

async function toggleDemo(row, on) {
  const path = props.persona === 'clients' ? `/clients/${row.id}/demo` : `/users/${row.id}/demo`;
  await api.patch(path, { isDemo: on });
  row.is_demo = on;
  emit('changed');
}

async function markSelectedDemo(on) {
  await api.post(`${apiBase.value}/demo/bulk`, {
    persona: props.persona,
    ids: selectedIds.value,
    isDemo: on
  });
  for (const row of accounts.value) {
    if (selected.value.has(row.id)) row.is_demo = on;
  }
  emit('changed');
}

watch(() => [props.mode, props.persona, props.agencyId], load);
onMounted(load);
</script>

<style scoped>
.ih-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 80;
  display: flex;
  justify-content: flex-end;
}
.ih-drawer {
  width: min(920px, 100%);
  height: 100%;
  overflow: auto;
  background: #fff;
  padding: 20px 22px 40px;
  box-shadow: -12px 0 40px rgba(15, 23, 42, 0.18);
}
.ih-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.ih-head h2 { margin: 0; font-size: 1.25rem; }
.ih-sub { margin: 6px 0 0; color: #64748b; font-size: 0.9rem; }
.ih-close { border: 0; background: none; font-size: 1.6rem; cursor: pointer; line-height: 1; }
.ih-empty, .ih-error { margin: 12px 0; }
.ih-error { color: #b91c1c; }
.ih-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.ih-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ih-pct { font-weight: 800; color: #c2410c; }
.ih-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.ih-table th, .ih-table td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; vertical-align: top; }
.ih-keep { background: #ecfdf5; }
.ih-highlight { background: #fffbeb; }
.ih-auto { background: #f8fafc; }
.ih-test-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.ih-meta { color: #64748b; font-size: 0.78rem; }
.ih-demo { font-weight: 700; font-size: 0.8rem; }
.ih-merge {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
}
.ih-merge-card {
  background: #fff;
  border-radius: 16px;
  max-width: 1100px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  padding: 18px 20px;
}
.ih-reason { display: block; font-size: 0.72rem; color: #64748b; font-weight: 600; }
.ih-merge-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
:global([data-theme="dark"]) .ih-drawer,
:global([data-theme="dark"]) .ih-merge-card { background: #25282c; color: #e2e8f0; }
</style>
