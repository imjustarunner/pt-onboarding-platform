<template>
  <div class="agency-npis">
    <div class="toolbar">
      <p class="muted">
        Group (Type-2) NPIs for this agency — typically one per office location. Each can be credentialed with payers
        the same way as an individual provider.
      </p>
      <button class="btn btn-primary btn-sm" type="button" :disabled="!agencyId || creating" @click="startCreate">
        + Add group NPI
      </button>
    </div>

    <div v-if="createOpen" class="create-card">
      <h4>New group NPI</h4>
      <div class="form-grid">
        <div class="form-group">
          <label>Label</label>
          <input v-model.trim="draft.label" type="text" placeholder="e.g. Main office, Aurora" />
        </div>
        <div class="form-group">
          <label>NPI number</label>
          <input v-model.trim="draft.npiNumber" type="text" maxlength="10" inputmode="numeric" placeholder="10-digit NPI" />
        </div>
        <div class="form-group">
          <label>Taxonomy</label>
          <input v-model.trim="draft.taxonomyCode" type="text" placeholder="e.g. 261QM0801X" />
        </div>
        <div class="form-group">
          <label>Medicaid provider type</label>
          <input v-model.trim="draft.medicaidProviderType" type="text" placeholder="e.g. Behavioral Health" />
        </div>
        <div class="form-group">
          <label>Office / location</label>
          <select v-model.number="draft.officeLocationId">
            <option :value="0">— None —</option>
            <option v-for="o in offices" :key="o.id" :value="o.id">{{ officeLabel(o) }}</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Notes</label>
          <textarea v-model.trim="draft.notes" rows="2" placeholder="Notes for this group NPI…" />
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" type="button" :disabled="creating" @click="createOpen = false">Cancel</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="creating || !canCreate" @click="createNpi">
          {{ creating ? 'Saving…' : 'Save group NPI' }}
        </button>
        <span v-if="createError" class="error-inline">{{ createError }}</span>
      </div>
    </div>

    <div v-if="loading" class="muted">Loading agency NPIs…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!rows.length" class="empty muted">
      No group NPIs yet. Add one for each location or billing entity that needs its own NPI.
    </div>

    <div v-else class="npi-list">
      <div v-for="row in rows" :key="row.id" class="npi-card" :class="{ inactive: !row.is_active }">
        <div class="npi-head">
          <div class="npi-title">
            <strong>{{ row.label || `Group NPI ${row.npi_number}` }}</strong>
            <span class="npi-num">{{ row.npi_number }}</span>
            <span v-if="!row.is_active" class="badge inactive">Inactive</span>
            <span class="badge payers">{{ row.payer_credential_count || 0 }} payers</span>
          </div>
          <div class="npi-actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="toggleEdit(row)">
              {{ editingId === row.id ? 'Close' : 'Edit' }}
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click="togglePayers(row)">
              {{ expandedId === row.id ? 'Hide payers' : 'Payers' }}
            </button>
            <button class="btn btn-danger btn-sm" type="button" :disabled="row.deleting" @click="removeNpi(row)">
              Remove
            </button>
          </div>
        </div>

        <div class="npi-meta muted">
          <span v-if="row.office_location_name">Location: {{ row.office_location_name }}</span>
          <span v-else>No location linked</span>
          <span v-if="row.taxonomy_code">· Taxonomy {{ row.taxonomy_code }}</span>
          <span v-if="row.medicaid_provider_type">· Medicaid {{ row.medicaid_provider_type }}</span>
        </div>

        <div v-if="editingId === row.id" class="edit-block">
          <div class="form-grid">
            <div class="form-group">
              <label>Label</label>
              <input v-model.trim="row.edit.label" type="text" />
            </div>
            <div class="form-group">
              <label>NPI number</label>
              <input v-model.trim="row.edit.npiNumber" type="text" maxlength="10" inputmode="numeric" />
            </div>
            <div class="form-group">
              <label>Taxonomy</label>
              <input v-model.trim="row.edit.taxonomyCode" type="text" />
            </div>
            <div class="form-group">
              <label>Medicaid provider type</label>
              <input v-model.trim="row.edit.medicaidProviderType" type="text" />
            </div>
            <div class="form-group">
              <label>Office / location</label>
              <select v-model.number="row.edit.officeLocationId">
                <option :value="0">— None —</option>
                <option v-for="o in offices" :key="o.id" :value="o.id">{{ officeLabel(o) }}</option>
              </select>
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <textarea v-model.trim="row.edit.notes" rows="2" />
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" type="button" :disabled="row.saving" @click="saveNpi(row)">
              {{ row.saving ? 'Saving…' : 'Save' }}
            </button>
            <span v-if="row.message" class="muted">{{ row.message }}</span>
            <span v-if="row.error" class="error-inline">{{ row.error }}</span>
          </div>
        </div>

        <div v-if="expandedId === row.id" class="payers-wrap">
          <AgencyGroupNpiPayerCredentialsPanel
            :agency-id="agencyId"
            :group-npi-id="row.id"
            @changed="onPayersChanged"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import AgencyGroupNpiPayerCredentialsPanel from './AgencyGroupNpiPayerCredentialsPanel.vue';

const props = defineProps({
  agencyId: { type: Number, required: true }
});

const loading = ref(false);
const creating = ref(false);
const error = ref('');
const createError = ref('');
const createOpen = ref(false);
const rows = ref([]);
const offices = ref([]);
const editingId = ref(null);
const expandedId = ref(null);

const draft = reactive({
  label: '',
  npiNumber: '',
  taxonomyCode: '',
  medicaidProviderType: '',
  officeLocationId: 0,
  notes: ''
});

const canCreate = computed(() => /^\d{10}$/.test(String(draft.npiNumber || '').trim()));

const officeLabel = (o) => {
  const bits = [o.name];
  if (o.city || o.state) bits.push([o.city, o.state].filter(Boolean).join(', '));
  return bits.join(' — ');
};

const mapRow = (r) => ({
  ...r,
  is_active: !!r.is_active,
  deleting: false,
  saving: false,
  message: '',
  error: '',
  edit: {
    label: r.label || '',
    npiNumber: r.npi_number || '',
    taxonomyCode: r.taxonomy_code || '',
    medicaidProviderType: r.medicaid_provider_type || '',
    officeLocationId: Number(r.office_location_id || 0),
    notes: r.notes || ''
  }
});

const load = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${props.agencyId}/credentialing/group-npis`);
    offices.value = res.data?.offices || [];
    rows.value = (res.data?.groupNpis || []).map(mapRow);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load agency group NPIs';
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

const startCreate = () => {
  draft.label = '';
  draft.npiNumber = '';
  draft.taxonomyCode = '';
  draft.medicaidProviderType = '';
  draft.officeLocationId = 0;
  draft.notes = '';
  createError.value = '';
  createOpen.value = true;
};

const createNpi = async () => {
  if (!canCreate.value) return;
  creating.value = true;
  createError.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/credentialing/group-npis`, {
      label: draft.label || null,
      npiNumber: draft.npiNumber,
      taxonomyCode: draft.taxonomyCode || null,
      medicaidProviderType: draft.medicaidProviderType || null,
      officeLocationId: draft.officeLocationId || null,
      notes: draft.notes || null
    });
    createOpen.value = false;
    await load();
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create group NPI';
  } finally {
    creating.value = false;
  }
};

const toggleEdit = (row) => {
  editingId.value = editingId.value === row.id ? null : row.id;
};

const togglePayers = (row) => {
  expandedId.value = expandedId.value === row.id ? null : row.id;
};

const saveNpi = async (row) => {
  if (!/^\d{10}$/.test(String(row.edit.npiNumber || '').trim())) {
    row.error = 'NPI must be 10 digits';
    return;
  }
  row.saving = true;
  row.error = '';
  row.message = '';
  try {
    await api.patch(`/agencies/${props.agencyId}/credentialing/group-npis/${row.id}`, {
      label: row.edit.label || null,
      npiNumber: row.edit.npiNumber,
      taxonomyCode: row.edit.taxonomyCode || null,
      medicaidProviderType: row.edit.medicaidProviderType || null,
      officeLocationId: row.edit.officeLocationId || null,
      notes: row.edit.notes || null
    });
    row.message = 'Saved.';
    await load();
    editingId.value = row.id;
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    row.saving = false;
  }
};

const removeNpi = async (row) => {
  if (!confirm(`Remove group NPI ${row.npi_number}? Payer credentials for this NPI will be removed.`)) return;
  row.deleting = true;
  try {
    await api.delete(`/agencies/${props.agencyId}/credentialing/group-npis/${row.id}?hard=true`);
    if (expandedId.value === row.id) expandedId.value = null;
    if (editingId.value === row.id) editingId.value = null;
    await load();
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Failed to remove';
  } finally {
    row.deleting = false;
  }
};

const onPayersChanged = async () => {
  await load();
};

watch(
  () => props.agencyId,
  () => {
    createOpen.value = false;
    editingId.value = null;
    expandedId.value = null;
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.agency-npis {
  padding-top: 4px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.muted {
  color: #64748b;
  font-size: 13px;
  margin: 0;
}
.create-card,
.npi-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}
.npi-card.inactive {
  opacity: 0.7;
}
.npi-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.npi-title {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.npi-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: #0f766e;
  font-weight: 700;
}
.badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #f1f5f9;
  color: #334155;
}
.badge.payers {
  background: #ecfdf5;
  color: #065f46;
}
.badge.inactive {
  background: #fee2e2;
  color: #b91c1c;
}
.npi-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.npi-meta {
  margin-top: 6px;
  font-size: 12px;
}
.edit-block,
.payers-wrap {
  margin-top: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.form-group.full {
  grid-column: 1 / -1;
}
.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 4px;
}
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.error,
.error-inline {
  color: #b91c1c;
  font-size: 13px;
}
.empty {
  padding: 8px 0;
}
@media (max-width: 800px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
