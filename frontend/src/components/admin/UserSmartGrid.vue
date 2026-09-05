<template>
  <div class="roster">
    <div class="roster-toolbar">
      <label class="roster-search">
        <span>Search this roster</span>
        <input v-model="search" type="search" placeholder="LPCC, last name, date…" autocomplete="off" />
      </label>
      <button type="button" class="btn btn-secondary btn-sm" @click="pickerOpen = !pickerOpen">
        Columns ({{ selectedKeys.length }}/{{ maxColumns }})
      </button>
      <label class="roster-picker-item">
        <input v-model="includeArchived" type="checkbox" />
        Include archived
      </label>
      <span class="muted">{{ visibleRows.length }} people</span>
      <span v-if="savingCount" class="muted">Saving…</span>
      <span v-if="banner" class="roster-banner" :class="{ error: bannerError }">{{ banner }}</span>
    </div>

    <div v-if="pickerOpen" class="roster-picker">
      <p class="muted">Choose up to {{ maxColumns }} columns. Name stays frozen on the left.</p>
      <p v-if="emailSignatureGuidance" class="muted roster-sig-hint">{{ emailSignatureGuidance }}</p>
      <div class="roster-picker-grid">
        <div v-for="group in fieldGroups" :key="group.name" class="roster-picker-group">
          <div class="roster-picker-group-title">{{ group.name }}</div>
          <label v-for="f in group.fields" :key="f.key" class="roster-picker-item">
            <input
              type="checkbox"
              :checked="selectedKeys.includes(f.key)"
              :disabled="!selectedKeys.includes(f.key) && selectedKeys.length >= maxColumns"
              @change="toggleField(f.key, $event.target.checked)"
            />
            <span>{{ f.label }}</span>
            <span v-if="f.needsAgency && !agencyId" class="muted"> (pick an agency)</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="!viewOnly && selectedIds.size" class="roster-bulk">
      <span>{{ selectedIds.size }} selected</span>
      <select v-model="bulkField" class="filter-select">
        <option value="">Set column…</option>
        <option v-for="f in editableSelectedFields" :key="f.key" :value="f.key">{{ f.label }}</option>
      </select>
      <template v-if="bulkFieldDef">
        <input
          v-if="bulkFieldDef.type === 'text' || bulkFieldDef.type === 'url'"
          v-model="bulkValue"
          class="filter-input"
          type="text"
          placeholder="Value for everyone selected"
        />
        <input
          v-else-if="bulkFieldDef.type === 'date'"
          v-model="bulkValue"
          class="filter-input"
          type="date"
        />
        <select
          v-else-if="bulkFieldDef.type === 'select'"
          v-model="bulkValue"
          class="filter-select"
        >
          <option value="">—</option>
          <option v-for="opt in optionsFor(bulkFieldDef)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label v-else-if="bulkFieldDef.type === 'boolean'" class="roster-picker-item">
          <input v-model="bulkBool" type="checkbox" />
          On for all selected
        </label>
        <button type="button" class="btn btn-primary btn-sm" :disabled="bulkSaving" @click="applyBulk">
          {{ bulkSaving ? 'Applying…' : 'Apply to selected' }}
        </button>
      </template>
      <button v-if="canArchive" type="button" class="btn btn-secondary btn-sm" :disabled="bulkSaving" @click="bulkArchive">Archive selected</button>
      <button v-if="canDelete" type="button" class="btn btn-danger btn-sm" :disabled="bulkSaving" @click="bulkDelete">Delete selected</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="clearSelection">Clear</button>
    </div>

    <div v-if="loading" class="loading">Loading roster…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="roster-scroller">
      <table class="roster-table">
        <thead>
          <tr>
            <th v-if="!viewOnly" class="col-check sticky-col">
              <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAll" />
            </th>
            <th class="col-name sticky-col sticky-name sortable" @click="toggleSort('name')">
              Name <span>{{ sortMark('name') }}</span>
            </th>
            <th
              v-for="f in selectedFields"
              :key="f.key"
              class="sortable"
              @click="f.sortable !== false && toggleSort(f.key)"
            >
              {{ f.label }} <span>{{ sortMark(f.key) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.id" :class="{ selected: selectedIds.has(row.id) }">
            <td v-if="!viewOnly" class="col-check sticky-col">
              <input type="checkbox" :checked="selectedIds.has(row.id)" @change="toggleRow(row.id, $event.target.checked)" />
            </td>
            <td class="col-name sticky-col sticky-name">
              <router-link :to="profilePath(row.id)" class="name-link">{{ displayName(row) }}</router-link>
              <div class="muted name-sub">{{ row.email }}</div>
            </td>
            <td v-for="f in selectedFields" :key="`${row.id}-${f.key}`">
              <template v-if="f.type === 'file'">
                <div class="file-cell">
                  <img
                    v-if="f.key === 'email_signature' && fileUrl(row, f)"
                    :src="fileUrl(row, f)"
                    alt=""
                    class="sig-thumb"
                  />
                  <span v-if="fileName(row, f)" class="file-name" :title="fileName(row, f)">{{ fileName(row, f) }}</span>
                  <span v-else class="muted" :title="f.guidance || f.hint || ''">None</span>
                  <label
                    v-if="!viewOnly"
                    class="btn btn-secondary btn-sm file-btn"
                    :title="f.guidance || f.hint || 'Upload file'"
                  >
                    {{ f.key === 'email_signature' && fileName(row, f) ? 'Replace' : 'Upload' }}
                    <input
                      type="file"
                      hidden
                      :accept="f.accept || undefined"
                      @change="onFile(row, f, $event)"
                    />
                  </label>
                </div>
              </template>
              <input
                v-else-if="!viewOnly && f.editable !== false && (f.type === 'text' || f.type === 'url')"
                class="cell-input"
                type="text"
                :value="cellValue(row, f)"
                @change="onText(row, f, $event.target.value)"
              />
              <input
                v-else-if="!viewOnly && f.editable !== false && f.type === 'date'"
                class="cell-input"
                type="date"
                :value="cellValue(row, f)"
                @change="onText(row, f, $event.target.value)"
              />
              <select
                v-else-if="!viewOnly && f.editable !== false && f.type === 'select'"
                class="cell-input"
                :value="cellValue(row, f)"
                @change="onText(row, f, $event.target.value)"
              >
                <option value="">—</option>
                <option v-for="opt in optionsFor(f)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input
                v-else-if="!viewOnly && f.editable !== false && f.type === 'boolean'"
                type="checkbox"
                :checked="!!cellValue(row, f)"
                @change="onText(row, f, $event.target.checked)"
              />
              <span v-else-if="isDerivedKey(f, 'pay_category')" class="cell-ro">
                <span
                  class="roster-cat-badge roster-cat-badge--pay"
                  :class="categoryFlagClass(row, f)"
                  :title="categoryHover(row, f)"
                >
                  {{ categoryDisplay(row, f) }}
                </span>
                <span v-if="categoryDetail(row, f)" class="roster-cat-sub">{{ categoryDetail(row, f) }}</span>
              </span>
              <span v-else-if="isDerivedKey(f, 'hcbs_category')" class="cell-ro">
                <span
                  class="roster-cat-badge roster-cat-badge--hcbs"
                  :class="categoryFlagClass(row, f)"
                  :title="categoryHover(row, f)"
                >
                  {{ categoryDisplay(row, f) }}
                </span>
                <span v-if="categoryDetail(row, f)" class="roster-cat-sub">{{ categoryDetail(row, f) }}</span>
              </span>
              <span v-else-if="isDerivedKey(f, 'classification_flag')" class="cell-ro">
                <span
                  v-if="flagLabel(row, f)"
                  class="roster-flag"
                  :class="flagClass(row, f)"
                  :title="flagDetail(row, f)"
                >
                  {{ flagLabel(row, f) }}
                </span>
                <span v-else class="muted" :title="flagDetail(row, f) || ''">—</span>
              </span>
              <span v-else class="cell-ro">{{ displayCell(row, f) }}</span>
            </td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td :colspan="(viewOnly ? 1 : 2) + selectedFields.length" class="muted empty">No matching people.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  persona: { type: String, default: 'employees' },
  agencyId: { type: [String, Number], default: '' },
  organizationId: { type: [String, Number], default: '' },
  roleFilter: { type: String, default: '' },
  extraRole: { type: String, default: '' },
  canArchive: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  profileBase: { type: String, default: '/admin/users' },
  /** Same column catalog/sort as roster editor; cells are display-only. */
  viewOnly: { type: Boolean, default: false }
});

const maxColumns = 10;
const loading = ref(false);
const error = ref('');
const banner = ref('');
const bannerError = ref(false);
const savingCount = ref(0);
const pickerOpen = ref(false);
const search = ref('');
const rows = ref([]);
const allFields = ref([]);
const selectedKeys = ref([]);
const compensationOptions = ref([]);
const selectedIds = ref(new Set());
const sortKey = ref('name');
const sortDir = ref('asc');
const includeArchived = ref(false);
const bulkField = ref('');
const bulkValue = ref('');
const bulkBool = ref(true);
const bulkSaving = ref(false);

const storageKey = computed(() => `roster-editor-fields:${props.persona || 'employees'}`);

const fieldGroups = computed(() => {
  const groups = [];
  const map = new Map();
  for (const f of allFields.value) {
    if (!map.has(f.group)) {
      const g = { name: f.group, fields: [] };
      map.set(f.group, g);
      groups.push(g);
    }
    map.get(f.group).fields.push(f);
  }
  return groups;
});

const selectedFields = computed(() =>
  selectedKeys.value.map((k) => allFields.value.find((f) => f.key === k)).filter(Boolean)
);
const emailSignatureGuidance = computed(() => {
  if (!selectedKeys.value.includes('email_signature')) return '';
  const f = allFields.value.find((x) => x.key === 'email_signature');
  return f?.guidance || 'Best size: max width 600px, height 150–200px (~3:1 or 4:1). PNG or JPG under ~100KB.';
});
const editableSelectedFields = computed(() => selectedFields.value.filter((f) => f.editable !== false && f.type !== 'file'));
const bulkFieldDef = computed(() => selectedFields.value.find((f) => f.key === bulkField.value) || null);

const visibleRows = computed(() => {
  let list = [...(rows.value || [])];
  if (props.extraRole === 'providers') {
    list = list.filter((r) => String(r.role || '').toLowerCase() === 'provider');
  } else if (props.extraRole === 'staff') {
    list = list.filter((r) => {
      const role = String(r.role || '').toLowerCase();
      return role === 'staff' || role === 'support';
    });
  } else if (props.extraRole === 'supervisors') {
    list = list.filter((r) => r.has_supervisor_privileges || r.values?.has_supervisor_privileges);
  } else if (props.extraRole === 'super_admins') {
    list = list.filter((r) => String(r.role || '').toLowerCase() === 'super_admin');
  }
  const q = String(search.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter((r) => {
      const name = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''}`.toLowerCase();
      if (name.includes(q)) return true;
      return selectedFields.value.some((f) => String(displayCell(r, f) || '').toLowerCase().includes(q));
    });
  }
  const dir = sortDir.value === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const av = sortValue(a, sortKey.value);
    const bv = sortValue(b, sortKey.value);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return list;
});

const allVisibleSelected = computed(
  () => visibleRows.value.length > 0 && visibleRows.value.every((r) => selectedIds.value.has(r.id))
);

function displayName(row) {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || `User ${row.id}`;
}

function profilePath(id) {
  return `${props.profileBase.replace(/\/$/, '')}/${id}`;
}

function cellValue(row, field) {
  return row.values?.[field.key];
}

function isDerivedKey(field, key) {
  return String(field?.key || '') === key;
}

function safeText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.label === 'string') return value.label;
    if (typeof value.display === 'string') return value.display;
    if (typeof value.detail === 'string') return value.detail;
    return '';
  }
  return String(value);
}

function displayCell(row, field) {
  const v = cellValue(row, field);
  const key = String(field?.key || '');
  if (key === 'pay_category' || key === 'hcbs_category') {
    return categoryDisplay(row, field);
  }
  if (key === 'classification_flag') {
    return flagLabel(row, field) || '';
  }
  if (field.type === 'file') return v?.name || '';
  if (field.type === 'boolean') return v ? 'Yes' : 'No';
  if (field.type === 'datetime' && v) {
    try {
      return new Date(v).toLocaleString();
    } catch {
      return safeText(v);
    }
  }
  if (field.type === 'select') {
    const opt = optionsFor(field).find((o) => String(o.value) === String(v));
    return opt?.label || safeText(v) || '';
  }
  return safeText(v);
}

function categoryCell(row, field) {
  const v = cellValue(row, field);
  return v && typeof v === 'object' ? v : null;
}

function categoryDisplay(row, field) {
  const v = categoryCell(row, field);
  if (!v) return 'Unknown';
  return safeText(v.display) || (v.cat ? `Cat ${v.cat}` : 'Unknown');
}

function categoryDetail(row, field) {
  const v = categoryCell(row, field);
  return safeText(v?.label).trim();
}

function categoryHover(row, field) {
  const v = categoryCell(row, field);
  const flagDetail = safeText(v?.flagDetail).trim();
  const label = categoryDetail(row, field);
  if (flagDetail && (v?.flagKind === 'conflict' || v?.flagKind === 'unknown' || v?.flagKind === 'na')) {
    return label ? `${label} — ${flagDetail}` : flagDetail;
  }
  return label || categoryDisplay(row, field);
}

function categoryFlagClass(row, field) {
  const kind = String(categoryCell(row, field)?.flagKind || '');
  if (kind === 'conflict') return 'roster-cat-badge--conflict';
  if (kind === 'unknown') return 'roster-cat-badge--unknown';
  return '';
}

function flagCell(row, field) {
  const v = cellValue(row, field);
  return v && typeof v === 'object' ? v : null;
}

function flagLabel(row, field) {
  const cell = flagCell(row, field);
  if (!cell) return '';
  const kind = String(cell.kind || '');
  // Only surface actionable flags; OK/na show as dash via template.
  if (kind === 'ok' || kind === 'na') return '';
  return safeText(cell.label).trim();
}

function flagDetail(row, field) {
  const cell = flagCell(row, field);
  if (!cell) return '';
  return safeText(cell.detail).trim() || safeText(cell.label).trim();
}

function flagClass(row, field) {
  const kind = String(flagCell(row, field)?.kind || '');
  if (kind === 'conflict') return 'roster-flag--conflict';
  if (kind === 'unknown') return 'roster-flag--unknown';
  if (kind === 'ok') return 'roster-flag--ok';
  return '';
}

function fileName(row, field) {
  const v = cellValue(row, field);
  return v?.name || '';
}

function fileUrl(row, field) {
  const v = cellValue(row, field);
  return v?.url || '';
}

function optionsFor(field) {
  if (field?.key === 'comp_level') return compensationOptions.value || [];
  return field?.options || [];
}

function sortValue(row, key) {
  if (key === 'name') return displayName(row).toLowerCase();
  const field = selectedFields.value.find((f) => f.key === key);
  if (!field) return '';
  const v = cellValue(row, field);
  if (field?.type === 'derived') {
    if (field.key === 'pay_category' || field.key === 'hcbs_category') {
      const cell = categoryCell(row, field);
      return cell?.cat == null ? 99 : Number(cell.cat);
    }
    if (field.key === 'classification_flag') {
      const cell = flagCell(row, field);
      return cell?.sort == null ? 99 : Number(cell.sort);
    }
  }
  if (field.type === 'boolean') return v ? 1 : 0;
  if (field.type === 'file') return String(v?.name || '').toLowerCase();
  return String(v || '').toLowerCase();
}

function sortMark(key) {
  if (sortKey.value !== key) return '';
  return sortDir.value === 'desc' ? '↓' : '↑';
}

function toggleSort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
}

function toggleField(key, on) {
  if (on) {
    if (selectedKeys.value.includes(key) || selectedKeys.value.length >= maxColumns) return;
    selectedKeys.value = [...selectedKeys.value, key];
  } else {
    selectedKeys.value = selectedKeys.value.filter((k) => k !== key);
  }
  persistKeys();
  void load();
}

function persistKeys() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(selectedKeys.value));
  } catch {
    /* ignore */
  }
}

function loadStoredKeys(defaults) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey.value) || 'null');
    if (Array.isArray(raw) && raw.length) return raw.slice(0, maxColumns);
  } catch {
    /* ignore */
  }
  return defaults || [];
}

function toggleRow(id, on) {
  const next = new Set(selectedIds.value);
  if (on) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
}

function toggleSelectAll(e) {
  const on = !!e.target?.checked;
  const next = new Set(selectedIds.value);
  if (on) visibleRows.value.forEach((r) => next.add(r.id));
  else visibleRows.value.forEach((r) => next.delete(r.id));
  selectedIds.value = next;
}

function clearSelection() {
  selectedIds.value = new Set();
}

function showBanner(msg, isError = false) {
  banner.value = msg;
  bannerError.value = isError;
  setTimeout(() => {
    if (banner.value === msg) banner.value = '';
  }, 4000);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (!allFields.value.length) {
      const catalog = await api.get('/users/grid/fields', { skipGlobalLoading: true });
      allFields.value = catalog.data?.fields || [];
    }
    if (!selectedKeys.value.length) {
      const defaults = catalogDefaults();
      selectedKeys.value = loadStoredKeys(defaults);
    }
    const params = {
      persona: props.persona,
      fields: selectedKeys.value.join(','),
      includeArchived: includeArchived.value ? 'true' : 'false'
    };
    if (props.agencyId) params.agency_id = props.agencyId;
    if (props.organizationId) params.organization_id = props.organizationId;
    if (props.roleFilter) params.role = props.roleFilter;
    const res = await api.get('/users/grid', { params, skipGlobalLoading: true });
    rows.value = res.data?.rows || [];
    if (res.data?.meta?.compensationOptions) compensationOptions.value = res.data.meta.compensationOptions;
    clearSelection();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load roster';
  } finally {
    loading.value = false;
  }
}

function catalogDefaults() {
  const p = props.persona || 'employees';
  if (p === 'school_staff') return ['email', 'personal_phone', 'last_login', 'schools', 'districts'];
  if (p === 'guardians') return ['email', 'personal_phone', 'last_login', 'status', 'schools'];
  return ['credential', 'psychology_today_url', 'date_of_birth', 'provider_start_date', 'comp_level'];
}

async function saveCell(row, field, value) {
  savingCount.value += 1;
  try {
    await api.put('/users/grid/cells', {
      agencyId: props.agencyId || null,
      updates: [{ userId: row.id, field: field.key, value }]
    }, { skipGlobalLoading: true });
    if (!row.values) row.values = {};
    row.values[field.key] = value;
  } catch (err) {
    showBanner(err.response?.data?.error?.message || 'Save failed', true);
    await load();
  } finally {
    savingCount.value = Math.max(0, savingCount.value - 1);
  }
}

function onText(row, field, value) {
  saveCell(row, field, value);
}

async function onFile(row, field, event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('field', field.key);
  savingCount.value += 1;
  try {
    const res = await api.post(`/users/grid/${row.id}/file`, form, { skipGlobalLoading: true });
    if (!row.values) row.values = {};
    row.values[field.key] = res.data;
  } catch (err) {
    showBanner(err.response?.data?.error?.message || 'Upload failed', true);
  } finally {
    savingCount.value = Math.max(0, savingCount.value - 1);
  }
}

async function applyBulk() {
  if (!bulkField.value || !selectedIds.value.size) return;
  const value = bulkFieldDef.value?.type === 'boolean' ? bulkBool.value : bulkValue.value;
  bulkSaving.value = true;
  try {
    const res = await api.put('/users/grid/bulk', {
      userIds: [...selectedIds.value],
      field: bulkField.value,
      value,
      agencyId: props.agencyId || null
    }, { skipGlobalLoading: true });
    const n = res.data?.saved || 0;
    showBanner(`Updated ${n} ${n === 1 ? 'person' : 'people'}`);
    await load();
  } catch (err) {
    showBanner(err.response?.data?.error?.message || 'Bulk update failed', true);
  } finally {
    bulkSaving.value = false;
  }
}

async function bulkArchive() {
  if (!selectedIds.value.size) return;
  if (!confirm(`Archive ${selectedIds.value.size} selected account(s)? They will lose access immediately.`)) return;
  bulkSaving.value = true;
  try {
    const res = await api.post('/users/grid/bulk-archive', { userIds: [...selectedIds.value] }, { skipGlobalLoading: true });
    showBanner(`Archived ${res.data?.archived || 0}`);
    await load();
  } catch (err) {
    showBanner(err.response?.data?.error?.message || 'Archive failed', true);
  } finally {
    bulkSaving.value = false;
  }
}

async function bulkDelete() {
  if (!selectedIds.value.size) return;
  if (!confirm(`Permanently delete ${selectedIds.value.size} selected account(s)? This archives them first, then deletes. This cannot be undone.`)) return;
  bulkSaving.value = true;
  try {
    const res = await api.post('/users/grid/bulk-delete', { userIds: [...selectedIds.value] }, { skipGlobalLoading: true });
    showBanner(`Deleted ${res.data?.deleted || 0}`);
    await load();
  } catch (err) {
    showBanner(err.response?.data?.error?.message || 'Delete failed', true);
  } finally {
    bulkSaving.value = false;
  }
}

watch(
  () => [props.persona, props.agencyId, props.organizationId, props.roleFilter, includeArchived.value],
  ([persona], prev) => {
    const oldPersona = prev?.[0];
    if (oldPersona && oldPersona !== persona) {
      selectedKeys.value = loadStoredKeys(catalogDefaults());
    }
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.roster { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.roster-toolbar, .roster-bulk {
  display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px;
}
.roster-search { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.roster-search input { min-width: 220px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text-primary); }
.roster-banner { font-size: 13px; color: var(--text-secondary); }
.roster-banner.error { color: var(--error, #b91c1c); }
.roster-picker {
  border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--bg);
}
.roster-picker-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.roster-picker-group-title { font-size: 12px; font-weight: 800; margin-bottom: 6px; }
.roster-picker-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.roster-bulk {
  padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);
}
.roster-scroller { overflow: auto; max-height: min(72vh, 900px); border: 1px solid var(--border); border-radius: 10px; background: var(--bg); }
.roster-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; }
.roster-table th, .roster-table td {
  border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: middle; font-size: 13px;
  background: var(--bg); white-space: nowrap;
}
.roster-table thead th { position: sticky; top: 0; z-index: 3; font-size: 12px; background: var(--bg-alt); }
.roster-table th.sortable { cursor: pointer; }
.sticky-col { position: sticky; left: 0; z-index: 2; }
.sticky-name { left: 36px; min-width: 180px; box-shadow: 2px 0 0 var(--border); }
.col-check { left: 0; width: 36px; min-width: 36px; z-index: 4; }
.roster-table thead .sticky-col { z-index: 5; }
.roster-table tr.selected td { background: color-mix(in srgb, var(--primary, #C69A2B) 12%, var(--bg)); }
.name-link { font-weight: 700; color: var(--text-primary); text-decoration: none; }
.name-sub { font-size: 11px; }
.cell-input {
  width: 100%; min-width: 140px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--text-primary);
}
.cell-ro { color: var(--text-primary); }
.roster-cat-badge {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}
.roster-cat-badge--hcbs {
  background: #ede9fe;
  color: #5b21b6;
  border-color: #c4b5fd;
}
.roster-cat-badge--conflict {
  background: #fef3c7 !important;
  color: #92400e !important;
  border-color: #fcd34d !important;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.35);
}
.roster-cat-badge--unknown {
  background: #f1f5f9 !important;
  color: #475569 !important;
  border-color: #cbd5e1 !important;
  border-style: dashed;
}
.roster-cat-sub {
  display: block;
  max-width: 220px;
  white-space: normal;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.roster-flag {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}
.roster-flag--conflict {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}
.roster-flag--unknown {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.roster-flag--ok {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}
.file-cell { display: flex; align-items: center; gap: 8px; }
.file-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.file-btn { margin: 0; }
.sig-thumb {
  width: 48px;
  height: 16px;
  object-fit: contain;
  border-radius: 2px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
  flex-shrink: 0;
}
.roster-sig-hint { margin: 0 0 10px; font-size: 12px; max-width: 52rem; }
.empty { text-align: center; padding: 24px; }
.filter-input, .filter-select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-primary); }
</style>
