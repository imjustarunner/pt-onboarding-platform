<template>
  <div class="ccf">
    <div class="ccf-header">
      <div>
        <h3 class="ccf-title">Custom Profile Fields</h3>
        <p class="ccf-hint">
          Define custom attributes members can fill in (e.g. reach, bench press max).
          These become available as criteria when building custom recognition categories.
        </p>
      </div>
      <button type="button" class="ccf-add-btn" @click="startAdd">+ Add Field</button>
    </div>

    <div v-if="loading" class="ccf-loading">Loading…</div>
    <div v-else-if="error" class="ccf-error">{{ error }}</div>

    <!-- Field list -->
    <div v-if="fields.length" class="ccf-list">
      <div v-for="f in fields" :key="f.id" class="ccf-row" :class="{ 'ccf-row--inactive': !f.is_active }">
        <div class="ccf-row-info">
          <span class="ccf-label">{{ f.label }}</span>
          <span class="ccf-meta">{{ f.name }} · {{ f.field_type }}<template v-if="f.unit_label"> · {{ f.unit_label }}</template></span>
        </div>
        <div class="ccf-row-actions">
          <span class="ccf-badge" :class="f.is_active ? 'ccf-badge--active' : 'ccf-badge--off'">
            {{ f.is_active ? 'Active' : 'Inactive' }}
          </span>
          <button type="button" class="ccf-btn-sm" @click="startEdit(f)">Edit</button>
          <button type="button" class="ccf-btn-sm ccf-btn-sm--danger" @click="toggleActive(f)">
            {{ f.is_active ? 'Deactivate' : 'Reactivate' }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="!loading" class="ccf-empty">No custom fields defined yet.</div>

    <!-- Add / Edit form -->
    <div v-if="showForm" class="ccf-form-wrap">
      <h4 class="ccf-form-title">{{ editingId ? 'Edit Field' : 'New Field' }}</h4>
      <div class="ccf-form">
        <div class="ccf-form-group">
          <label>Label <span class="req">*</span></label>
          <input v-model="form.label" type="text" maxlength="128" placeholder="e.g. Reach (inches)" class="ccf-input" />
          <small>Shown to members when filling in their profile.</small>
        </div>
        <div class="ccf-form-group" v-if="!editingId">
          <label>Internal name <span class="req">*</span></label>
          <input v-model="form.name" type="text" maxlength="64" placeholder="e.g. reach_inches" class="ccf-input" />
          <small>Snake_case key used internally. Cannot be changed after creation.</small>
        </div>
        <div class="ccf-form-group">
          <label>Field type</label>
          <select v-model="form.fieldType" class="ccf-input" :disabled="!!editingId">
            <option value="number">Number</option>
            <option value="text">Text</option>
            <option value="date">Date</option>
          </select>
        </div>
        <div class="ccf-form-group">
          <label>Unit label</label>
          <input v-model="form.unitLabel" type="text" maxlength="32" placeholder="e.g. inches, lbs, kg" class="ccf-input" />
          <small>Optional — displayed next to the value.</small>
        </div>
        <div v-if="formError" class="ccf-error">{{ formError }}</div>
        <div class="ccf-form-actions">
          <button type="button" class="btn btn-secondary" @click="cancelForm">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving || !form.label.trim() || (!editingId && !form.name.trim())" @click="saveForm">
            {{ saving ? 'Saving…' : (editingId ? 'Update' : 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clubId: { type: [Number, String], default: null }
});

const emit = defineEmits(['fields-updated']);

const fields = ref([]);
const loading = ref(false);
const error = ref('');

const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');
const form = ref({ name: '', label: '', fieldType: 'number', unitLabel: '' });

watch(() => props.clubId, (id) => {
  if (id) load();
  else fields.value = [];
}, { immediate: true });

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/custom-fields`, { skipGlobalLoading: true });
    fields.value = Array.isArray(data?.fields) ? data.fields : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load custom fields';
  } finally {
    loading.value = false;
  }
}

function startAdd() {
  editingId.value = null;
  form.value = { name: '', label: '', fieldType: 'number', unitLabel: '' };
  formError.value = '';
  showForm.value = true;
}

function startEdit(f) {
  editingId.value = f.id;
  form.value = { name: f.name, label: f.label, fieldType: f.field_type, unitLabel: f.unit_label || '' };
  formError.value = '';
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  formError.value = '';
}

async function saveForm() {
  if (!props.clubId) return;
  saving.value = true;
  formError.value = '';
  try {
    const payload = {
      label: form.value.label.trim(),
      unitLabel: form.value.unitLabel.trim() || null
    };
    if (editingId.value) {
      await api.put(`/summit-stats/clubs/${props.clubId}/custom-fields/${editingId.value}`, payload);
    } else {
      await api.post(`/summit-stats/clubs/${props.clubId}/custom-fields`, {
        ...payload,
        name: form.value.name.trim(),
        fieldType: form.value.fieldType
      });
    }
    cancelForm();
    await load();
    emit('fields-updated', fields.value);
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to save field';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(f) {
  if (!props.clubId) return;
  try {
    await api.put(`/summit-stats/clubs/${props.clubId}/custom-fields/${f.id}`, { isActive: !f.is_active });
    await load();
    emit('fields-updated', fields.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to update field';
  }
}

defineExpose({ load, fields });
</script>

<style scoped>
.ccf { }

.ccf-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.ccf-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 700;
}

.ccf-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}

.ccf-add-btn {
  flex-shrink: 0;
  background: none;
  border: 1px dashed var(--border, #cbd5e1);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--primary, #1d4ed8);
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}
.ccf-add-btn:hover { background: #eff6ff; border-color: var(--primary, #1d4ed8); }

.ccf-loading, .ccf-empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 8px 0;
}
.ccf-error { color: #b91c1c; font-size: 13px; margin-bottom: 8px; }

.ccf-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.ccf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  flex-wrap: wrap;
}
.ccf-row--inactive { opacity: 0.6; }

.ccf-row-info { display: flex; flex-direction: column; gap: 2px; }
.ccf-label { font-weight: 600; font-size: 14px; }
.ccf-meta { font-size: 12px; color: var(--text-secondary, #64748b); }

.ccf-row-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.ccf-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ccf-badge--active { background: #dcfce7; color: #166534; }
.ccf-badge--off { background: #f3f4f6; color: #6b7280; }

.ccf-btn-sm {
  background: none;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary, #0f172a);
}
.ccf-btn-sm:hover { background: #f8fafc; }
.ccf-btn-sm--danger { color: #dc2626; border-color: #fca5a5; }
.ccf-btn-sm--danger:hover { background: #fef2f2; }

.ccf-form-wrap {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 14px 16px;
  background: #f8fafc;
  margin-top: 10px;
}
.ccf-form-title { margin: 0 0 12px 0; font-size: 14px; font-weight: 700; }
.ccf-form { display: flex; flex-direction: column; gap: 12px; }
.ccf-form-group { display: flex; flex-direction: column; gap: 4px; }
.ccf-form-group label { font-size: 13px; font-weight: 600; }
.ccf-form-group small { font-size: 11px; color: var(--text-secondary, #64748b); }
.ccf-input {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: white;
}
.req { color: #dc2626; }
.ccf-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
