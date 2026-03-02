<template>
  <div class="agency-departments-management page">
    <div class="page-header">
      <h1>Departments</h1>
      <p class="page-description">
        Manage departments for Budget Management. Departments are used for budget allocation and expense tracking (e.g. Scholarships, Communications, Development, O&amp;O).
      </p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="form-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px;">
        <div class="field" style="flex: 1;">
          <label>Department name</label>
          <input v-model="newName" type="text" placeholder="e.g. Scholarships, Communications" class="input" />
        </div>
        <div class="field" style="width: 100px;">
          <label>Order</label>
          <input v-model.number="newOrder" type="number" min="0" class="input" />
        </div>
        <button class="btn btn-primary" :disabled="saving || !newName?.trim()" @click="addDepartment">
          Add Department
        </button>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error-box">{{ error }}</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Slug</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in departments" :key="d.id">
              <td>{{ d.display_order }}</td>
              <td>
                <input
                  v-if="editingId === d.id"
                  v-model="editName"
                  type="text"
                  class="input"
                  style="width: 100%;"
                />
                <span v-else>{{ d.name }}</span>
                <div v-if="editingId === d.id" class="edit-settings" style="margin-top: 8px;">
                  <label class="muted" style="font-size: 0.85rem;">Settings (JSON)</label>
                  <textarea v-model="editSettings" rows="2" class="input" style="width: 100%; font-family: monospace; font-size: 0.85rem;" placeholder='{"approvalRequired": true}'></textarea>
                </div>
              </td>
              <td class="muted">{{ d.slug }}</td>
              <td>{{ d.is_active ? 'Yes' : 'No' }}</td>
              <td>
                <template v-if="editingId === d.id">
                  <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveEdit">Save</button>
                  <button class="btn btn-secondary btn-sm" :disabled="saving" @click="cancelEdit">Cancel</button>
                </template>
                <template v-else>
                  <button class="btn btn-secondary btn-sm" @click="startEdit(d)">Edit</button>
                  <button class="btn btn-danger btn-sm" :disabled="saving" @click="deleteDept(d)">Delete</button>
                </template>
              </td>
            </tr>
            <tr v-if="!departments.length && !loading">
              <td colspan="5" class="muted">No departments yet. Add one above.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const agencyId = computed(() => props.agencyId || agencyStore.currentAgency?.id || null);

const departments = ref([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const newName = ref('');
const newOrder = ref(0);
const editingId = ref(null);
const editName = ref('');
const editSettings = ref('');

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/agencies/${agencyId.value}/departments`);
    departments.value = data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load departments';
    departments.value = [];
  } finally {
    loading.value = false;
  }
}

watch(agencyId, load, { immediate: true });

async function addDepartment() {
  if (!newName.value?.trim() || !agencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${agencyId.value}/departments`, {
      name: newName.value.trim(),
      displayOrder: Number(newOrder.value) || 0
    });
    newName.value = '';
    newOrder.value = 0;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to add department';
  } finally {
    saving.value = false;
  }
}

function startEdit(d) {
  editingId.value = d.id;
  editName.value = d.name;
  try {
    editSettings.value = d.settings_json ? (typeof d.settings_json === 'string' ? d.settings_json : JSON.stringify(d.settings_json, null, 2)) : '';
  } catch {
    editSettings.value = '';
  }
}

function cancelEdit() {
  editingId.value = null;
  editName.value = '';
  editSettings.value = '';
}

async function saveEdit() {
  if (!editingId.value || !editName.value?.trim() || !agencyId.value) return;
  saving.value = true;
  error.value = '';
  let settings = null;
  if (editSettings.value?.trim()) {
    try {
      settings = JSON.parse(editSettings.value.trim());
    } catch (e) {
      error.value = 'Invalid JSON in settings';
      saving.value = false;
      return;
    }
  }
  try {
    await api.put(`/agencies/${agencyId.value}/departments/${editingId.value}`, {
      name: editName.value.trim(),
      settings
    });
    editingId.value = null;
    editName.value = '';
    editSettings.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to update department';
  } finally {
    saving.value = false;
  }
}

async function deleteDept(d) {
  if (!confirm(`Delete department "${d.name}"?`)) return;
  saving.value = true;
  error.value = '';
  try {
    await api.delete(`/agencies/${agencyId.value}/departments/${d.id}`);
    if (editingId.value === d.id) {
      editingId.value = null;
      editName.value = '';
    }
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to delete department';
  } finally {
    saving.value = false;
  }
}
</script>
