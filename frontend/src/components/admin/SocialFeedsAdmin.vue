<template>
  <div class="social-feeds-admin">
    <div class="section-header">
      <h4 style="margin: 0 0 8px 0;">Dashboard social feeds</h4>
      <p class="section-description">
        Add Instagram, Facebook, RSS, or link feeds that appear on the My Dashboard for providers and staff.
      </p>
    </div>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="feeds-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>URL</th>
              <th>Order</th>
              <th>Active</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in feeds" :key="f.id">
              <td>{{ f.label }}</td>
              <td><span class="pill">{{ f.type }}</span></td>
              <td class="url-cell">{{ f.url || f.externalUrl || '—' }}</td>
              <td>{{ f.sortOrder }}</td>
              <td>{{ f.isActive ? 'Yes' : 'No' }}</td>
              <td class="right">
                <button type="button" class="btn btn-secondary btn-sm" @click="startEdit(f)" :disabled="savingId === f.id">
                  Edit
                </button>
                <button type="button" class="btn btn-danger btn-sm" @click="confirmDelete(f)" :disabled="savingId === f.id">
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="!feeds.length">
              <td colspan="6" class="empty-state-inline">No social feeds yet. Add one below.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="form-divider">
        <h5 style="margin: 0 0 12px 0;">{{ editingId ? 'Edit feed' : 'Add feed' }}</h5>
        <div class="form-row">
          <div class="form-group">
            <label>Type</label>
            <select v-model="form.type" class="input">
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="rss">RSS</option>
              <option value="link">Link</option>
            </select>
          </div>
          <div class="form-group flex-grow">
            <label>Label</label>
            <input v-model="form.label" type="text" class="input" placeholder="e.g. School Instagram" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group flex-grow">
            <label>URL (embed or page URL)</label>
            <input v-model="form.url" type="url" class="input" placeholder="https://..." />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group flex-grow">
            <label>External URL (open in new tab – for RSS/link)</label>
            <input v-model="form.externalUrl" type="url" class="input" placeholder="Leave blank to use URL above" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Sort order</label>
            <input v-model.number="form.sortOrder" type="number" class="input" min="0" />
          </div>
          <div class="form-group">
            <div class="toggle-row">
              <input v-model="form.isActive" type="checkbox" id="social-feed-active" />
              <label for="social-feed-active">Active</label>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button v-if="editingId" type="button" class="btn btn-secondary" @click="cancelEdit">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveFeed" :disabled="saving">
            {{ saving ? 'Saving…' : (editingId ? 'Update' : 'Add') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: [Number, String],
    required: true
  }
});

const feeds = ref([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const savingId = ref(null);
const editingId = ref(null);
const form = ref({
  type: 'link',
  label: '',
  url: '',
  externalUrl: '',
  sortOrder: 0,
  isActive: true
});

async function load() {
  if (!props.agencyId) {
    feeds.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${props.agencyId}/social-feeds`);
    feeds.value = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load feeds';
    feeds.value = [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  form.value = {
    type: 'link',
    label: '',
    url: '',
    externalUrl: '',
    sortOrder: 0,
    isActive: true
  };
}

function startEdit(feed) {
  editingId.value = feed.id;
  form.value = {
    type: feed.type || 'link',
    label: feed.label || '',
    url: feed.url || '',
    externalUrl: feed.externalUrl || '',
    sortOrder: feed.sortOrder ?? 0,
    isActive: feed.isActive !== false
  };
}

function cancelEdit() {
  resetForm();
}

async function saveFeed() {
  if (!props.agencyId) return;
  const payload = {
    type: form.value.type,
    label: form.value.label?.trim() || 'Feed',
    url: form.value.url?.trim() || null,
    externalUrl: form.value.externalUrl?.trim() || null,
    sortOrder: form.value.sortOrder ?? 0,
    isActive: form.value.isActive
  };
  saving.value = true;
  savingId.value = editingId.value;
  try {
    if (editingId.value) {
      await api.put(`/agencies/${props.agencyId}/social-feeds/${editingId.value}`, payload);
    } else {
      await api.post(`/agencies/${props.agencyId}/social-feeds`, payload);
    }
    await load();
    resetForm();
  } catch (e) {
    const err = e.response?.data?.error;
    const firstMsg = Array.isArray(err?.errors) && err.errors[0]?.msg ? err.errors[0].msg : null;
    error.value = firstMsg || err?.message || 'Failed to save';
  } finally {
    saving.value = false;
    savingId.value = null;
  }
}

function confirmDelete(feed) {
  if (!window.confirm(`Delete "${feed.label}"?`)) return;
  deleteFeed(feed.id);
}

async function deleteFeed(id) {
  if (!props.agencyId) return;
  savingId.value = id;
  try {
    await api.delete(`/agencies/${props.agencyId}/social-feeds/${id}`);
    await load();
    if (editingId.value === id) resetForm();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete';
  } finally {
    savingId.value = null;
  }
}

watch(() => props.agencyId, () => load(), { immediate: true });
</script>

<style scoped>
.social-feeds-admin {
  padding: 0;
}
.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
}
.feeds-table-wrap {
  overflow-x: auto;
  margin-bottom: 24px;
}
.url-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-divider {
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}
.form-group {
  min-width: 140px;
}
.form-group.flex-grow {
  flex: 1;
  min-width: 200px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 24px;
}
.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
</style>
