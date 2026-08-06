<template>
  <div class="ltd-panel">
    <div class="ltd-head">
      <div>
        <div class="ltd-title">Log Time duties</div>
        <div class="muted ltd-hint">
          Choose which activities appear on this person&apos;s Log Time. Rate overrides apply when claims are approved (defaults to their indirect / MEETING / Admin Time rate).
        </div>
      </div>
      <div class="ltd-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || saving" @click="openCatalog">
          Browse agency activities
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loading || saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : 'Save duties' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted">Loading Log Time duties…</div>
    <div v-else-if="!rows.length" class="muted">
      No custom duties yet — this employee sees all active agency Log Time types.
      <button type="button" class="btn btn-link" @click="openCatalog">Customize</button>
    </div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Pay bucket</th>
            <th class="right">Rate override ($/hr)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.serviceTypeId">
            <td>
              <strong>{{ row.label }}</strong>
              <div v-if="row.description" class="muted" style="font-size:12px;">{{ row.description }}</div>
            </td>
            <td>{{ bucketLabel(row.payBucket) }}</td>
            <td class="right">
              <input
                v-model="row.rateOverride"
                type="number"
                step="0.01"
                min="0"
                placeholder="Default"
                style="width:110px;"
                @input="dirty = true"
              />
            </td>
            <td class="right">
              <button type="button" class="btn btn-secondary btn-sm" @click="removeRow(row.serviceTypeId)">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  <!-- Agency catalog modal -->
  <div v-if="showCatalog" class="ltd-modal-backdrop" @click.self="showCatalog = false">
    <div class="ltd-modal">
      <div class="ltd-modal-head">
        <h3>Agency Log Time activities</h3>
        <button type="button" class="btn btn-secondary btn-sm" @click="showCatalog = false">Close</button>
      </div>
      <p class="muted">Toggle activities for this employee. Unchecked items are hidden from their Log Time even if active agency-wide.</p>
      <div class="ltd-catalog">
        <label v-for="t in agencyTypes" :key="t.id" class="ltd-catalog-row">
          <input
            type="checkbox"
            :checked="catalogSelected.has(t.id)"
            @change="toggleCatalog(t.id, $event.target.checked)"
          />
          <span class="ltd-catalog-label">
            <strong>{{ t.label }}</strong>
            <span class="muted"> · {{ bucketLabel(t.payBucket) }}</span>
            <span v-if="!t.isActive" class="ltd-badge">Agency inactive</span>
          </span>
        </label>
      </div>

      <!-- Create new activity type inline -->
      <div class="ltd-new-type">
        <div v-if="!showNewTypeForm" class="ltd-new-type-trigger">
          <button type="button" class="btn btn-link" @click="showNewTypeForm = true">
            + Create a new activity type
          </button>
          <span class="muted" style="font-size:12px;">Adds to agency catalog and assigns to this person</span>
        </div>
        <div v-else class="ltd-new-type-form">
          <div class="ltd-new-type-title">New activity type</div>
          <div class="ltd-new-type-fields">
            <div class="ltd-new-type-field">
              <label>Label <span class="required">*</span></label>
              <input v-model="newTypeLabel" type="text" class="ltd-new-type-input" placeholder="e.g., Crisis documentation" :disabled="newTypeSaving" maxlength="120" />
            </div>
            <div class="ltd-new-type-field">
              <label>Description</label>
              <input v-model="newTypeDescription" type="text" class="ltd-new-type-input" placeholder="Short help text" :disabled="newTypeSaving" maxlength="255" />
            </div>
            <div class="ltd-new-type-field">
              <label>Pay bucket</label>
              <select v-model="newTypePayBucket" class="ltd-new-type-input" :disabled="newTypeSaving">
                <option value="indirect">Indirect Service (hourly rate)</option>
                <option value="support">Support Activity (MEETING rate)</option>
                <option value="supervision_note">Supervision Note (Admin Time)</option>
              </select>
            </div>
          </div>
          <div v-if="newTypeError" class="error-box" style="margin-top:8px;">{{ newTypeError }}</div>
          <div class="ltd-new-type-actions">
            <button type="button" class="btn btn-primary btn-sm" :disabled="newTypeSaving || !newTypeLabel.trim()" @click="createAndAssignType">
              {{ newTypeSaving ? 'Creating…' : 'Create & assign to this person' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="newTypeSaving" @click="showNewTypeForm = false">Cancel</button>
          </div>
        </div>
      </div>

      <div class="ltd-modal-foot">
        <button type="button" class="btn btn-secondary" @click="showCatalog = false">Cancel</button>
        <button type="button" class="btn btn-primary" @click="applyCatalog">Apply selection</button>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  userId: { type: [Number, String], required: true }
});

const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const error = ref('');
const agencyTypes = ref([]);
const rows = ref([]);
const showCatalog = ref(false);
const catalogSelected = ref(new Set());
const usingCustomList = ref(false);

const showNewTypeForm = ref(false);
const newTypeLabel = ref('');
const newTypeDescription = ref('');
const newTypePayBucket = ref('indirect');
const newTypeSaving = ref(false);
const newTypeError = ref('');

const bucketLabel = (b) => {
  const v = String(b || '').toLowerCase();
  if (v === 'support') return 'Support (MEETING rate)';
  if (v === 'supervision_note') return 'Supervision note (Admin Time)';
  if (v === 'other_1') return 'Other 1 (legacy)';
  return 'Indirect';
};

const buildRowsFromApi = (data) => {
  agencyTypes.value = Array.isArray(data?.agencyTypes) ? data.agencyTypes : [];
  const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
  usingCustomList.value = assignments.length > 0;
  if (!assignments.length) {
    rows.value = [];
    return;
  }
  const enabled = assignments.filter((a) => a.isEnabled !== false);
  const byId = new Map(agencyTypes.value.map((t) => [Number(t.id), t]));
  rows.value = enabled.map((a) => {
    const t = byId.get(Number(a.serviceTypeId)) || {};
    return {
      serviceTypeId: Number(a.serviceTypeId),
      label: t.label || `Type #${a.serviceTypeId}`,
      description: t.description || '',
      payBucket: t.payBucket || 'indirect',
      rateOverride: a.rateOverride != null ? String(a.rateOverride) : ''
    };
  });
};

const load = async () => {
  if (!props.agencyId || !props.userId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/users/${props.userId}/log-time-duties`, {
      params: { agencyId: props.agencyId }
    });
    buildRowsFromApi(resp.data || {});
    dirty.value = false;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load Log Time duties';
  } finally {
    loading.value = false;
  }
};

const openCatalog = () => {
  const selected = new Set();
  if (usingCustomList.value && rows.value.length) {
    rows.value.forEach((r) => selected.add(Number(r.serviceTypeId)));
  } else {
    agencyTypes.value.filter((t) => t.isActive).forEach((t) => selected.add(Number(t.id)));
  }
  catalogSelected.value = selected;
  showNewTypeForm.value = false;
  newTypeLabel.value = '';
  newTypeDescription.value = '';
  newTypePayBucket.value = 'indirect';
  newTypeError.value = '';
  showCatalog.value = true;
};

const createAndAssignType = async () => {
  const label = newTypeLabel.value.trim();
  if (!label || !props.agencyId) return;
  newTypeSaving.value = true;
  newTypeError.value = '';
  try {
    const resp = await api.post('/payroll/indirect-service-types', {
      agencyId: Number(props.agencyId),
      label,
      description: newTypeDescription.value.trim() || '',
      payBucket: newTypePayBucket.value,
      sortOrder: 200
    });
    const created = resp.data;
    if (created?.id) {
      agencyTypes.value = [...agencyTypes.value, created];
      catalogSelected.value = new Set([...catalogSelected.value, Number(created.id)]);
    }
    showNewTypeForm.value = false;
    newTypeLabel.value = '';
    newTypeDescription.value = '';
    newTypePayBucket.value = 'indirect';
  } catch (e) {
    newTypeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to create type';
  } finally {
    newTypeSaving.value = false;
  }
};

const toggleCatalog = (id, on) => {
  const next = new Set(catalogSelected.value);
  if (on) next.add(Number(id));
  else next.delete(Number(id));
  catalogSelected.value = next;
};

const applyCatalog = () => {
  const byId = new Map(agencyTypes.value.map((t) => [Number(t.id), t]));
  const existingRates = new Map(rows.value.map((r) => [Number(r.serviceTypeId), r.rateOverride]));
  rows.value = Array.from(catalogSelected.value).map((id) => {
    const t = byId.get(id) || {};
    return {
      serviceTypeId: id,
      label: t.label || `Type #${id}`,
      description: t.description || '',
      payBucket: t.payBucket || 'indirect',
      rateOverride: existingRates.get(id) ?? ''
    };
  });
  usingCustomList.value = true;
  dirty.value = true;
  showCatalog.value = false;
};

const removeRow = (id) => {
  rows.value = rows.value.filter((r) => Number(r.serviceTypeId) !== Number(id));
  dirty.value = true;
};

const save = async () => {
  if (!props.agencyId || !props.userId) return;
  saving.value = true;
  error.value = '';
  try {
    const selectedIds = new Set(rows.value.map((r) => Number(r.serviceTypeId)));
    const assignments = [];
    for (const t of agencyTypes.value) {
      const tid = Number(t.id);
      const row = rows.value.find((r) => Number(r.serviceTypeId) === tid);
      if (row) {
        assignments.push({
          serviceTypeId: tid,
          isEnabled: true,
          rateOverride: row.rateOverride !== '' && row.rateOverride != null ? Number(row.rateOverride) : null
        });
      } else if (usingCustomList.value && t.isActive) {
        assignments.push({ serviceTypeId: tid, isEnabled: false, rateOverride: null });
      } else if (usingCustomList.value && selectedIds.size && !selectedIds.has(tid) && !t.isActive) {
        // inactive agency types only stored when explicitly enabled via catalog
      }
    }
    const resp = await api.put(`/payroll/users/${props.userId}/log-time-duties`, {
      agencyId: props.agencyId,
      assignments
    });
    buildRowsFromApi({
      agencyTypes: agencyTypes.value,
      assignments: resp.data?.assignments || []
    });
    dirty.value = false;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

watch(() => [props.agencyId, props.userId], load, { immediate: true });
onMounted(load);
</script>

<style scoped>
.ltd-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border, #e2e8f0); }
.ltd-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.ltd-title { font-weight: 700; font-size: 15px; }
.ltd-hint { font-size: 13px; margin-top: 4px; max-width: 640px; }
.ltd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ltd-modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1200;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.ltd-modal {
  background: #fff; border-radius: 12px; width: min(560px, 96vw); max-height: 85vh;
  display: flex; flex-direction: column; padding: 16px; box-shadow: 0 12px 40px rgba(15,23,42,.18);
}
.ltd-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ltd-modal-head h3 { margin: 0; font-size: 1.05rem; }
.ltd-catalog { overflow: auto; margin: 12px 0; max-height: 50vh; display: flex; flex-direction: column; gap: 6px; }
.ltd-catalog-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 8px; cursor: pointer; }
.ltd-catalog-row:hover { background: #f8fafc; }
.ltd-catalog-label { flex: 1; font-size: 14px; }
.ltd-badge { font-size: 11px; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
.ltd-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.btn-link { background: none; border: none; color: var(--primary, #15803d); cursor: pointer; text-decoration: underline; padding: 0; }
.ltd-new-type {
  border-top: 1px dashed #e2e8f0;
  margin-top: 8px;
  padding-top: 10px;
}
.ltd-new-type-trigger { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ltd-new-type-form {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
}
.ltd-new-type-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; color: #0f172a; }
.ltd-new-type-fields { display: flex; flex-direction: column; gap: 8px; }
.ltd-new-type-field { display: flex; flex-direction: column; gap: 3px; }
.ltd-new-type-field label { font-size: 12px; font-weight: 600; color: #374151; }
.ltd-new-type-input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: #fff;
  color: #111827;
}
.ltd-new-type-input:focus { outline: 2px solid #15803d; outline-offset: 1px; }
.ltd-new-type-actions { display: flex; gap: 8px; margin-top: 10px; }
.required { color: #dc2626; }
</style>
