<template>
  <div class="utcp">
    <div class="utcp__head">
      <div>
        <h4 class="utcp__title">Time Submission Categories</h4>
        <p class="utcp__hint">
          Configure which additional time-submission cards appear on this provider's dashboard.
          Each enabled category shows as its own card in the <em>Time &amp; attendance</em> section.
        </p>
      </div>
    </div>

    <div v-if="loadError" class="utcp__error">{{ loadError }}</div>

    <div v-if="loading" class="utcp__loading">Loading…</div>

    <template v-else>
      <!-- Existing categories -->
      <div v-if="categories.length" class="utcp__list">
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="utcp__row"
          :class="{ 'utcp__row--disabled': !cat.enabled }"
        >
          <span class="utcp__cat-icon" :style="{ background: CATEGORY_META[cat.category_type]?.color || '#6b7280' }">
            <span v-html="CATEGORY_META[cat.category_type]?.icon || ''" />
          </span>
          <div class="utcp__row-body">
            <span class="utcp__cat-label">
              {{ cat.label || CATEGORY_META[cat.category_type]?.defaultLabel || cat.category_type }}
            </span>
            <span class="utcp__cat-type">
              {{ CATEGORY_META[cat.category_type]?.rateLabel || '' }}
            </span>
          </div>
          <label class="utcp__toggle" :title="cat.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'">
            <input
              type="checkbox"
              :checked="cat.enabled"
              :disabled="busyId === cat.id"
              @change="toggleEnabled(cat)"
            />
            <span class="utcp__toggle-track" />
          </label>
          <button
            type="button"
            class="utcp__delete-btn"
            :disabled="busyId === cat.id"
            title="Remove this category"
            @click="removeCategory(cat)"
          >✕</button>
        </div>
      </div>
      <p v-else class="utcp__empty">No time submission categories configured yet.</p>

      <!-- Add new -->
      <div v-if="addingNew" class="utcp__add-form">
        <div class="utcp__add-fields">
          <div class="utcp__field">
            <label>Category type</label>
            <select v-model="newType" class="utcp__select">
              <option value="">— select —</option>
              <option
                v-for="(meta, key) in CATEGORY_META"
                :key="key"
                :value="key"
                :disabled="alreadyHas(key)"
              >
                {{ meta.defaultLabel }}{{ alreadyHas(key) ? ' (already added)' : '' }}
              </option>
            </select>
          </div>

          <div v-if="newType" class="utcp__field">
            <label>
              Display label
              <span class="utcp__hint-inline">(optional — defaults to "{{ CATEGORY_META[newType]?.defaultLabel }}")</span>
            </label>
            <input
              v-model="newLabel"
              type="text"
              class="utcp__input"
              :placeholder="CATEGORY_META[newType]?.defaultLabel || ''"
              maxlength="100"
            />
          </div>

          <div v-if="newType === 'indirect_plus'" class="utcp__info-box">
            <strong>Indirect Plus</strong> pays at this provider's <em>Other Rate 1</em> from their rate card.
            Set the rate and the label (e.g. "Translation Services" or "Office Services") in the rate card section above.
          </div>
        </div>

        <p v-if="saveError" class="utcp__error">{{ saveError }}</p>

        <div class="utcp__add-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!newType || saving"
            @click="saveNew"
          >{{ saving ? 'Saving…' : 'Add category' }}</button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="cancelAdd">Cancel</button>
        </div>
      </div>

      <button
        v-else
        type="button"
        class="btn btn-secondary btn-sm utcp__add-btn"
        @click="startAdd"
      >+ Add time category</button>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  userId:   { type: [Number, String], required: true },
});

/** Visual metadata for each category type */
const CATEGORY_META = {
  indirect: {
    defaultLabel: 'Indirect Service',
    rateLabel:    'Pays at indirect rate',
    color:        '#7c3aed',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  },
  support_activity: {
    defaultLabel: 'Support Activity',
    rateLabel:    'Pays at MEETING rate',
    color:        '#0284c7',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  },
  supervisor: {
    defaultLabel: 'Supervisor Notes',
    rateLabel:    'Pays at supervisor rate',
    color:        '#b45309',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 12 11 14 15 10"/></svg>',
  },
  indirect_plus: {
    defaultLabel: 'Indirect Plus',
    rateLabel:    'Pays at Other Rate 1',
    color:        '#059669',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  },
};

const categories = ref([]);
const loading    = ref(false);
const loadError  = ref('');
const busyId     = ref(null);

const addingNew  = ref(false);
const newType    = ref('');
const newLabel   = ref('');
const saving     = ref(false);
const saveError  = ref('');

async function fetchCategories() {
  loading.value  = true;
  loadError.value = '';
  try {
    const { data } = await api.get('/payroll/user-time-categories', {
      params: { agencyId: props.agencyId, userId: props.userId }
    });
    categories.value = data || [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load categories';
  } finally {
    loading.value = false;
  }
}

function alreadyHas(type) {
  return categories.value.some((c) => c.category_type === type);
}

function startAdd() {
  newType.value  = '';
  newLabel.value = '';
  saveError.value = '';
  addingNew.value = true;
}

function cancelAdd() {
  addingNew.value = false;
}

async function saveNew() {
  if (!newType.value) return;
  saving.value   = true;
  saveError.value = '';
  try {
    await api.post('/payroll/user-time-categories', {
      agencyId:     props.agencyId,
      userId:       props.userId,
      categoryType: newType.value,
      label:        newLabel.value.trim() || null,
      enabled:      true,
    });
    await fetchCategories();
    addingNew.value = false;
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to add category';
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(cat) {
  busyId.value = cat.id;
  try {
    await api.post('/payroll/user-time-categories', {
      agencyId:     props.agencyId,
      userId:       props.userId,
      categoryType: cat.category_type,
      label:        cat.label,
      enabled:      !cat.enabled,
    });
    cat.enabled = !cat.enabled;
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update category');
  } finally {
    busyId.value = null;
  }
}

async function removeCategory(cat) {
  if (!confirm(`Remove "${cat.label || CATEGORY_META[cat.category_type]?.defaultLabel}" from this provider's dashboard?`)) return;
  busyId.value = cat.id;
  try {
    await api.delete(`/payroll/user-time-categories/${cat.id}`);
    categories.value = categories.value.filter((c) => c.id !== cat.id);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to remove category');
  } finally {
    busyId.value = null;
  }
}

onMounted(fetchCategories);
</script>

<style scoped>
.utcp {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 18px 14px;
  background: #fff;
}
.utcp__head { margin-bottom: 14px; }
.utcp__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}
.utcp__hint {
  font-size: 0.82rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
}
.utcp__loading, .utcp__empty { color: #9ca3af; font-size: 0.85rem; margin: 8px 0; }
.utcp__error { color: #dc2626; font-size: 0.85rem; margin: 6px 0; }

.utcp__list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.utcp__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  transition: opacity 0.15s;
}
.utcp__row--disabled { opacity: 0.55; }
.utcp__cat-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.utcp__row-body { flex: 1; min-width: 0; }
.utcp__cat-label { display: block; font-size: 0.88rem; font-weight: 600; color: #111827; }
.utcp__cat-type  { font-size: 0.78rem; color: #6b7280; }

/* Toggle switch */
.utcp__toggle { display: flex; align-items: center; cursor: pointer; }
.utcp__toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.utcp__toggle-track {
  width: 34px; height: 18px;
  background: #d1d5db;
  border-radius: 9px;
  position: relative;
  transition: background 0.2s;
}
.utcp__toggle-track::after {
  content: '';
  position: absolute;
  left: 2px; top: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.utcp__toggle input:checked + .utcp__toggle-track { background: #7c3aed; }
.utcp__toggle input:checked + .utcp__toggle-track::after { left: 18px; }

.utcp__delete-btn {
  background: transparent;
  border: 0;
  color: #9ca3af;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.utcp__delete-btn:hover:not(:disabled) { color: #dc2626; background: #fef2f2; }

/* Add form */
.utcp__add-btn { margin-top: 4px; }
.utcp__add-form {
  margin-top: 12px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  padding: 14px 16px;
  background: #f9fafb;
}
.utcp__add-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.utcp__field { display: flex; flex-direction: column; gap: 4px; }
.utcp__field label { font-size: 0.82rem; font-weight: 600; color: #374151; }
.utcp__hint-inline { font-weight: 400; color: #6b7280; }
.utcp__select, .utcp__input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.88rem;
  background: #fff;
  color: #111827;
}
.utcp__select:focus, .utcp__input:focus { outline: 2px solid #7c3aed; outline-offset: 1px; }
.utcp__info-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.82rem;
  color: #1e40af;
  line-height: 1.4;
}
.utcp__add-actions { display: flex; gap: 8px; }
</style>
